import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHmac, randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { createSignaling, defaults, issueIce } from "../src/service.js";
import {
  advanceDelivery,
  clientPacket,
  dataPacket,
  parseInvite,
  reconnectDelay,
  serverPacket,
} from "../../shared/protocol.js";
import { client } from "./client.js";

async function harness(t: TestContext, config = {}) {
  const service = createSignaling({ ...config });
  service.http.listen(0, "127.0.0.1");
  await once(service.http, "listening");
  t.after(() => service.stop());
  const address = service.http.address();
  assert(address && typeof address !== "string");
  return { service, url: `ws://127.0.0.1:${address.port}/ws` };
}
test("code joins need host approval; only admitted peers exchange SDP", async (t) => {
  const { url } = await harness(t);
  const a = await client(url),
    b = await client(url);
  a.send({ type: "create", name: "Host" });
  const { room } = await a.next("room");
  assert.match(room.code, /^\d{6}$/);
  b.send({ type: "join", code: room.code, name: "Guest" });
  await b.next("waiting");
  const pending = await a.next("pending");
  b.send({ type: "signal", payload: { kind: "restart", lane: "data" } });
  assert.equal((await b.next("error")).code, "auth");
  a.send({ type: "approve", requestId: pending.requestId, allow: true });
  assert.equal((await b.next("room")).room.id, room.id);
  a.send({
    type: "signal",
    payload: {
      kind: "offer",
      lane: "data",
      generation: randomUUID(),
      sdp: "v=0\r\n",
    },
  });
  assert.equal((await b.next("signal")).payload.kind, "offer");
  b.send({ type: "close" });
  assert.equal((await b.next("error")).code, "forbidden");
});
test("private invitation joins immediately; a third device is rejected", async (t) => {
  const { url } = await harness(t);
  const a = await client(url),
    b = await client(url),
    c = await client(url);
  a.send({ type: "create", name: "A" });
  const { room } = await a.next("room");
  b.send({ type: "join", name: "B", code: room.code, invite: room.invite });
  const joined = await b.next("room");
  assert.equal(joined.room.role, "guest");
  c.send({ type: "join", name: "C", code: room.code, invite: room.invite });
  assert.equal((await c.next("error")).code, "unavailable");
});
test("resume survives a dropped socket; duplicate live sessions are rejected", async (t) => {
  const { url } = await harness(t);
  const a = await client(url);
  a.send({ type: "create", name: "Host" });
  const { room } = await a.next("room");
  const duplicate = await client(url);
  duplicate.send({ type: "resume", token: room.token });
  assert.equal((await duplicate.next("error")).code, "duplicate");
  a.socket.close();
  await once(a.socket, "close");
  const b = await client(url);
  b.send({ type: "resume", token: room.token });
  assert.equal((await b.next("room")).room.peerId, room.peerId);
});
test("lock protects invitation access; leaving invalidates the room and tokens", async (t) => {
  const { url } = await harness(t);
  const a = await client(url),
    b = await client(url);
  a.send({ type: "create", name: "Host" });
  const { room } = await a.next("room");
  a.send({ type: "lock", locked: true });
  await a.next("presence");
  b.send({ type: "join", name: "Guest", code: room.code, invite: room.invite });
  assert.equal((await b.next("error")).code, "unavailable");
  a.send({ type: "close" });
  await a.next("closed");
  b.send({ type: "resume", token: room.token });
  assert.equal((await b.next("error")).code, "expired");
});
test("room expiry removes resume access", async (t) => {
  const { url } = await harness(t, { ttlMs: 60, heartbeatMs: 25 });
  const a = await client(url);
  a.send({ type: "create", name: "Host" });
  const { room } = await a.next("room");
  assert.equal((await a.next("closed")).reason, "Room expired.");
  const b = await client(url);
  b.send({ type: "resume", token: room.token });
  assert.equal((await b.next("error")).code, "expired");
});
test("malformed packets and message content are rejected by signaling", async (t) => {
  const { url } = await harness(t);
  const a = await client(url);
  for (const packet of [
    { type: "join", code: "12", name: "A" },
    { type: "message", body: "private content" },
    { type: "create", name: "A", body: "private content" },
  ]) {
    a.send(packet);
    assert.equal((await a.next("error")).code, "invalid");
  }
});
test("admission guessing is throttled", async (t) => {
  const { url } = await harness(t);
  const a = await client(url);
  for (let i = 0; i < 20; i++) {
    a.send({ type: "join", name: "Guess", code: "000000" });
    await a.next("error");
  }
  a.send({ type: "join", name: "Guess", code: "000000" });
  assert.equal((await a.next("error")).code, "rate");
});
test("pending joins expire without approval", async (t) => {
  const { url } = await harness(t, { approvalMs: 30, heartbeatMs: 25 });
  const a = await client(url),
    b = await client(url);
  a.send({ type: "create", name: "Host" });
  const { room } = await a.next("room");
  b.send({ type: "join", code: room.code, name: "Guest" });
  await b.next("waiting");
  assert.equal((await b.next("error")).message, "Join request expired.");
});
test("short-lived TURN credentials follow coturn REST HMAC", () => {
  const ice = issueIce(
    {
      ...defaults,
      stun: ["stun:stun.example:3478"],
      turn: ["turn:turn.example:3478?transport=udp"],
      turnSecret: "test-only-secret",
      turnTtl: 600,
    },
    "peer",
    1000000
  );
  assert.equal(ice[1].username, "1600:peer");
  assert.equal(
    ice[1].credential,
    createHmac("sha1", "test-only-secret").update("1600:peer").digest("base64")
  );
  assert(!JSON.stringify(ice).includes("test-only-secret"));
});
test("receipt states never regress; message and invitation validation reject bad input", () => {
  assert.equal(advanceDelivery("read", "sent"), "read");
  assert.equal(advanceDelivery("queued", "delivered"), "delivered");
  assert(
    !dataPacket.safeParse({
      type: "message",
      id: randomUUID(),
      body: "x".repeat(4001),
      at: 1,
    }).success
  );
  assert(!clientPacket.safeParse({ type: "resume", token: "short" }).success);
  assert.deepEqual(parseInvite("001234"), { code: "001234" });
  assert.throws(() =>
    parseInvite("https://evil.example/join?code=123456", "good.example")
  );
  assert.throws(() =>
    parseInvite("https://good.example/other?code=123456", "good.example")
  );
  const token = "a".repeat(64);
  assert.deepEqual(
    parseInvite(`pupconnect://join?code=123456&invite=${token}`),
    { code: "123456", invite: token }
  );
  assert(reconnectDelay(100, () => 1) <= 36000);
});
