import type { Delivery, RoomSession } from "../../shared/protocol";
export type Tab = "Chats" | "Calls" | "Pack" | "Settings";
export interface Settings {
  theme: "system" | "light" | "dark";
  name: string;
  server: string;
  stun: string;
  publicDiscovery: boolean;
  notifications: boolean;
  readReceipts: boolean;
  typing: boolean;
  relayOnly: boolean;
  tab: Tab;
  selected?: string;
}
export const defaultSettings: Settings = {
  theme: "system",
  name: "Local_Pup",
  server: "",
  publicDiscovery: true,
  stun: "stun:stun.l.google.com:19302\nstun:stun.cloudflare.com:3478",
  notifications: false,
  readReceipts: true,
  typing: true,
  relayOnly: false,
  tab: "Chats",
};
export interface Message {
  id: string;
  roomId: string;
  body: string;
  at: number;
  mine: boolean;
  status: Delivery;
}
export interface Conversation {
  id: string;
  code: string;
  name: string;
  at: number;
  archived?: boolean;
}
export interface CallRecord {
  id: string;
  roomId: string;
  video: boolean;
  incoming: boolean;
  at: number;
  ended?: number;
  connectedAt?: number;
  result?: string;
}
export interface CallState extends CallRecord {
  phase: "incoming" | "outgoing" | "connecting" | "active";
  muted: boolean;
  camera: boolean;
  route: "earpiece" | "speaker" | "bluetooth";
  quality: string;
}
export type Presence =
  | "Offline"
  | "Connecting"
  | "Reconnecting"
  | "Online"
  | "In call";
export interface AppState {
  ready: boolean;
  settings: Settings;
  session?: RoomSession;
  conversations: Conversation[];
  messages: Message[];
  history: CallRecord[];
  presence: Presence;
  typing: boolean;
  waiting: boolean;
  pending?: { requestId: string; name: string };
  call?: CallState;
  localStream?: string;
  remoteStream?: string;
  error?: string;
}
