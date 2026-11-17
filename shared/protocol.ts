import { z } from "zod";
export const codeSchema = z.string().regex(/^\d{6}$/);
const id = z.string().uuid();
const token = z.string().regex(/^[a-f0-9]{64}$/);
const name = z.string().trim().min(1).max(40);
export const rtcSignal = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("offer"),
      lane: z.enum(["data", "media"]),
      generation: id,
      callId: id.optional(),
      sdp: z.string().min(1).max(65536),
    })
    .strict(),
  z
    .object({
      kind: z.literal("answer"),
      lane: z.enum(["data", "media"]),
      generation: id,
      sdp: z.string().min(1).max(65536),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ice"),
      lane: z.enum(["data", "media"]),
      generation: id,
      candidate: z
        .object({
          candidate: z.string().max(4096),
          sdpMid: z.string().nullable(),
          sdpMLineIndex: z.number().int().min(0).nullable(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({ kind: z.literal("restart"), lane: z.enum(["data", "media"]) })
    .strict(),
]);
export const clientPacket = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), name }).strict(),
  z
    .object({
      type: z.literal("join"),
      code: codeSchema,
      name,
      invite: token.optional(),
    })
    .strict(),
  z.object({ type: z.literal("resume"), token }).strict(),
  z
    .object({ type: z.literal("approve"), requestId: id, allow: z.boolean() })
    .strict(),
  z.object({ type: z.literal("lock"), locked: z.boolean() }).strict(),
  z.object({ type: z.literal("close") }).strict(),
  z.object({ type: z.literal("leave") }).strict(),
  z.object({ type: z.literal("ice-config") }).strict(),
  z.object({ type: z.literal("signal"), payload: rtcSignal }).strict(),
]);
export type ClientPacket = z.infer<typeof clientPacket>;
export type RtcSignal = z.infer<typeof rtcSignal>;
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
export interface RoomSession {
  id: string;
  code: string;
  peerId: string;
  role: "host" | "guest";
  token: string;
  invite: string;
  expiresAt: number;
  locked: boolean;
  peers: { id: string; name: string; online: boolean }[];
  iceServers: IceServer[];
}
export const roomSchema = z.object({
  id,
  code: codeSchema,
  peerId: id,
  role: z.enum(["host", "guest"]),
  token,
  invite: token,
  expiresAt: z.number(),
  locked: z.boolean(),
  peers: z.array(z.object({ id, name, online: z.boolean() })).max(2),
  iceServers: z.array(
    z.object({
      urls: z.union([z.string(), z.array(z.string())]),
      username: z.string().optional(),
      credential: z.string().optional(),
    })
  ),
});
export const serverPacket = z.discriminatedUnion("type", [
  z.object({ type: z.literal("room"), room: roomSchema }),
  z.object({
    type: z.literal("presence"),
    peers: roomSchema.shape.peers,
    locked: z.boolean(),
  }),
  z.object({ type: z.literal("pending"), requestId: id, name }),
  z.object({ type: z.literal("waiting") }),
  z.object({ type: z.literal("signal"), payload: rtcSignal }),
  z.object({
    type: z.literal("ice-config"),
    iceServers: roomSchema.shape.iceServers,
  }),
  z.object({ type: z.literal("closed"), reason: z.string().max(100) }),
  z.object({
    type: z.literal("error"),
    code: z.string().max(40),
    message: z.string().max(200),
  }),
]);
export const dataPacket = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("message"),
      id,
      body: z.string().min(1).max(4000),
      at: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("receipt"),
      id,
      status: z.enum(["delivered", "read"]),
    })
    .strict(),
  z.object({ type: z.literal("typing"), active: z.boolean() }).strict(),
  z.object({ type: z.literal("ping"), at: z.number() }).strict(),
  z.object({ type: z.literal("pong"), at: z.number() }).strict(),
  z.object({ type: z.literal("call-invite"), id, video: z.boolean() }).strict(),
  z.object({ type: z.literal("call-accept"), id }).strict(),
  z
    .object({
      type: z.literal("call-end"),
      id,
      reason: z.enum(["ended", "declined", "busy", "missed", "failed"]),
    })
    .strict(),
]);
export type DataPacket = z.infer<typeof dataPacket>;
export type Delivery = "queued" | "sent" | "delivered" | "read";
export function advanceDelivery(current: Delivery, next: Delivery): Delivery {
  const rank: Delivery[] = ["queued", "sent", "delivered", "read"];
  return rank.indexOf(next) > rank.indexOf(current) ? next : current;
}
export function reconnectDelay(attempt: number, random = Math.random): number {
  return Math.round(
    Math.min(30000, 1000 * 2 ** Math.min(5, attempt) * (0.8 + random() * 0.4))
  );
}
export function parseInvite(
  raw: string,
  expectedHost?: string
): { code: string; invite?: string } {
  if (codeSchema.safeParse(raw.trim()).success) return { code: raw.trim() };
  const u = new URL(raw.trim());
  if (
    u.protocol !== "pupconnect:" &&
    !(u.protocol === "https:" && u.host === expectedHost)
  )
    throw Error("Use a Pup Connect invitation or six-digit code.");
  if (
    u.username ||
    u.password ||
    u.hash ||
    (u.protocol === "https:" && u.pathname !== "/join")
  )
    throw Error("Invalid invitation.");
  if (u.protocol === "pupconnect:" && u.hostname !== "join")
    throw Error("Invalid invitation.");
  const code = codeSchema.parse(u.searchParams.get("code"));
  const invite = token
    .optional()
    .parse(u.searchParams.get("invite") ?? undefined);
  return { code, invite };
}
