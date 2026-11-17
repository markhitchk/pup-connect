import { NativeModules } from "react-native";
interface PupNative {
  version: string;
  build: number;
  inviteHost: string;
  randomId(): string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  all(prefix: string): Promise<string[]>;
  remove(prefix: string): Promise<void>;
  importLegacy(): Promise<void>;
  copy(text: string): void;
  scan(): Promise<string | null>;
  startCall(video: boolean): Promise<void>;
  stopCall(): void;
  route(route: "speaker" | "earpiece" | "bluetooth"): Promise<void>;
  notifyEvent(kind: "call" | "message"): void;
  clearNotifications(): void;
  addListener(name: string): void;
  removeListeners(count: number): void;
}
export const native = NativeModules.PupNative as PupNative;
export const vault = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await native.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  },
  set: (key: string, value: unknown) => native.set(key, JSON.stringify(value)),
  async all<T>(prefix: string): Promise<T[]> {
    return (await native.all(prefix)).map((x) => JSON.parse(x) as T);
  },
  remove: (prefix: string) => native.remove(prefix),
};
