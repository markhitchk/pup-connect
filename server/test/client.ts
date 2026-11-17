import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { serverPacket } from "../../shared/protocol.js";
type Packet = ReturnType<typeof serverPacket.parse>;
export async function client(url: string) {
  const socket = new WebSocket(url);
  const queue: Packet[] = [];
  let wake: () => void = () => {};
  socket.on("message", (raw) => {
    queue.push(serverPacket.parse(JSON.parse(raw.toString())));
    wake();
  });
  await once(socket, "open");
  return {
    socket,
    send: (value: unknown) => socket.send(JSON.stringify(value)),
    async next<T extends Packet["type"]>(
      type: T
    ): Promise<Extract<Packet, { type: T }>> {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const i = queue.findIndex((p) => p.type === type);
        if (i >= 0)
          return queue.splice(i, 1)[0] as Extract<Packet, { type: T }>;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 50);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
      throw Error(
        `Timed out waiting for ${type}; queued ${queue.map((p) => p.type)}`
      );
    },
  };
}
