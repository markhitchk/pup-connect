// Test adapter only: the existing real-libwebrtc assertions run over actual
// encrypted Hive streams instead of a WebSocket server. No production mocks.
const { EventEmitter } = require("node:events");
const createTestnet = require("hyperdht/testnet");
const crypto = require("hypercore-crypto");
const b4a = require("b4a");
const { HiveNode } = require("../node.cjs");
module.exports = async function fixture() {
  const testnet = await createTestnet(3);
  const nodes = [];
  function peer() {
    const events = [],
      socket = new EventEmitter();
    const node = new HiveNode({
      seed: b4a.toString(crypto.randomBytes(32), "hex"),
      bootstrap: testnet.bootstrap,
      emit(p) {
        events.push(p);
        socket.emit("message", Buffer.from(JSON.stringify(p)));
      },
    });
    nodes.push(node);
    // The shared harness closes this adapter, then awaits service.stop() below.
    socket.close = () => {};
    return {
      socket,
      send(p) {
        void node.run(() => node.action(p));
      },
      async next(type) {
        const deadline = Date.now() + 20000;
        for (;;) {
          const index = events.findIndex((p) => p.type === type);
          if (index >= 0) return events.splice(index, 1)[0];
          if (Date.now() > deadline)
            throw Error("Hive WebRTC admission timed out");
          await new Promise((r) => setTimeout(r, 25));
        }
      },
    };
  }
  return {
    a: peer(),
    b: peer(),
    service: {
      async stop() {
        await Promise.all(nodes.map((node) => node.stop()));
        await Promise.all(
          testnet.nodes.map((node) => node.destroy({ force: true }))
        );
      },
    },
  };
};
