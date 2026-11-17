const test = require("node:test");
const assert = require("node:assert/strict");
const { networkInterfaces } = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { resolve } = require("node:path");
test(
  "real Hive-signaled WebRTC DataChannel, two-way synthetic media and ICE restart",
  { timeout: 60000 },
  async (t) => {
    try {
      networkInterfaces();
    } catch (e) {
      if (
        e.code === "EPERM" ||
        (e.syscall === "uv_interface_addresses" && e.errno === 1)
      ) {
        t.skip(
          "This executor blocks interface enumeration; real Hive/WebRTC runs in CI."
        );
        return;
      }
      throw e;
    }
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", resolve("server/test/webrtc-smoke.ts")],
      {
        timeout: 55000,
        env: {
          ...process.env,
          PUP_TEST_HIVE: "1",
          PUP_TEST_TURN_URL: "",
          PUP_TEST_TURN_SECRET: "",
        },
      }
    );
    assert.deepEqual(JSON.parse(stdout.trim()), {
      dataChannel: true,
      audioBothDirections: true,
      videoBothDirections: true,
      iceRestart: true,
    });
  }
);
