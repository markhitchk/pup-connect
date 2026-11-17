import test from "node:test";
import assert from "node:assert/strict";
import { networkInterfaces } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
test(
  "real libwebrtc DataChannel, two-way synthetic audio/video and ICE restart on loopback",
  { timeout: 20000 },
  async (t) => {
    try {
      networkInterfaces();
    } catch {
      t.skip(
        "This executor denies network-interface enumeration required by libwebrtc ICE; not verified here."
      );
      return;
    }
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", resolve("server/test/webrtc-smoke.ts")],
      { timeout: 15000 }
    );
    assert.deepEqual(JSON.parse(stdout.trim()), {
      dataChannel: true,
      audioBothDirections: true,
      videoBothDirections: true,
      iceRestart: true,
    });
  }
);
