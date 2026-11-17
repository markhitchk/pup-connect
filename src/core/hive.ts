import { DeviceEventEmitter } from "react-native";
import { Worklet } from "react-native-bare-kit";
import { Buffer } from "buffer";
import type { IPC } from "bare-stow-host";
import worker from "../../hive/generated";
import {
  clientPacket,
  serverPacket,
  type ClientPacket,
} from "../../shared/protocol";
import { native, vault } from "./native";

export const DEFAULT_STUN =
  "stun:stun.l.google.com:19302\nstun:stun.cloudflare.com:3478";
export function parseStun(raw: string) {
  const urls = raw
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (
    urls.length > 8 ||
    urls.some((x) => {
      const m =
        /^(stuns?):(\[[a-fA-F0-9:]+\]|[a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?$/.exec(
          x
        );
      return (
        !m || (m[3] !== undefined && (Number(m[3]) < 1 || Number(m[3]) > 65535))
      );
    })
  )
    throw Error(
      "Enter up to eight STUN addresses, one per line. Leave empty for local connections."
    );
  return urls.map((urls) => ({ urls }));
}
let identity: Promise<string> | undefined;
function loadIdentity() {
  if (!identity)
    identity = (async () => {
      let seed = await vault.get<string>("hive:seed");
      if (!seed) {
        seed = native.randomSecret();
        await vault.set("hive:seed", seed);
      }
      return seed;
    })().catch((e) => {
      identity = undefined;
      throw e;
    });
  return identity;
}
export class HiveSignaling {
  private ipc?: IPC;
  private initializing?: Promise<IPC>;
  private generation = 0;
  private stopped = true;
  private online = true;
  private foreground = true;
  private command?: ClientPacket;
  private buffer = Buffer.alloc(0);
  private discovery?: { remove(): void };
  private stun = DEFAULT_STUN;
  private publicDiscovery = true;
  token?: string;
  constructor(
    private receive: (p: ReturnType<typeof serverPacket.parse>) => void,
    private state: (p: "Offline" | "Connecting" | "Reconnecting") => void,
    private fail: (message: string) => void
  ) {}
  configure(stun: string, publicDiscovery = true) {
    parseStun(stun);
    this.stun = stun;
    this.publicDiscovery = publicDiscovery;
  }
  keepAlive(active: boolean) {
    this.foreground = active;
    Worklet.update(active ? "active" : "background");
  }
  private write(p: unknown) {
    if (!this.ipc || this.ipc.destroyed) return false;
    const raw = JSON.stringify(p) + "\n";
    if (Buffer.byteLength(raw) > 131072) return false;
    this.ipc.write(Buffer.from(raw));
    return true;
  }
  private async ensure(generation: number): Promise<IPC> {
    if (this.ipc && !this.ipc.destroyed) return this.ipc;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      const seed = await loadIdentity();
      const snapshot = await vault.get("hive:snapshot");
      const { ipc } = await worker.start({
        timeout: 15000,
        grace: 2000,
        memoryLimit: 128 * 1024 * 1024,
      });
      ipc.on("error", () => {
        if (generation === this.generation && !this.stopped) {
          this.fail("The hive connection stopped. Reconnect or try again.");
          this.state("Reconnecting");
        }
      });
      if (generation !== this.generation || this.stopped) {
        void ipc.terminate();
        throw Error("Hive connection cancelled");
      }
      this.ipc = ipc;
      this.buffer = Buffer.alloc(0);
      ipc.on("data", (chunk: unknown) => {
        if (chunk instanceof Uint8Array) this.read(chunk, generation);
      });
      this.discovery = DeviceEventEmitter.addListener(
        "pupHivePeer",
        (raw: string) => {
          try {
            const p = JSON.parse(raw);
            if (p.host && p.port)
              this.write({ type: "peer", host: p.host, port: p.port });
          } catch {}
        }
      );
      this.write({
        type: "init",
        seed,
        snapshot,
        iceServers: this.publicDiscovery ? parseStun(this.stun) : [],
        ...(this.publicDiscovery ? {} : { bootstrap: [] }),
      });
      Worklet.update(this.foreground ? "active" : "background");
      return ipc;
    })();
    try {
      return await this.initializing;
    } finally {
      this.initializing = undefined;
    }
  }
  private read(chunk: Uint8Array, generation: number) {
    if (generation !== this.generation || this.stopped) return;
    if (this.buffer.length + chunk.length > 262144) {
      this.fail("Invalid hive response.");
      this.stop();
      return;
    }
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    let end: number;
    while ((end = this.buffer.indexOf(10)) !== -1) {
      const line = this.buffer.subarray(0, end);
      this.buffer = Buffer.from(this.buffer.subarray(end + 1));
      if (line.length > 131072) continue;
      let p;
      try {
        p = JSON.parse(Buffer.from(line).toString("utf8"));
      } catch {
        continue;
      }
      if (p.type === "ready") continue;
      if (p.type === "persist") {
        void vault.set("hive:snapshot", p.snapshot).then(
          () => {
            if (generation === this.generation)
              this.write({ type: "persisted", id: p.id, ok: true });
          },
          () => {
            if (generation === this.generation)
              this.write({ type: "persisted", id: p.id, ok: false });
          }
        );
        continue;
      }
      if (p.type === "discovery-port") {
        native.hiveStart(p.port);
        continue;
      }
      if (p.type === "status") {
        this.state("Reconnecting");
        continue;
      }
      const parsed = serverPacket.safeParse(p);
      if (!parsed.success) {
        this.fail("A peer sent an invalid hive response.");
        continue;
      }
      const packet = parsed.data;
      if (packet.type === "room") this.token = packet.room.token;
      if (packet.type === "error") this.fail(packet.message);
      this.receive(packet);
    }
  }
  start(_endpoint: string, command: ClientPacket) {
    this.shutdown();
    this.stopped = false;
    this.command = command;
    this.token = command.type === "resume" ? command.token : undefined;
    if (!this.online) {
      this.state("Offline");
      return;
    }
    const generation = this.generation;
    this.state("Connecting");
    void this.ensure(generation)
      .then(() => {
        if (generation === this.generation && !this.stopped)
          this.write(command);
      })
      .catch(() => {
        if (generation === this.generation && !this.stopped)
          this.fail("Unable to start the hive. Try again.");
      });
  }
  send(packet: ClientPacket): boolean {
    return !!clientPacket.safeParse(packet).success && this.write(packet);
  }
  reconnect() {
    if (this.stopped || !this.online || !this.command) return;
    this.start(
      "",
      this.token ? { type: "resume", token: this.token } : this.command
    );
  }
  setNetwork(online: boolean) {
    this.online = online;
    if (!online) {
      this.shutdown();
      this.state("Offline");
    } else this.reconnect();
  }
  private shutdown() {
    this.generation++;
    this.discovery?.remove();
    this.discovery = undefined;
    native.hiveStop();
    const ipc = this.ipc;
    this.ipc = undefined;
    this.initializing = undefined;
    if (ipc) void ipc.terminate().catch(() => {});
  }
  stop() {
    this.stopped = true;
    this.command = undefined;
    this.token = undefined;
    this.shutdown();
    this.state("Offline");
  }
}
