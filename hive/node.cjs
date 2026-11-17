"use strict";
const Hyperswarm = require("hyperswarm");
const crypto = require("hypercore-crypto");
const b4a = require("b4a");
const MAX_FRAME = 131072;
const keyPattern = /^[a-f0-9]{64}$/;
const codePattern = /^\d{6}$/;
const uuid = () => {
  const x = crypto.randomBytes(16);
  x[6] = (x[6] & 15) | 64;
  x[8] = (x[8] & 63) | 128;
  const h = b4a.toString(x, "hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20
  )}-${h.slice(20)}`;
};
const randomToken = () => b4a.toString(crypto.randomBytes(32), "hex");
const code = () => {
  let x;
  do {
    x = b4a.readUInt32LE(crypto.randomBytes(4), 0);
  } while (x >= 4294000000);
  return String(x % 1000000).padStart(6, "0");
};
const equal = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
const topic = (value) =>
  crypto.hash(b4a.from("pup-connect/hive/room/v1/" + value));
const clone = (x) => JSON.parse(JSON.stringify(x));
const validName = (x) =>
  typeof x === "string" && x.trim().length > 0 && x.length <= 40;

class HiveNode {
  constructor(options) {
    if (!keyPattern.test(options.seed))
      throw Error("Invalid local hive identity");
    this.emit = options.emit;
    this.persist = options.persist || (async () => {});
    this.iceServers = options.iceServers || [];
    this.keyPair = crypto.keyPair(b4a.from(options.seed, "hex"));
    this.key = b4a.toString(this.keyPair.publicKey, "hex");
    this.id = this.peerId(this.key);
    this.saved =
      options.snapshot?.version === 1
        ? clone(options.snapshot)
        : { version: 1 };
    this.name = options.name || "Local_Pup";
    this.sockets = new Map();
    this.pending = new Map();
    this.rates = new Map();
    this.discovery = undefined;
    this.stopped = false;
    this.queue = Promise.resolve();
    this.swarm =
      options.swarm ||
      new Hyperswarm({
        keyPair: this.keyPair,
        maxPeers: 8,
        ...(options.bootstrap ? { bootstrap: options.bootstrap } : {}),
      });
    this.swarm.on("connection", (socket) => this.bind(socket));
    // Errors expose only an actionable generic status, never addresses, SDP or tokens.
    this.swarm.on("error", () =>
      this.emit({ type: "status", status: "Reconnecting" })
    );
    this.swarm.dht.on("listening", () => {
      const address = this.swarm.dht.address();
      if (address) this.emit({ type: "discovery-port", port: address.port });
    });
    this.timer = setInterval(() => this.run(() => this.tick()), 1000);
    this.timer.unref?.();
  }
  peerId(key) {
    const h = b4a.toString(crypto.hash(b4a.from(key, "hex")), "hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(
      17,
      20
    )}-${h.slice(20, 32)}`;
  }
  run(action) {
    this.queue = this.queue
      .then(() => {
        if (!this.stopped) return action();
      })
      .catch(() => {
        this.emit({
          type: "error",
          code: "hive",
          message:
            "Hive operation failed. Check your connection and try again.",
        });
      });
    return this.queue;
  }
  async save(next) {
    await this.persist(clone(next));
    this.saved = next;
  }
  limited(key) {
    const now = Date.now();
    if (this.rates.size >= 256 && !this.rates.has(key)) return true;
    const r = this.rates.get(key);
    if (!r || r.until < now) {
      this.rates.set(key, { count: 1, until: now + 60000 });
      return false;
    }
    return ++r.count > 120;
  }
  wire(key, packet) {
    const socket = this.sockets.get(key);
    if (!socket || socket.destroyed || socket.writableLength > 262144)
      return false;
    const data = JSON.stringify(packet);
    if (b4a.byteLength(data) > MAX_FRAME) return false;
    socket.write(b4a.from(data + "\n"));
    return true;
  }
  error(key, message) {
    this.wire(key, { type: "error", code: "admission", message });
    setTimeout(() => this.sockets.get(key)?.destroy(), 250);
  }
  bind(socket) {
    const key = b4a.toString(socket.remotePublicKey, "hex");
    if (this.stopped || this.sockets.size >= 8 || this.sockets.has(key)) {
      socket.destroy();
      return;
    }
    this.sockets.set(key, socket);
    let buffered = b4a.alloc(0);
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      if (buffered.length + chunk.length > MAX_FRAME * 2) {
        socket.destroy();
        return;
      }
      buffered = b4a.concat([buffered, chunk]);
      let i;
      while ((i = buffered.indexOf(10)) !== -1) {
        const line = buffered.subarray(0, i);
        buffered = buffered.subarray(i + 1);
        if (line.length > MAX_FRAME || this.limited(key)) {
          socket.destroy();
          return;
        }
        let p;
        try {
          p = JSON.parse(b4a.toString(line));
        } catch {
          socket.destroy();
          return;
        }
        this.run(() => this.receive(key, p));
      }
      if (buffered.length > MAX_FRAME) socket.destroy();
    });
    socket.on("close", () => {
      if (this.sockets.get(key) !== socket) return;
      this.sockets.delete(key);
      if (!this.stopped) {
        this.presence();
        if (this.saved.target?.key === key)
          this.emit({ type: "status", status: "Reconnecting" });
      }
    });
    const target = this.saved.target;
    if (target && (!target.key || target.key === key)) {
      this.wire(
        key,
        target.token
          ? { type: "resume", token: target.token }
          : {
              type: "join",
              code: target.code,
              name: this.name,
              invite: target.invite,
            }
      );
    }
    this.presence();
  }
  async listen() {
    // Shared DHT routing peers discover endpoints. No Pup Connect room server is used.
    this.swarm
      .listen()
      .catch(() => this.emit({ type: "status", status: "Reconnecting" }));
  }
  async discover(value, host, key) {
    if (this.discovery) {
      await this.discovery.destroy();
      this.discovery = undefined;
    }
    if (key) this.swarm.joinPeer(b4a.from(key, "hex"));
    if (host || !key)
      this.discovery = this.swarm.join(topic(value), {
        server: host,
        client: !host,
      });
    await this.listen();
  }
  session(room, member) {
    return {
      id: room.id,
      code: room.code,
      peerId: member.id,
      role: member.key === room.host.key ? "host" : "guest",
      token: member.token,
      invite: room.invite,
      expiresAt: room.expiresAt,
      locked: room.locked,
      peers: [room.host, ...(room.guest ? [room.guest] : [])].map((p) => ({
        id: p.id,
        name: p.name,
        online: p.key === this.key || this.sockets.has(p.key),
      })),
      iceServers: this.iceServers,
      hiveHost: room.host.key,
    };
  }
  presence() {
    const room = this.saved.own;
    if (!room) return;
    const session = this.session(room, room.host);
    this.emit({ type: "presence", peers: session.peers, locked: room.locked });
    if (room.guest)
      this.wire(room.guest.key, {
        type: "presence",
        peers: session.peers,
        locked: room.locked,
      });
  }
  async admit(key, name) {
    const room = clone(this.saved.own);
    room.guest = { key, id: this.peerId(key), name, token: randomToken() };
    await this.save({ version: 1, own: room });
    this.wire(key, { type: "room", room: this.session(room, room.guest) });
    this.emit({ type: "room", room: this.session(room, room.host) });
    this.presence();
  }
  async receive(key, p) {
    if (!p || typeof p !== "object" || Array.isArray(p)) return;
    const room = this.saved.own;
    if (p.type === "join" || p.type === "resume") {
      if (!room || room.expiresAt < Date.now()) {
        this.error(key, "Room unavailable or expired.");
        return;
      }
      if (room.guest?.key === key) {
        // The Noise public key is the existing member identity; no seat replacement.
        if (p.type === "resume" && !equal(p.token, room.guest.token)) {
          this.error(key, "Session expired.");
          return;
        }
        this.wire(key, { type: "room", room: this.session(room, room.guest) });
        this.presence();
        return;
      }
      if (p.type === "resume") {
        this.error(key, "Session expired.");
        return;
      }
      if (
        !validName(p.name) ||
        p.code !== room.code ||
        room.locked ||
        room.guest
      ) {
        this.error(key, "Room unavailable, locked or full.");
        return;
      }
      if (typeof p.invite === "string") {
        if (!equal(p.invite, room.invite)) {
          this.error(key, "Invitation is invalid.");
          return;
        }
        await this.admit(key, p.name.trim());
        return;
      }
      if (this.pending.size || this.limited("admission:" + key)) {
        this.error(key, "Try again later.");
        return;
      }
      const requestId = uuid();
      this.pending.set(requestId, {
        key,
        name: p.name.trim(),
        until: Date.now() + 30000,
      });
      this.wire(key, { type: "waiting" });
      this.emit({ type: "pending", requestId, name: p.name.trim() });
      return;
    }
    if (room?.guest?.key === key) {
      if (p.type === "signal")
        this.emit({ type: "signal", payload: p.payload });
      else if (p.type === "leave")
        await this.closeRoom("Your peer left the room.");
      return;
    }
    if (
      this.saved.target &&
      (!this.saved.target.key || this.saved.target.key === key)
    ) {
      if (p.type === "room") {
        const r = p.room;
        if (
          !r ||
          r.hiveHost !== key ||
          r.role !== "guest" ||
          r.peerId !== this.id ||
          !keyPattern.test(r.token) ||
          r.code !== this.saved.target.code ||
          r.expiresAt <= Date.now()
        )
          return;
        await this.save({
          version: 1,
          target: {
            ...this.saved.target,
            key,
            token: r.token,
            expiresAt: r.expiresAt,
          },
        });
        if (this.discovery) {
          await this.discovery.destroy();
          this.discovery = undefined;
        }
        this.swarm.joinPeer(b4a.from(key, "hex"));
        this.emit(p);
      } else if (
        ["presence", "pending", "waiting", "signal", "error"].includes(p.type)
      )
        this.emit(p);
      else if (p.type === "closed") {
        await this.save({ version: 1 });
        this.emit(p);
      }
    }
  }
  async action(p) {
    if (!p || typeof p !== "object") return;
    const room = this.saved.own;
    if (p.type === "create") {
      if (room && room.expiresAt > Date.now()) {
        if (room.locked) await this.listen();
        else await this.discover(room.code, true);
        if (room.guest) this.swarm.joinPeer(b4a.from(room.guest.key, "hex"));
        this.emit({ type: "room", room: this.session(room, room.host) });
        return;
      }
      if (!validName(p.name)) throw Error("Invalid display name");
      this.name = p.name.trim();
      const own = {
        id: uuid(),
        code: code(),
        invite: randomToken(),
        expiresAt: Date.now() + 86400000,
        locked: false,
        host: {
          key: this.key,
          id: this.id,
          name: this.name,
          token: randomToken(),
        },
      };
      await this.save({ version: 1, own });
      await this.discover(own.code, true);
      this.emit({ type: "room", room: this.session(own, own.host) });
      return;
    }
    if (p.type === "join") {
      if (
        !codePattern.test(p.code) ||
        !validName(p.name) ||
        (p.invite && !keyPattern.test(p.invite)) ||
        (p.hiveHost && !keyPattern.test(p.hiveHost))
      )
        throw Error("Invalid invitation");
      this.name = p.name.trim();
      await this.save({
        version: 1,
        target: { code: p.code, invite: p.invite, key: p.hiveHost },
      });
      await this.discover(p.code, false, p.hiveHost);
      for (const [key] of this.sockets)
        if (!p.hiveHost || p.hiveHost === key)
          this.wire(key, {
            type: "join",
            code: p.code,
            name: this.name,
            invite: p.invite,
          });
      return;
    }
    if (p.type === "resume") {
      if (
        room &&
        room.expiresAt > Date.now() &&
        equal(p.token, room.host.token)
      ) {
        if (room.locked) await this.listen();
        else await this.discover(room.code, true);
        if (room.guest) this.swarm.joinPeer(b4a.from(room.guest.key, "hex"));
        this.emit({ type: "room", room: this.session(room, room.host) });
        return;
      }
      const t = this.saved.target;
      if (t?.key && t.expiresAt > Date.now() && equal(p.token, t.token)) {
        await this.discover(t.code, false, t.key);
        this.wire(t.key, { type: "resume", token: t.token });
        return;
      }
      await this.save({ version: 1 });
      this.emit({
        type: "error",
        code: "expired",
        message: "Hive room expired. Local history remains.",
      });
      return;
    }
    if (p.type === "approve" && room) {
      const pending = this.pending.get(p.requestId);
      this.pending.delete(p.requestId);
      if (!pending || pending.until < Date.now()) return;
      if (!p.allow) {
        this.error(pending.key, "The host declined this request.");
        return;
      }
      if (room.locked || room.guest) {
        this.error(pending.key, "Room locked or full.");
        return;
      }
      await this.admit(pending.key, pending.name);
      return;
    }
    if (p.type === "lock" && room) {
      const own = { ...room, locked: !!p.locked };
      await this.save({ version: 1, own });
      if (this.discovery && own.locked) {
        await this.discovery.destroy();
        this.discovery = undefined;
      }
      if (!own.locked) await this.discover(own.code, true);
      this.presence();
      return;
    }
    if (p.type === "leave" || p.type === "close") {
      if (room) await this.closeRoom("Room closed.");
      else {
        const key = this.saved.target?.key;
        await this.save({ version: 1 });
        if (key) this.wire(key, { type: "leave" });
        this.emit({ type: "closed", reason: "Left room." });
      }
      return;
    }
    if (p.type === "ice-config") {
      this.emit({ type: "ice-config", iceServers: this.iceServers });
      return;
    }
    if (p.type === "signal") {
      const key = room?.guest?.key || this.saved.target?.key;
      if (key) this.wire(key, { type: "signal", payload: p.payload });
    }
  }
  async closeRoom(reason) {
    const room = this.saved.own;
    await this.save({ version: 1 });
    if (room?.guest) this.wire(room.guest.key, { type: "closed", reason });
    this.emit({ type: "closed", reason });
    if (this.discovery) {
      await this.discovery.destroy();
      this.discovery = undefined;
    }
  }
  async tick() {
    const now = Date.now();
    if (this.saved.own?.expiresAt <= now)
      await this.closeRoom("Room expired. Local history remains.");
    for (const [id, p] of this.pending)
      if (p.until < now) {
        this.pending.delete(id);
        this.error(p.key, "Join request expired.");
      }
    for (const [key, r] of this.rates)
      if (r.until < now) this.rates.delete(key);
  }
  addPeer(host, port) {
    if (
      typeof host !== "string" ||
      host.length > 128 ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    )
      return;
    this.swarm.dht.addNode({ host, port });
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.pending.clear();
    await this.swarm.destroy({ force: true });
  }
}
module.exports = { HiveNode, MAX_FRAME };
