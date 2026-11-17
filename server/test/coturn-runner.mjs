// Disposable CI integration server; never use this private-network config in production.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createSocket } from "node:dgram";
import { connect } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const addresses = Object.values(networkInterfaces()).flat();
const host = addresses.find(
  (a) => a?.family === "IPv4" && !a.internal
)?.address;
assert(
  host,
  "A real IPv4 interface is required; this check cannot run in a restricted executor"
);
const probe = createSocket("udp4");
probe.bind(0, host);
await once(probe, "listening");
const port = probe.address().port;
probe.close();
const dir = await mkdtemp(join(tmpdir(), "pup-coturn-test-"));
const secret = randomBytes(32).toString("hex");
let turn;
try {
  const config = join(dir, "turnserver.conf");
  await writeFile(
    config,
    [
      `listening-port=${port}`,
      `listening-ip=${host}`,
      `relay-ip=${host}`,
      "realm=pup-connect-ci.invalid",
      "fingerprint",
      "use-auth-secret",
      `static-auth-secret=${secret}`,
      "no-cli",
      "no-tls",
      "no-dtls",
      "no-multicast-peers",
      "no-tcp-relay",
      "min-port=49160",
      "max-port=49200",
      "user-quota=8",
      "total-quota=32",
      "no-stdout-log",
      "simple-log",
      `log-file=${join(dir, "coturn.log")}`,
      `pidfile=${join(dir, "coturn.pid")}`,
    ].join("\n") + "\n",
    { mode: 0o600 }
  );
  turn = spawn("turnserver", ["-c", config], { stdio: "ignore" });
  let startupError;
  turn.on("error", (error) => {
    startupError = error;
  });
  const deadline = Date.now() + 10000;
  while (true) {
    if (startupError) throw startupError;
    assert.equal(
      turn.exitCode,
      null,
      "coturn exited before accepting connections"
    );
    const ready = await new Promise((done) => {
      const socket = connect({ host, port });
      const finish = (ok) => {
        socket.destroy();
        done(ok);
      };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(250, () => finish(false));
    });
    if (ready) break;
    assert(Date.now() < deadline, "coturn did not become ready");
    await delay(100);
  }
  for (const transport of ["udp", "tcp"]) {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", resolve("server/test/webrtc-smoke.ts")],
      {
        env: {
          ...process.env,
          PUP_TEST_TURN_URL: `turn:${host}:${port}?transport=${transport}`,
          PUP_TEST_TURN_SECRET: secret,
        },
        timeout: 30000,
      }
    );
    const result = JSON.parse(stdout.trim());
    assert.deepEqual(result, {
      dataChannel: true,
      audioBothDirections: true,
      videoBothDirections: true,
      iceRestart: true,
      relayBothDirections: true,
    });
    // Only outcome flags are published; no credentials, SDP, addresses or payloads.
    console.log(JSON.stringify({ transport, ...result }));
  }
} finally {
  if (turn?.pid && turn.exitCode === null) {
    const exited = once(turn, "exit");
    turn.kill("SIGTERM");
    await Promise.race([exited, delay(3000)]);
    if (turn.exitCode === null) {
      turn.kill("SIGKILL");
      await exited;
    }
  }
  await rm(dir, { recursive: true, force: true });
}
