import { parseStun } from "./hive";
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
