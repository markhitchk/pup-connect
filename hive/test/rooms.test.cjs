const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const crypto = require("hypercore-crypto");
const b4a = require("b4a");
const { HiveNode } = require("../node.cjs");
class Swarm extends EventEmitter {
  constructor() {
    super();
    this.dht = new EventEmitter();
    this.dht.addNode = () => {};
    this.dht.address = () => ({ port: 1234 });
  }
  listen() {
    return Promise.resolve();
  }
  join() {
    return { destroy: async () => {} };
  }
  joinPeer() {}
  async destroy() {}
}
function node(extra = {}) {
  const events = [],
    writes = [];
  const n = new HiveNode({
    seed: b4a.toString(crypto.randomBytes(32), "hex"),
    swarm: new Swarm(),
    emit: (p) => events.push(p),
    persist: async (s) => writes.push(s),
    ...extra,
  });
  const wire = [];
  n.wire = (key, p) => {
    wire.push({ key, p });
    return true;
  };
  return {
    n,
    events,
    writes,
    wire,
    room: () => events.findLast((p) => p.type === "room")?.room,
  };
}
function key() {
  return b4a.toString(crypto.keyPair().publicKey, "hex");
}
test("room creation is local and persists before publishing its invitation", async () => {
  const x = node();
  await x.n.action({ type: "create", name: "Host" });
  const r = x.room();
  assert.match(r.code, /^\d{6}$/);
  assert.match(r.invite, /^[a-f0-9]{64}$/);
  assert.equal(r.hiveHost, x.n.key);
  assert.equal(r.role, "host");
  assert.equal(x.writes[0].own.id, r.id);
  await x.n.stop();
});
test("six digit join needs host approval and binds the seat to the Noise peer key", async () => {
  const x = node(),
    guest = key();
  await x.n.action({ type: "create", name: "Host" });
  await x.n.receive(guest, {
    type: "join",
    code: x.room().code,
    name: "Guest",
  });
  assert.equal(x.n.saved.own.guest, undefined);
  const p = x.events.find((p) => p.type === "pending");
  assert(p);
  await x.n.action({ type: "approve", requestId: p.requestId, allow: true });
  assert.equal(x.n.saved.own.guest.key, guest);
  assert.equal(
    x.wire.findLast((x) => x.p.type === "room").p.room.role,
    "guest"
  );
  await x.n.stop();
});
test("private invitation admits one peer; a third peer never replaces it", async () => {
  const x = node(),
    guest = key();
  await x.n.action({ type: "create", name: "Host" });
  const r = x.room();
  await x.n.receive(guest, {
    type: "join",
    code: r.code,
    invite: r.invite,
    name: "Guest",
  });
  const token = x.n.saved.own.guest.token;
  await x.n.receive(key(), {
    type: "join",
    code: r.code,
    invite: r.invite,
    name: "Other",
  });
  assert.equal(x.n.saved.own.guest.key, guest);
  assert.equal(x.n.saved.own.guest.token, token);
  assert.equal(x.wire.at(-1).p.type, "error");
  await x.n.stop();
});
test("a locked room rejects new admission but permits its original member to resume", async () => {
  const x = node(),
    guest = key();
  await x.n.action({ type: "create", name: "Host" });
  const r = x.room();
  await x.n.receive(guest, {
    type: "join",
    code: r.code,
    invite: r.invite,
    name: "Guest",
  });
  const token = x.n.saved.own.guest.token;
  await x.n.action({ type: "lock", locked: true });
  await x.n.receive(guest, { type: "resume", token });
  assert.equal(x.wire.at(-1).p.type, "presence");
  assert(x.wire.some((x) => x.p.type === "room" && x.p.room.token === token));
  await x.n.receive(key(), { type: "resume", token });
  assert.equal(x.wire.at(-1).p.type, "error");
  await x.n.stop();
});
test("unrelated peers cannot inject SDP or close a room", async () => {
  const x = node();
  await x.n.action({ type: "create", name: "Host" });
  const before = x.events.length;
  await x.n.receive(key(), {
    type: "signal",
    payload: { kind: "offer", sdp: "private" },
  });
  await x.n.receive(key(), { type: "leave" });
  assert.equal(x.events.length, before);
  assert(x.n.saved.own);
  await x.n.stop();
});
test("failed persistence publishes neither a room nor an admission", async () => {
  const x = node({
    persist: async () => {
      throw Error("storage");
    },
  });
  await assert.rejects(x.n.action({ type: "create", name: "Host" }), /storage/);
  assert.equal(x.room(), undefined);
  assert.equal(x.n.saved.own, undefined);
  await x.n.stop();
});
test("expired room state cannot be resumed and valid host state restores the same identity", async () => {
  const x = node();
  await x.n.action({ type: "create", name: "Host" });
  const r = x.room();
  await x.n.action({ type: "resume", token: r.token });
  assert.equal(x.room().id, r.id);
  x.n.saved.own.expiresAt = Date.now() - 1;
  await x.n.action({ type: "resume", token: r.token });
  assert.equal(x.events.at(-1).code, "expired");
  assert.equal(x.n.saved.own, undefined);
  await x.n.stop();
});
