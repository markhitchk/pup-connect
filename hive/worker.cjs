"use strict";
const b4a = require("b4a");
const { HiveNode, MAX_FRAME } = require("./node.cjs");
module.exports = function start(ipc) {
  let serial = 0;
  let node,
    buffer = b4a.alloc(0),
    stopped = false;
  let queue = Promise.resolve();
  const saves = new Map();
  const post = (value) => {
    if (!stopped) ipc.write(b4a.from(JSON.stringify(value) + "\n"));
  };
  ipc.on("data", (chunk) => {
    if (buffer.length + chunk.length > MAX_FRAME * 2) return;
    buffer = b4a.concat([buffer, chunk]);
    let i;
    while ((i = buffer.indexOf(10)) !== -1) {
      const line = buffer.subarray(0, i);
      buffer = buffer.subarray(i + 1);
      if (line.length > MAX_FRAME) continue;
      let p;
      try {
        p = JSON.parse(b4a.toString(line));
      } catch {
        continue;
      }
      if (p.type === "persisted") {
        saves.get(p.id)?.(p.ok);
        saves.delete(p.id);
        continue;
      }
      queue = queue
        .then(async () => {
          if (stopped) return;
          if (p.type === "init" && !node) {
            node = new HiveNode({
              ...p,
              emit: post,
              persist: (snapshot) =>
                new Promise((resolve, reject) => {
                  const id = String(++serial);
                  const timeout = setTimeout(() => {
                    saves.delete(id);
                    reject(Error("Persistence timeout"));
                  }, 10000);
                  saves.set(id, (ok) => {
                    clearTimeout(timeout);
                    ok ? resolve() : reject(Error("Persistence failed"));
                  });
                  post({ type: "persist", id, snapshot });
                }),
            });
            post({ type: "ready", key: node.key });
            return;
          }
          if (p.type === "peer") {
            node?.addPeer(p.host, p.port);
            return;
          }
          if (p.type === "stop") {
            stopped = true;
            await node?.stop();
            return;
          }
          await node?.run(() => node.action(p));
        })
        .catch(() =>
          post({
            type: "error",
            code: "hive",
            message: "Hive connection failed. Try again.",
          })
        );
    }
  });
  return async () => {
    stopped = true;
    for (const saved of saves.values()) saved(false);
    saves.clear();
    await node?.stop();
  };
};
