import "react-native-url-polyfill/auto";
import { validateEndpoint } from "./signaling";
import { parseInvite } from "../../shared/protocol";
test("Android uses a standards-compliant URL implementation for custom invitation schemes", () => {
  const invite = "a".repeat(64);
  expect(parseInvite(`pupconnect://join?code=001234&invite=${invite}`)).toEqual(
    { code: "001234", invite }
  );
});
test("secure WebSocket settings reject credentials and insecure endpoints", () => {
  expect(validateEndpoint("wss://connect.example.com/ws")).toBe(
    "wss://connect.example.com/ws"
  );
  expect(() => validateEndpoint("wss://name:secret@example.com/ws")).toThrow();
  expect(() => validateEndpoint("ws://example.com/ws")).toThrow();
  expect(() => validateEndpoint("wss://")).toThrow();
});
