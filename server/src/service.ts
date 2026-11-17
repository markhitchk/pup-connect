import { createServer } from "node:http";
import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import {
  clientPacket,
  type IceServer,
  type RoomSession,
} from "../../shared/protocol.js";
interface Peer {
  id: string;
  name: string;
  token: string;
  socket?: WebSocket;
}
interface Room {
  id: string;
  code: string;
  invite: string;
  host: Peer;
  guest?: Peer;
  expiresAt: number;
  idleAt: number;
  locked: boolean;
}
export interface Config {
  ttlMs: number;
  idleMs: number;
  heartbeatMs: number;
  approvalMs: number;
  stun: string[];
  turn: string[];
  turnSecret?: string;
  turnTtl: number;
  maxRooms: number;
  maxConnections: number;
  trustProxy: boolean;
  origins: string[];
}
export const defaults: Config = {
  ttlMs: 86400000,
  idleMs: 600000,
  heartbeatMs: 25000,
  approvalMs: 30000,
  stun: [],
  turn: [],
  turnTtl: 600,
  maxRooms: 1000,
  maxConnections: 2000,
  trustProxy: false,
  origins: [],
};
export function issueIce(
  config: Config,
  peerId: string,
  now = Date.now()
): IceServer[] {
  const ice: IceServer[] = config.stun.map((url) => ({ urls: url }));
  if (config.turn.length && config.turnSecret) {
    const username = `${Math.floor(now / 1000) + config.turnTtl}:${peerId}`;
    ice.push({
      urls: config.turn,
      username,
      credential: createHmac("sha1", config.turnSecret)
        .update(username)
        .digest("base64"),
    });
  }
  return ice;
}
const secret = () => randomBytes(32).toString("hex");
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createSignaling(overrides: Partial<Config> = {}) {
  const config = { ...defaults, ...overrides };
  if (config.turn.length && !config.turnSecret)
    throw Error("TURN_SHARED_SECRET is required with TURN_URLS");
  const rooms = new Map<string, Room>(),
    tokens = new Map<string, { room: Room; peer: Peer }>();
  const clients = new Map<
    WebSocket,
    { ip: string; room?: Room; peer?: Peer; alive: boolean; pending?: string }
  >();
  const pending = new Map<
    string,
    { socket: WebSocket; room: Room; name: string; until: number }
  >();
  const rates = new Map<string, { count: number; reset: number }>();
  function limited(key: string, max: number, window = 60000) {
    const now = Date.now();
    if (!rates.has(key) && rates.size >= 10000) return true;
    let r = rates.get(key);
    if (!r || r.reset < now) {
      r = { count: 0, reset: now + window };
      rates.set(key, r);
    }
    return ++r.count > max;
  }
  const send = (s: WebSocket | undefined, v: unknown) => {
    if (s?.readyState === WebSocket.OPEN) s.send(JSON.stringify(v));
  };
  const error = (s: WebSocket, code: string, message: string) =>
    send(s, { type: "error", code, message });
  function peers(r: Room) {
    return [r.host, ...(r.guest ? [r.guest] : [])].map((p) => ({
      id: p.id,
      name: p.name,
      online: p.socket?.readyState === WebSocket.OPEN,
    }));
  }
  function broadcast(r: Room) {
    for (const p of [r.host, r.guest])
      send(p?.socket, { type: "presence", peers: peers(r), locked: r.locked });
  }
  function removePending(key: string, reason?: string) {
    const p = pending.get(key);
    if (p) {
      pending.delete(key);
      const c = clients.get(p.socket);
      if (c) c.pending = undefined;
      if (reason) error(p.socket, "admission", reason);
    }
  }
  function closeRoom(r: Room, reason: string) {
    rooms.delete(r.code);
    for (const [key, p] of pending)
      if (p.room === r) removePending(key, "Room closed.");
    for (const p of [r.host, r.guest])
      if (p) {
        tokens.delete(p.token);
        send(p.socket, { type: "closed", reason });
        const c = p.socket && clients.get(p.socket);
        if (c) {
          c.room = undefined;
          c.peer = undefined;
        }
        p.socket = undefined;
      }
  }
  function bind(s: WebSocket, r: Room, p: Peer) {
    const c = clients.get(s)!;
    if (p.socket && p.socket !== s) {
      error(s, "duplicate", "This room session is already connected.");
      return;
    }
    c.room = r;
    c.peer = p;
    p.socket = s;
    r.idleAt = Date.now();
    const room: RoomSession = {
      id: r.id,
      code: r.code,
      peerId: p.id,
      role: r.host === p ? "host" : "guest",
      token: p.token,
      invite: r.invite,
      expiresAt: r.expiresAt,
      locked: r.locked,
      peers: peers(r),
      iceServers: issueIce(config, p.id),
    };
    send(s, { type: "room", room });
    broadcast(r);
  }
  function admit(s: WebSocket, r: Room, name: string) {
    const p: Peer = { id: randomUUID(), name, token: secret() };
    r.guest = p;
    tokens.set(p.token, { room: r, peer: p });
    bind(s, r, p);
  }
  const http = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end('{"status":"ok"}');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 80 * 1024,
    perMessageDeflate: false,
  });
  http.on("upgrade", (req, socket, head) => {
    const ip = config.trustProxy
      ? String(req.headers["x-forwarded-for"] || req.socket.remoteAddress)
          .split(",")
          .at(-1)!
          .trim()
      : req.socket.remoteAddress || "unknown";
    if (
      req.url !== "/ws" ||
      clients.size >= config.maxConnections ||
      limited("connect:" + ip, 30) ||
      (req.headers.origin && !config.origins.includes(req.headers.origin))
    ) {
      socket.write(
        "HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n"
      );
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (s) => wss.emit("connection", s, ip));
  });
  wss.on("connection", (s: WebSocket, ip: string) => {
    clients.set(s, { ip, alive: true });
    s.on("error", () => {});
    s.on("pong", () => {
      const c = clients.get(s);
      if (c) c.alive = true;
    });
    s.on("message", (raw) => {
      const c = clients.get(s)!;
      if (limited("packet:" + ip, 600)) {
        s.close(1008, "Rate limit");
        return;
      }
      let parsed;
      try {
        parsed = clientPacket.safeParse(JSON.parse(raw.toString()));
      } catch {
        error(s, "invalid", "Invalid packet.");
        return;
      }
      if (!parsed.success) {
        error(s, "invalid", "Invalid packet.");
        return;
      }
      const m = parsed.data;
      if (["create", "join", "resume"].includes(m.type)) {
        if (c.room || c.pending) {
          error(s, "session", "Leave the current room first.");
          return;
        }
        if (limited("admit:" + ip, 20, 600000)) {
          error(s, "rate", "Too many attempts. Try later.");
          return;
        }
      }
      if (m.type === "create") {
        if (rooms.size >= config.maxRooms) {
          error(s, "capacity", "Room capacity reached.");
          return;
        }
        let code: string;
        do {
          code = String(randomInt(1000000)).padStart(6, "0");
        } while (rooms.has(code));
        const host: Peer = { id: randomUUID(), name: m.name, token: secret() };
        const r: Room = {
          id: randomUUID(),
          code,
          invite: secret(),
          host,
          expiresAt: Date.now() + config.ttlMs,
          idleAt: Date.now(),
          locked: false,
        };
        rooms.set(code, r);
        tokens.set(host.token, { room: r, peer: host });
        bind(s, r, host);
        return;
      }
      if (m.type === "resume") {
        const found = tokens.get(m.token);
        if (!found || found.room.expiresAt < Date.now()) {
          error(s, "expired", "Room session expired.");
          return;
        }
        bind(s, found.room, found.peer);
        return;
      }
      if (m.type === "join") {
        const r = rooms.get(m.code);
        if (!r || r.expiresAt < Date.now() || r.locked || r.guest) {
          error(s, "unavailable", "Room unavailable.");
          return;
        }
        if (m.invite && equal(r.invite, m.invite)) {
          admit(s, r, m.name);
          return;
        }
        if (!r.host.socket || [...pending.values()].some((p) => p.room === r)) {
          error(s, "unavailable", "Room unavailable.");
          return;
        }
        const requestId = randomUUID();
        pending.set(requestId, {
          socket: s,
          room: r,
          name: m.name,
          until: Date.now() + config.approvalMs,
        });
        c.pending = requestId;
        send(s, { type: "waiting" });
        send(r.host.socket, { type: "pending", requestId, name: m.name });
        return;
      }
      const r = c.room,
        p = c.peer;
      if (!r || !p) {
        error(s, "auth", "Join a room first.");
        return;
      }
      if (r.expiresAt < Date.now()) {
        closeRoom(r, "Room expired.");
        return;
      }
      if (m.type === "signal") {
        const other = r.host === p ? r.guest : r.host;
        if (!other?.socket) {
          error(s, "offline", "Peer is offline.");
          return;
        }
        send(other.socket, { type: "signal", payload: m.payload });
        return;
      }
      if (m.type === "ice-config") {
        send(s, { type: "ice-config", iceServers: issueIce(config, p.id) });
        return;
      }
      if (m.type === "leave") {
        closeRoom(
          r,
          r.host === p ? "Host closed the room." : "Peer left the room."
        );
        return;
      }
      if (r.host !== p) {
        error(s, "forbidden", "Only the host can do this.");
        return;
      }
      if (m.type === "approve") {
        const q = pending.get(m.requestId);
        if (!q || q.room !== r) return;
        removePending(m.requestId);
        if (
          m.allow &&
          !r.guest &&
          !r.locked &&
          q.until >= Date.now() &&
          q.socket.readyState === WebSocket.OPEN
        )
          admit(q.socket, r, q.name);
        else error(q.socket, "admission", "Join request declined.");
        return;
      }
      if (m.type === "lock") {
        r.locked = m.locked;
        broadcast(r);
        return;
      }
      if (m.type === "close") closeRoom(r, "Host closed the room.");
    });
    s.on("close", () => {
      const c = clients.get(s);
      if (c?.pending) removePending(c.pending);
      if (c?.peer?.socket === s) {
        c.peer.socket = undefined;
        if (c.room) {
          if (!c.room.host.socket && !c.room.guest?.socket)
            c.room.idleAt = Date.now();
          broadcast(c.room);
        }
      }
      clients.delete(s);
    });
  });
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [s, c] of clients) {
      if (!c.alive) {
        s.terminate();
        continue;
      }
      c.alive = false;
      s.ping();
    }
    for (const r of rooms.values())
      if (
        r.expiresAt < now ||
        (!r.host.socket && !r.guest?.socket && r.idleAt + config.idleMs < now)
      )
        closeRoom(r, "Room expired.");
    for (const [key, p] of pending)
      if (p.until < now) removePending(key, "Join request expired.");
    for (const [key, v] of rates) if (v.reset < now) rates.delete(key);
  }, config.heartbeatMs);
  timer.unref();
  return {
    http,
    wss,
    async stop() {
      clearInterval(timer);
      for (const s of clients.keys()) s.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
