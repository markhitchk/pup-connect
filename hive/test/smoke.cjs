const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const DHT = require("hyperdht");
const crypto = require("hypercore-crypto");
const b4a = require("b4a");
const { HiveNode } = require("../node.cjs");
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw Error("Hive peer integration timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
};
function client(bootstrap) {
  const events = [],
    emitter = new EventEmitter();
  const node = new HiveNode({
    seed: b4a.toString(crypto.randomBytes(32), "hex"),
    bootstrap,
    emit: (p) => {
      events.push(p);
      emitter.emit("packet", p);
    },
  });
  return {
    node,
    events,
    async send(p) {
      await node.run(() => node.action(p));
    },
    async next(type) {
      let packet;
      await until(() => {
        const i = events.findIndex((p) => p.type === type);
        if (i < 0) return false;
        packet = events.splice(i, 1)[0];
        return true;
      });
      return packet;
    },
  };
}
(async () => {
  const seed = DHT.bootstrapper(0, "127.0.0.1");
  await seed.ready();
  const address = seed.address();
  assert(address);
  const bootstrap = [{ host: "127.0.0.1", port: address.port }];
  const a = client(bootstrap),
    b = client(bootstrap),
    c = client(bootstrap);
  let seedClosed = false;
  try {
    await a.send({ type: "create", name: "Host" });
    const { room } = await a.next("room");
    await b.send({
      type: "join",
      name: "Guest",
      code: room.code,
      invite: room.invite,
      hiveHost: room.hiveHost,
    });
    const { room: guest } = await b.next("room");
    assert.equal(guest.id, room.id);
    assert.equal(guest.hiveHost, a.node.key);
    assert.equal(guest.peerId, b.node.id);
    await c.send({
      type: "join",
      name: "Other",
      code: room.code,
      invite: room.invite,
      hiveHost: room.hiveHost,
    });
    const denial = await c.next("error");
    assert.equal(denial.code, "admission");
    const forward = {
      kind: "ice",
      lane: "data",
      generation: room.id,
      candidate: { candidate: "", sdpMid: null, sdpMLineIndex: null },
    };
    await a.send({ type: "signal", payload: forward });
    assert.deepEqual((await b.next("signal")).payload, forward);
    await b.send({
      type: "signal",
      payload: { kind: "restart", lane: "data" },
    });
    assert.equal((await a.next("signal")).payload.kind, "restart");
    await seed.destroy({ force: true });
    seedClosed = true;
    a.events.length = 0;
    b.events.length = 0;
    a.node.sockets.get(b.node.key).destroy();
    const restored = await b.next("room");
    assert.equal(restored.room.id, room.id);
    assert.equal(restored.room.token, guest.token);
    await a.send({ type: "signal", payload: forward });
    assert.deepEqual((await b.next("signal")).payload, forward);
    console.log(
      JSON.stringify({
        privateJoin: true,
        thirdPeerRejected: true,
        signalingBothWays: true,
        bootstrapIndependentReconnect: true,
      })
    );
  } finally {
    await Promise.all([a.node.stop(), b.node.stop(), c.node.stop()]);
    if (!seedClosed) await seed.destroy({ force: true });
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
