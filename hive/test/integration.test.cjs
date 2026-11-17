const test = require("node:test");
const assert = require("node:assert/strict");
const { networkInterfaces } = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { resolve } = require("node:path");
test(
  "three real hive peers: admission, encrypted signaling, cached-peer reconnect without bootstrap",
  { timeout: 45000 },
  async (t) => {
    try {
      networkInterfaces();
    } catch (e) {
      if (
        e.code === "EPERM" ||
        (e.syscall === "uv_interface_addresses" && e.errno === 1)
      ) {
        t.skip(
          "This executor blocks native network-interface enumeration; CI must run the real peer test."
        );
        return;
      }
      throw e;
    }
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [resolve("hive/test/smoke.cjs")],
      { timeout: 40000 }
    );
    assert.deepEqual(JSON.parse(stdout.trim()), {
      privateJoin: true,
      thirdPeerRejected: true,
      signalingBothWays: true,
      bootstrapIndependentReconnect: true,
    });
  }
);
