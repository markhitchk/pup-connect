import { HiveSignaling, parseStun } from "./hive";
import { parseInvite } from "../../shared/protocol";
import "react-native-url-polyfill/auto";
test("discovery accepts bounded STUN settings without a private server URL", () => {
  expect(parseStun("")).toEqual([]);
  expect(
    parseStun("stun:example.org:3478\nstuns:[2001:db8::1]:5349")
  ).toHaveLength(2);
  for (const raw of [
    "wss://service/ws",
    "turn:user:password@host:3478",
    "stun:host:0",
    "stun:host:99999",
    Array(9).fill("stun:host").join(","),
  ])
    expect(() => parseStun(raw)).toThrow();
});
test("hive invitations pin the Noise peer key while preserving the six digit code", () => {
  const key = "a".repeat(64),
    invite = "b".repeat(64);
  expect(
    parseInvite(`pupconnect://join?code=123456&invite=${invite}&hive=${key}`)
  ).toEqual({ code: "123456", invite, hiveHost: key });
  expect(() => parseInvite("pupconnect://join?code=123456&hive=bad")).toThrow();
});

test("duplicate connectivity notifications retain the active worker", async () => {
  const worker = require("../../hive/generated").default;
  worker.start.mockClear();
  const s = new HiveSignaling(jest.fn(), jest.fn(), jest.fn());
  s.start("", { type: "create", name: "Host" });
  await new Promise<void>((r) => setTimeout(r, 0));
  expect(worker.start).toHaveBeenCalledTimes(1);
  s.setNetwork(true);
  s.setNetwork(true);
  await new Promise<void>((r) => setTimeout(r, 0));
  expect(worker.start).toHaveBeenCalledTimes(1);
  s.setNetwork(false);
  s.setNetwork(true);
  await new Promise<void>((r) => setTimeout(r, 0));
  expect(worker.start).toHaveBeenCalledTimes(2);
  s.stop();
});
