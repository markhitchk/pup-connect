import { Controller } from "./controller";
import { native, vault } from "./native";
import type { RoomSession, DataPacket } from "../../shared/protocol";
const room: RoomSession = {
  id: "room-one",
  code: "123456",
  peerId: "host",
  role: "host",
  token: "a".repeat(64),
  invite: "b".repeat(64),
  expiresAt: Date.now() + 100000,
  locked: false,
  peers: [
    { id: "host", name: "Host", online: true },
    { id: "guest", name: "Guest", online: true },
  ],
  iceServers: [],
};
const getPrivate = (c: Controller) =>
  c as unknown as {
    onData(p: DataPacket): Promise<void>;
    data: { send(p: DataPacket): boolean; close(): void };
    flush(): Promise<void>;
    markRead(): Promise<void>;
  };
beforeEach(() => {
  jest.clearAllMocks();
  require("./native").reset();
});
function connected() {
  const c = new Controller();
  c.patch({
    session: room,
    presence: "Online",
    settings: { ...c.state.settings, selected: room.id },
  });
  const send = jest.fn(() => true);
  getPrivate(c).data = { send, close: jest.fn() };
  return { c, send };
}
test("outgoing messages persist before transport and receipts do not regress", async () => {
  const { c } = connected();
  await c.send("Hello peer");
  const m = c.state.messages[0];
  expect(m.status).toBe("sent");
  expect(vault.set).toHaveBeenCalledWith(
    `m:${room.id}:${m.id}`,
    expect.objectContaining({ status: "queued" })
  );
  await getPrivate(c).onData({ type: "receipt", id: m.id, status: "read" });
  await getPrivate(c).onData({
    type: "receipt",
    id: m.id,
    status: "delivered",
  });
  expect(c.state.messages[0].status).toBe("read");
  expect(await vault.get(`m:${room.id}:${m.id}`)).toMatchObject({
    status: "read",
  });
});
test("disconnected outbox is retried on reconnection", async () => {
  const { c, send } = connected();
  send.mockReturnValue(false);
  await c.send("Retry me");
  expect(c.state.messages[0].status).toBe("queued");
  send.mockReturnValue(true);
  await getPrivate(c).flush();
  expect(c.state.messages[0].status).toBe("sent");
});
test("duplicate deliveries create one record and acknowledge it again", async () => {
  const { c, send } = connected();
  const packet: DataPacket = {
    type: "message",
    id: native.randomId(),
    body: "Hello",
    at: 1000,
  };
  await getPrivate(c).onData(packet);
  await getPrivate(c).onData(packet);
  expect(c.state.messages).toHaveLength(1);
  expect(send).toHaveBeenCalledWith({
    type: "receipt",
    id: packet.id,
    status: "read",
  });
});
test("receipt privacy and nonvisible chat do not announce reads", async () => {
  const { c, send } = connected();
  c.state.settings.readReceipts = false;
  const packet: DataPacket = {
    type: "message",
    id: native.randomId(),
    body: "Private",
    at: 1000,
  };
  await getPrivate(c).onData(packet);
  expect(send).not.toHaveBeenCalledWith(
    expect.objectContaining({ status: "read" })
  );
  c.state.settings.readReceipts = true;
  c.state.settings.tab = "Pack";
  send.mockClear();
  await getPrivate(c).onData({ ...packet, id: native.randomId() });
  expect(send).not.toHaveBeenCalledWith(
    expect.objectContaining({ status: "read" })
  );
});
test("storage failure does not send delivery acknowledgment", async () => {
  const { c, send } = connected();
  jest.mocked(vault.set).mockRejectedValueOnce(Error("disk failure"));
  await expect(
    getPrivate(c).onData({
      type: "message",
      id: native.randomId(),
      body: "Keep pending",
      at: 1000,
    })
  ).rejects.toThrow("disk failure");
  expect(send).not.toHaveBeenCalled();
  expect(c.state.messages).toHaveLength(0);
});
test("incoming invitations require acceptance before media; ending saves history", async () => {
  const { c, send } = connected();
  const id = native.randomId();
  await getPrivate(c).onData({ type: "call-invite", id, video: true });
  expect(c.state.call?.phase).toBe("incoming");
  expect(native.startCall).not.toHaveBeenCalled();
  await c.endCall("declined");
  expect(c.state.call).toBeUndefined();
  expect(c.state.history[0]).toMatchObject({
    result: "declined",
    ended: expect.any(Number),
  });
  expect(send).toHaveBeenCalledWith({
    type: "call-end",
    id,
    reason: "declined",
  });
});
test("unsolicited peer receipts cannot change incoming messages", async () => {
  const { c } = connected();
  const id = native.randomId();
  await getPrivate(c).onData({ type: "message", id, body: "Hello", at: 1000 });
  c.state.messages[0].status = "delivered";
  await getPrivate(c).onData({ type: "receipt", id, status: "read" });
  expect(c.state.messages[0].status).toBe("delivered");
});
test("session restoration reloads retained messages and settings", async () => {
  const { c } = connected();
  await c.settings({ theme: "dark", tab: "Calls" });
  await c.send("Retained");
  const restored = new Controller();
  await restored.init();
  expect(restored.state.settings.theme).toBe("dark");
  expect(restored.state.settings.tab).toBe("Calls");
  expect(restored.state.messages[0].body).toBe("Retained");
  restored.destroy();
});

test("an interrupted outbox never crosses into a different room transport", async () => {
  const { c, send } = connected();
  send.mockReturnValue(false);
  await c.send("First private message");
  await c.send("Second private message");
  const newSend = jest.fn(() => true);
  send.mockImplementation(() => {
    c.patch({ session: { ...room, id: "different-room" } });
    getPrivate(c).data = { send: newSend, close: jest.fn() };
    return true;
  });
  await getPrivate(c).flush();
  expect(newSend).not.toHaveBeenCalled();
  expect(c.state.messages.filter((m) => m.status === "queued")).toHaveLength(1);
});
