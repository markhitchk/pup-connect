import {
  reconnectDelay,
  serverPacket,
  type ClientPacket,
} from "../../shared/protocol";
export function validateEndpoint(raw: string): string {
  const u = new URL(raw.trim());
  if (u.protocol !== "wss:" || u.username || u.password || u.search || u.hash)
    throw Error("Enter a secure wss:// signaling URL without credentials.");
  return u.toString();
}
export class Signaling {
  private socket?: WebSocket;
  private retry?: ReturnType<typeof setTimeout>;
  private timeout?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private online = true;
  private stopped = true;
  endpoint = "";
  token?: string;
  private command?: ClientPacket;
  constructor(
    private receive: (packet: ReturnType<typeof serverPacket.parse>) => void,
    private state: (status: "Offline" | "Connecting" | "Reconnecting") => void,
    private fail: (message: string) => void
  ) {}
  start(endpoint: string, command: ClientPacket) {
    this.stop();
    this.endpoint = validateEndpoint(endpoint);
    this.command = command;
    this.token = command.type === "resume" ? command.token : undefined;
    this.stopped = false;
    this.attempt = 0;
    this.open();
  }
  private open() {
    if (this.stopped || !this.online) return;
    this.state(this.attempt ? "Reconnecting" : "Connecting");
    const s = new WebSocket(this.endpoint);
    this.socket = s;
    this.timeout = setTimeout(() => s.close(), 15000);
    s.onopen = () => {
      if (this.socket !== s) return;
      clearTimeout(this.timeout);
      if (this.command) this.send(this.command);
      else if (this.token) this.send({ type: "resume", token: this.token });
    };
    s.onmessage = (e) => {
      if (this.socket !== s) return;
      let packet;
      try {
        packet = serverPacket.parse(JSON.parse(String(e.data)));
      } catch {
        this.fail("The signaling service sent an invalid response.");
        return;
      }
      if (packet.type === "room") {
        this.token = packet.room.token;
        this.command = undefined;
        this.attempt = 0;
      }
      if (packet.type === "error") {
        if (packet.code === "expired") {
          this.token = undefined;
          this.stop();
        } else if (packet.code === "duplicate") {
          s.close();
        } else if (!this.token) {
          this.stop();
        }
        this.fail(packet.message);
      }
      if (packet.type === "closed") {
        this.token = undefined;
        this.stop();
      }
      this.receive(packet);
    };
    s.onerror = () => {};
    s.onclose = () => {
      if (this.socket !== s) return;
      clearTimeout(this.timeout);
      this.socket = undefined;
      if (!this.stopped) {
        this.state("Reconnecting");
        this.retry = setTimeout(() => {
          this.attempt++;
          this.open();
        }, reconnectDelay(this.attempt));
      }
    };
  }
  send(packet: ClientPacket): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(packet));
    return true;
  }
  setNetwork(online: boolean) {
    this.online = online;
    if (!online) {
      clearTimeout(this.retry);
      this.socket?.close();
      this.state("Offline");
    } else if (!this.stopped && !this.socket) {
      clearTimeout(this.retry);
      this.open();
    }
  }
  reconnect() {
    if (this.stopped) return;
    clearTimeout(this.retry);
    clearTimeout(this.timeout);
    const s = this.socket;
    this.socket = undefined;
    s?.close();
    this.open();
  }
  stop() {
    this.stopped = true;
    this.command = undefined;
    this.token = undefined;
    clearTimeout(this.retry);
    clearTimeout(this.timeout);
    const s = this.socket;
    this.socket = undefined;
    s?.close();
    this.state("Offline");
  }
}
