import {
  AppState as AndroidAppState,
  DeviceEventEmitter,
  PermissionsAndroid,
  Platform,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { mediaDevices, MediaStream } from "react-native-webrtc";
import {
  advanceDelivery,
  parseInvite,
  type DataPacket,
  type RtcSignal,
  type RoomSession,
} from "../../shared/protocol";
import {
  type AppState,
  type CallState,
  type Message,
  type Conversation,
  defaultSettings,
  type Settings,
} from "./models";
import { native, vault } from "./native";
import { HiveSignaling as Signaling, parseStun } from "./hive";
import { PeerLane, type Lane } from "./rtc";
export class Controller {
  state: AppState = {
    ready: false,
    settings: defaultSettings,
    conversations: [],
    messages: [],
    history: [],
    presence: "Offline",
    typing: false,
    waiting: false,
  };
  private listeners = new Set<() => void>();
  private data?: PeerLane;
  private media?: PeerLane;
  private local?: MediaStream;
  private active = true;
  private network = true;
  private lastPong = 0;
  private typingUntil = 0;
  private lastTyping = 0;
  private facing: "user" | "environment" = "user";
  private calling = false;
  private incoming = Promise.resolve();
  private rtcQueue = Promise.resolve();
  private earlyIce = new Map<string, RtcSignal[]>();
  private messageWrites = Promise.resolve();
  private clearingHistory = false;
  private pendingCallEnds = new Map<
    string,
    { roomId: string; packet: Extract<DataPacket, { type: "call-end" }> }
  >();
  private rtcAttempts = { data: 0, media: 0 };
  private tick?: ReturnType<typeof setInterval>;
  private callTimer?: ReturnType<typeof setTimeout>;
  private retryTimers: Partial<Record<Lane, ReturnType<typeof setTimeout>>> =
    {};
  private unsubs: (() => void)[] = [];
  private refreshing = 0;
  private backgroundTimer?: ReturnType<typeof setTimeout>;
  readonly signaling = new Signaling(
    (p) => {
      this.rtcQueue = this.rtcQueue
        .then(() => this.onServer(p))
        .catch((e) => this.fail(e));
    },
    (p) => {
      if (!this.data || p === "Offline") this.patch({ presence: p });
    },
    (m) => this.patch({ error: m })
  );
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  patch(p: Partial<AppState>) {
    const wasCalling = !!this.state.call;
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
    if (wasCalling !== !!this.state.call)
      this.signaling?.keepAlive(!!this.state.call || this.active);
  }
  fail = (e: unknown) => {
    this.patch({
      error:
        e instanceof Error ? e.message : "Unable to complete the operation.",
    });
  };
  run = (action: () => Promise<unknown> | unknown) => {
    try {
      Promise.resolve(action()).catch(this.fail);
    } catch (e) {
      this.fail(e);
    }
  };
  async init() {
    try {
      await native.importLegacy();
      const settings = {
        ...defaultSettings,
        ...(await vault.get<Settings>("settings")),
      };
      const legacy = await vault.get<Record<string, string>>("legacy-import");
      if (legacy) {
        settings.name = legacy.identity_name || settings.name;
        for (const [key, raw] of Object.entries(legacy)) {
          if (!key.startsWith("messages_")) continue;
          const code = key.slice(9),
            id = `legacy-${code}`;
          const c: Conversation = {
            id,
            code,
            name: `Legacy room ${code}`,
            at: Date.now(),
            archived: true,
          };
          await vault.set("c:" + id, c);
          const entries = JSON.parse(raw) as { sender: string; text: string }[];
          for (const [index, item] of entries.entries()) {
            const m: Message = {
              id: `${id}-${index}`,
              roomId: id,
              body: item.text,
              at: Date.now(),
              mine: item.sender === "You",
              status: "read",
            };
            await vault.set(`m:${id}:${m.id}`, m);
          }
        }
        await vault.set("settings", settings);
        await vault.remove("legacy-import");
      }
      const session = await vault.get<RoomSession>("session");
      const history = await vault.all<AppState["history"][number]>("call:");
      for (let i = 0; i < history.length; i++) {
        if (!history[i].ended) {
          const previous = history[i];
          history[i] = {
            ...previous,
            ended: previous.connectedAt || previous.at,
            result: "interrupted",
          };
          await vault.set("call:" + previous.id, history[i]);
        }
      }
      settings.relayOnly = false;
      this.signaling.configure(settings.stun, settings.publicDiscovery);
      const hiveSession = session?.hiveHost ? session : undefined;
      if (session && !hiveSession) await vault.remove("session");
      this.patch({
        settings,
        session: hiveSession ?? undefined,
        conversations: await vault.all("c:"),
        messages: await vault.all("m:"),
        history,
        ready: true,
      });
      this.unsubs.push(
        NetInfo.addEventListener((info) => {
          const online = info.isConnected !== false;
          const changed = online !== this.network;
          this.network = online;
          this.signaling.setNetwork(online);
          if (changed && online) {
            this.signaling.reconnect();
            this.restart("data");
            if (this.state.call) this.restart("media");
          }
        })
      );
      this.unsubs.push(
        AndroidAppState.addEventListener("change", (s) => {
          this.active = s === "active";
          this.signaling.keepAlive(this.active || !!this.state.call);
          clearTimeout(this.backgroundTimer);
          if (this.active) {
            native.clearNotifications();
            this.restore();
            this.run(() => this.markRead());
          } else if (!this.state.call) {
            this.backgroundTimer = setTimeout(() => {
              if (!this.state.call) {
                this.signaling.stop();
                this.data?.close();
                this.data = undefined;
                this.patch({ presence: "Offline" });
              }
            }, 30000);
          }
        }).remove
      );
      this.unsubs.push(
        DeviceEventEmitter.addListener("pupEndCall", () =>
          this.run(() => this.endCall("ended"))
        ).remove
      );
      this.unsubs.push(
        DeviceEventEmitter.addListener("pupCallExpired", (id) => {
          if (this.state.call?.id === id)
            this.run(() =>
              this.endCall(
                this.state.call?.phase === "outgoing" ? "missed" : "failed"
              )
            );
        }).remove
      );
      this.unsubs.push(
        DeviceEventEmitter.addListener("pupInterruption", (kind) => {
          if (kind === "ended") this.run(() => this.endCall("failed"));
          else if (kind === "pause") {
            this.local?.getTracks().forEach((t) => {
              t.enabled = false;
            });
          } else if (this.state.call) {
            this.local?.getAudioTracks().forEach((t) => {
              t.enabled = !this.state.call!.muted;
            });
            this.local?.getVideoTracks().forEach((t) => {
              t.enabled = this.state.call!.camera;
            });
          }
        }).remove
      );
      this.tick = setInterval(() => this.run(() => this.heartbeat()), 5000);
      this.restore();
    } catch (e) {
      this.fail(e);
      this.patch({ ready: true });
    }
  }
  private restore() {
    const s = this.state.session;
    if (!s || !this.network) return;
    if (s.expiresAt < Date.now()) {
      this.run(() => this.closed("Room expired. Local history remains."));
      return;
    }
    if (this.state.presence === "Offline")
      this.signaling.start("", {
        type: "resume",
        token: s.token,
      });
  }
  async settings(update: Partial<Settings>) {
    const next = { ...this.state.settings, ...update };
    parseStun(next.stun);
    if (
      (this.state.session || this.state.waiting) &&
      (next.stun !== this.state.settings.stun ||
        next.publicDiscovery !== this.state.settings.publicDiscovery)
    )
      throw Error("Leave the current room before changing discovery settings.");
    if (!next.name.trim() || next.name.length > 40)
      throw Error("Use a display name with 1–40 characters.");
    await vault.set("settings", next);
    this.signaling.configure(next.stun, next.publicDiscovery);
    this.patch({ settings: next });
    if (update.tab || update.selected) await this.markRead();
  }
  async create() {
    this.requireNewRoom();
    this.signaling.start("", {
      type: "create",
      name: this.state.settings.name,
    });
    this.patch({ waiting: true, error: undefined });
  }
  async join(raw: string) {
    this.requireNewRoom();
    const invitation = parseInvite(raw, native.inviteHost);
    this.signaling.start("", {
      type: "join",
      ...invitation,
      name: this.state.settings.name,
    });
    this.patch({ waiting: true, error: undefined });
  }
  private requireNewRoom() {
    if (this.state.session)
      throw Error("Leave your active room before joining another.");
  }
  async onServer(p: Parameters<ConstructorParameters<typeof Signaling>[0]>[0]) {
    if (p.type === "room") {
      const previous = this.state.session;
      this.patch({ session: p.room, waiting: false });
      await vault.set("session", p.room);
      const peer = p.room.peers.find((x) => x.id !== p.room.peerId);
      const existing = this.state.conversations.find((c) => c.id === p.room.id);
      const c: Conversation = {
        id: p.room.id,
        code: p.room.code,
        name: peer?.name || existing?.name || `Room ${p.room.code}`,
        at: existing?.at || Date.now(),
      };
      this.patch({
        conversations: [
          ...this.state.conversations.filter((x) => x.id !== c.id),
          c,
        ],
      });
      await vault.set("c:" + c.id, c);
      if (!previous || previous.id !== p.room.id)
        await this.settings({ selected: c.id, tab: "Chats" });
      if (peer?.online && p.room.role === "host" && !this.data)
        await this.offerData();
      return;
    }
    if (p.type === "presence" && this.state.session) {
      const s = { ...this.state.session, peers: p.peers, locked: p.locked };
      this.patch({ session: s });
      await vault.set("session", s);
      const peer = p.peers.find((x) => x.id !== s.peerId);
      if (peer) {
        const c = this.state.conversations.find((x) => x.id === s.id);
        if (c) {
          c.name = peer.name;
          await vault.set("c:" + c.id, c);
          this.patch({ conversations: [...this.state.conversations] });
        }
      }
      if (peer?.online && s.role === "host" && !this.data)
        await this.offerData();
      return;
    }
    if (p.type === "signal") return this.signal(p.payload);
    if (p.type === "pending") {
      this.patch({ pending: { requestId: p.requestId, name: p.name } });
      return;
    }
    if (p.type === "waiting") {
      this.patch({ waiting: true });
      return;
    }
    if (p.type === "closed") {
      await this.closed(p.reason);
      return;
    }
    if (p.type === "ice-config" && this.state.session) {
      this.state.session.iceServers = p.iceServers;
      this.data?.setIce(p.iceServers);
      this.media?.setIce(p.iceServers);
      return;
    }
    if (p.type === "error") {
      if (p.code === "expired")
        await this.closed("Hive room expired. Local history remains.");
      else this.patch({ waiting: false });
    }
  }
  approve(allow: boolean) {
    const p = this.state.pending;
    if (
      p &&
      !this.signaling.send({ type: "approve", requestId: p.requestId, allow })
    )
      throw Error("Signaling is reconnecting.");
    this.patch({ pending: undefined });
  }
  lock() {
    const s = this.state.session;
    if (s && !this.signaling.send({ type: "lock", locked: !s.locked }))
      throw Error("Signaling is reconnecting.");
  }
  async leave() {
    if (!this.signaling.send({ type: "leave" }))
      throw Error(
        "Reconnect to leave the room. Room membership remains protected until expiry."
      );
    // The local hive must commit the leave before its worker is stopped.
    // onServer(closed) performs cleanup after that durable acknowledgement.
  }
  async closed(reason: string) {
    this.patch({ session: undefined });
    this.earlyIce.clear();
    this.pendingCallEnds.clear();
    await this.endCall("ended");
    this.data?.close();
    this.data = undefined;
    for (const timer of Object.values(this.retryTimers)) clearTimeout(timer);
    this.retryTimers = {};
    this.signaling.stop();
    await vault.remove("session");
    this.patch({
      session: undefined,
      presence: "Offline",
      typing: false,
      waiting: false,
      pending: undefined,
      error:
        reason === "Room closed." || reason === "Left room."
          ? undefined
          : reason,
    });
  }
  private newLane(lane: Lane, generation: string) {
    const session = this.state.session;
    if (!session) throw Error("No active room.");
    return new PeerLane(
      lane,
      generation,
      session.iceServers,
      this.state.settings.relayOnly,
      (p) => {
        if (!this.signaling.send({ type: "signal", payload: p }))
          this.patch({ presence: "Reconnecting" });
      },
      (status) => this.laneState(lane, status),
      (p) => {
        this.incoming = this.incoming
          .then(() => {
            if (this.state.session?.id === session.id) return this.onData(p);
          })
          .catch(this.fail);
      },
      (stream) => this.patch({ remoteStream: stream.toURL() }),
      this.fail,
      lane === "media" ? this.state.call?.id : undefined
    );
  }
  private async offerData() {
    this.data?.close();
    this.data = this.newLane("data", native.randomId());
    await this.data.offer();
  }
  private async signal(p: RtcSignal) {
    if (!this.state.session) return;
    if (p.kind === "restart") {
      this.restart(p.lane);
      return;
    }
    let lane = p.lane === "data" ? this.data : this.media;
    const key = `${p.lane}:${p.generation}`;
    if (p.kind === "ice" && (!lane || lane.generation !== p.generation)) {
      if (!this.earlyIce.has(key) && this.earlyIce.size >= 4)
        this.earlyIce.delete(this.earlyIce.keys().next().value!);
      const buffered = this.earlyIce.get(key) || [];
      if (buffered.length < 128) buffered.push(p);
      this.earlyIce.set(key, buffered);
      return;
    }
    if (p.kind === "offer") {
      if (p.lane === "data") {
        if (this.state.session.role === "host") return;
        if (!lane || lane.generation !== p.generation) {
          lane?.close();
          lane = this.data = this.newLane("data", p.generation);
        }
      } else {
        if (
          !this.state.call ||
          this.state.call.id !== p.callId ||
          !this.state.call.incoming ||
          !this.local
        )
          return;
        if (!lane || lane.generation !== p.generation) {
          lane?.close();
          lane = this.media = this.newLane("media", p.generation);
          for (const track of this.local.getTracks())
            lane.pc.addTrack(track, this.local);
        }
      }
    }
    await lane?.handle(p);
    if (p.kind === "offer" && lane) {
      for (const ice of this.earlyIce.get(key) || []) await lane.handle(ice);
      this.earlyIce.delete(key);
    }
  }
  private laneState(lane: Lane, status: string) {
    if (lane === "data") {
      if (status === "open") {
        clearTimeout(this.retryTimers.data);
        this.retryTimers.data = undefined;
        this.rtcAttempts.data = 0;
        this.lastPong = Date.now();
        this.patch({ presence: this.state.call ? "In call" : "Online" });
        this.syncEndedCalls();
        this.run(() => this.flush());
        this.run(async () => {
          await this.markRead();
          if (this.state.settings.readReceipts)
            for (const m of this.state.messages.filter(
              (x) =>
                x.roomId === this.state.session?.id &&
                !x.mine &&
                x.status === "read"
            ))
              this.data?.send({ type: "receipt", id: m.id, status: "read" });
        });
      } else if (status === "failed" || status === "disconnected") {
        this.patch({ presence: "Reconnecting", typing: false });
        this.scheduleRestart(lane);
      }
    } else if (status === "connected" && this.state.call) {
      clearTimeout(this.retryTimers.media);
      this.retryTimers.media = undefined;
      this.rtcAttempts.media = 0;
      const c = {
        ...this.state.call,
        phase: "active" as const,
        connectedAt: this.state.call.connectedAt || Date.now(),
      };
      this.patch({ call: c, presence: "In call" });
      native.callConnected(c.id);
      clearTimeout(this.callTimer);
      this.run(() => this.saveCall(c));
    } else if (status === "failed" || status === "disconnected") {
      if (this.state.call)
        this.patch({ call: { ...this.state.call, quality: "Reconnecting" } });
      this.scheduleRestart(lane);
    }
  }
  private scheduleRestart(lane: Lane) {
    if (this.retryTimers[lane]) return;
    this.retryTimers[lane] = setTimeout(() => {
      this.retryTimers[lane] = undefined;
      this.restart(lane);
    }, Math.min(30000, 5000 * 2 ** Math.min(3, this.rtcAttempts[lane]++)));
  }
  private restart(lane: Lane) {
    if (!this.network || !this.state.session) return;
    if (lane === "media" && !this.state.call) {
      this.syncEndedCalls();
      return;
    }
    this.rtcQueue = this.rtcQueue
      .then(async () => {
        if (lane === "data" && this.state.session?.role === "host") {
          if (this.data?.pc.signalingState === "stable")
            await this.data.offer(true);
          else {
            await this.offerData();
          }
        } else if (
          lane === "media" &&
          this.state.call &&
          !this.state.call.incoming
        )
          await this.startMediaConnection();
        else
          this.signaling.send({
            type: "signal",
            payload: { kind: "restart", lane },
          });
      })
      .catch(this.fail);
  }
  private saveMessage(m: Message) {
    const task = this.messageWrites.then(async () => {
      const current = this.state.messages.find((x) => x.id === m.id);
      if (current)
        m = { ...m, status: advanceDelivery(current.status, m.status) };
      await vault.set(`m:${m.roomId}:${m.id}`, m);
      this.patch({
        messages: [...this.state.messages.filter((x) => x.id !== m.id), m],
      });
    });
    this.messageWrites = task.catch(() => {});
    return task;
  }
  async send(body: string) {
    if (this.clearingHistory) throw Error("History cleanup is in progress.");
    const session = this.state.session;
    if (!session) throw Error("Join a room to send a message.");
    body = body.trim();
    if (!body || body.length > 4000)
      throw Error("Use a message with 1–4,000 characters.");
    const m: Message = {
      id: native.randomId(),
      roomId: session.id,
      body,
      at: Date.now(),
      mine: true,
      status: "queued",
    };
    await this.saveMessage(m);
    await this.flush();
  }
  private async flush() {
    if (this.clearingHistory) return;
    const roomId = this.state.session?.id;
    const lane = this.data;
    for (const m of this.state.messages.filter(
      (x) =>
        x.roomId === roomId && x.mine && ["queued", "sent"].includes(x.status)
    )) {
      if (
        this.clearingHistory ||
        this.state.session?.id !== roomId ||
        this.data !== lane
      )
        break;
      if (lane?.send({ type: "message", id: m.id, body: m.body, at: m.at })) {
        const current = this.state.messages.find((x) => x.id === m.id)!;
        await this.saveMessage({
          ...current,
          status: advanceDelivery(current.status, "sent"),
        });
      } else break;
    }
  }
  private async onData(p: DataPacket) {
    const session = this.state.session;
    if (!session) return;
    if (p.type === "ping") {
      this.data?.send({ type: "pong", at: p.at });
      return;
    }
    if (p.type === "pong") {
      this.lastPong = Date.now();
      this.patch({ presence: this.state.call ? "In call" : "Online" });
      return;
    }
    if (p.type === "typing") {
      this.typingUntil = p.active ? Date.now() + 5000 : 0;
      this.patch({ typing: p.active });
      return;
    }
    if (p.type === "message") {
      if (this.clearingHistory) return;
      let m = this.state.messages.find((x) => x.id === p.id);
      if (m && (m.mine || m.roomId !== session.id)) return;
      if (!m) {
        m = { ...p, roomId: session.id, mine: false, status: "delivered" };
        await this.saveMessage(m);
        if (!this.active && this.state.settings.notifications)
          native.notifyEvent("message");
      }
      this.data?.send({
        type: "receipt",
        id: p.id,
        status:
          m.status === "read" && this.state.settings.readReceipts
            ? "read"
            : "delivered",
      });
      await this.markRead();
      return;
    }
    if (p.type === "receipt") {
      const m = this.state.messages.find(
        (x) => x.id === p.id && x.roomId === session.id && x.mine
      );
      if (m)
        await this.saveMessage({
          ...m,
          status: advanceDelivery(m.status, p.status),
        });
      return;
    }
    if (p.type === "call-invite") {
      if (this.state.call) {
        this.data?.send({ type: "call-end", id: p.id, reason: "busy" });
        return;
      }
      const call: CallState = {
        id: p.id,
        roomId: session.id,
        video: p.video,
        incoming: true,
        at: Date.now(),
        phase: "incoming",
        muted: false,
        camera: p.video,
        route: "earpiece",
        quality: "Waiting",
      };
      this.patch({ call });
      await this.saveCall(call);
      if (this.state.settings.notifications) native.notifyEvent("call");
      this.callTimer = setTimeout(
        () => this.run(() => this.endCall("missed")),
        30000
      );
      return;
    }
    if (
      p.type === "call-accept" &&
      this.state.call?.id === p.id &&
      this.state.call.phase === "outgoing"
    ) {
      this.patch({ call: { ...this.state.call, phase: "connecting" } });
      await this.startMedia();
      return;
    }
    if (p.type === "call-end" && this.state.call?.id === p.id)
      await this.endCall(p.reason, false);
  }
  async markRead() {
    if (this.clearingHistory) return;
    const id = this.state.session?.id;
    if (
      !id ||
      !this.active ||
      this.state.settings.tab !== "Chats" ||
      this.state.settings.selected !== id
    )
      return;
    for (const m of this.state.messages.filter(
      (x) => x.roomId === id && !x.mine && x.status !== "read"
    )) {
      if (m.status !== "read") await this.saveMessage({ ...m, status: "read" });
      if (this.state.settings.readReceipts)
        this.data?.send({ type: "receipt", id: m.id, status: "read" });
    }
  }
  typing(active: boolean) {
    if (!this.state.settings.typing) return;
    if (active && Date.now() - this.lastTyping < 1500) return;
    this.lastTyping = Date.now();
    this.data?.send({ type: "typing", active });
  }
  private async permissions(video: boolean) {
    const wanted = [
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ...(video ? [PermissionsAndroid.PERMISSIONS.CAMERA] : []),
    ];
    const result = await PermissionsAndroid.requestMultiple(wanted);
    if (wanted.some((p) => result[p] !== PermissionsAndroid.RESULTS.GRANTED))
      throw Error(
        "Microphone permission is required for calls. Video also needs camera permission. You can change permissions in Android Settings."
      );
  }
  async notifications(enabled: boolean) {
    if (enabled && Number(Platform.Version) >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED)
        throw Error("Notifications permission was not granted.");
    }
    await this.settings({ notifications: enabled });
  }
  async call(video: boolean) {
    if (this.calling) throw Error("A call is already starting.");
    if (this.state.call) throw Error("A call is already in progress.");
    if (this.state.presence !== "Online" || !this.state.session)
      throw Error("Connect to your peer before calling.");
    this.calling = true;
    try {
      await this.permissions(video);
      if (this.state.call)
        throw Error("Another call arrived. Answer or decline it first.");
      const session = this.snapshot().session;
      if (!session) throw Error("Room closed before the call started.");
      const id = native.randomId();
      await native.startCall(video, id);
      const call: CallState = {
        id,
        roomId: session.id,
        video,
        incoming: false,
        at: Date.now(),
        phase: "outgoing",
        muted: false,
        camera: video,
        route: "earpiece",
        quality: "Waiting",
      };
      this.patch({ call });
      await this.saveCall(call);
      if (this.snapshot().call?.id !== id) return;
      if (!this.data?.send({ type: "call-invite", id: call.id, video }))
        throw Error("Peer disconnected.");
      this.callTimer = setTimeout(
        () => this.run(() => this.endCall("missed")),
        30000
      );
    } catch (e) {
      const activeCall = this.snapshot().call;
      if (activeCall && !activeCall.incoming) await this.endCall("failed");
      else if (!this.state.call) native.stopCall();
      throw e;
    } finally {
      this.calling = false;
    }
  }
  async accept() {
    const call = this.state.call;
    if (!call || call.phase !== "incoming") return;
    await this.permissions(call.video);
    if (this.state.call?.id !== call.id) return;
    await native.startCall(call.video, call.id);
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: call.video
          ? { facingMode: "user", width: 640, height: 480, frameRate: 24 }
          : false,
      });
      if (this.state.call?.id !== call.id) {
        stream.getTracks().forEach((t) => t.stop());
        stream.release();
        return;
      }
      this.local = stream;
      this.applyCaptureChoices();
      clearTimeout(this.callTimer);
      this.callTimer = setTimeout(
        () => this.run(() => this.endCall("failed")),
        30000
      );
      this.patch({
        localStream: this.local.toURL(),
        call: { ...call, phase: "connecting" },
      });
      native.clearNotifications();
      if (!this.data?.send({ type: "call-accept", id: call.id }))
        throw Error("Peer disconnected.");
    } catch (e) {
      await this.endCall("failed");
      throw e;
    }
  }
  private async startMedia() {
    const call = this.state.call;
    if (!call) return;
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: call.video
          ? { facingMode: "user", width: 640, height: 480, frameRate: 24 }
          : false,
      });
      if (this.state.call?.id !== call.id) {
        stream.getTracks().forEach((t) => t.stop());
        stream.release();
        return;
      }
      this.local = stream;
      this.applyCaptureChoices();
      this.patch({ localStream: this.local.toURL() });
      await this.startMediaConnection();
    } catch (e) {
      await this.endCall("failed");
      throw e;
    }
  }
  private async startMediaConnection() {
    if (!this.state.call || !this.local || this.state.call.incoming) return;
    this.media?.close();
    this.media = this.newLane("media", native.randomId());
    for (const track of this.local.getTracks())
      this.media.pc.addTrack(track, this.local);
    await this.media.offer();
  }
  private applyCaptureChoices() {
    const call = this.state.call;
    if (!call || !this.local) return;
    this.facing = "user";
    this.local.getAudioTracks().forEach((track) => {
      track.enabled = !call.muted;
    });
    this.local.getVideoTracks().forEach((track) => {
      track.enabled = call.camera;
    });
  }
  private async saveCall(call: AppState["history"][number]) {
    this.patch({
      history: [...this.state.history.filter((x) => x.id !== call.id), call],
    });
    await vault.set("call:" + call.id, call);
  }
  private syncEndedCalls() {
    const roomId = this.state.session?.id;
    if (!roomId) return;
    for (const record of this.state.history
      .filter((c) => c.roomId === roomId && c.ended)
      .sort((a, b) => (b.ended || 0) - (a.ended || 0))
      .slice(0, 20)) {
      const reason =
        record.result === "ended" ||
        record.result === "declined" ||
        record.result === "busy" ||
        record.result === "missed"
          ? record.result
          : "failed";
      this.pendingCallEnds.set(record.id, {
        roomId,
        packet: { type: "call-end", id: record.id, reason },
      });
    }
    this.flushCallEnds();
  }
  private flushCallEnds() {
    const roomId = this.state.session?.id;
    for (const [id, event] of this.pendingCallEnds) {
      if (event.roomId !== roomId) {
        this.pendingCallEnds.delete(id);
        continue;
      }
      if (!this.data?.send(event.packet)) break;
      this.pendingCallEnds.delete(id);
    }
  }
  async endCall(
    reason: "ended" | "declined" | "busy" | "missed" | "failed",
    notify = true
  ) {
    const call = this.state.call;
    if (!call) return;
    this.patch({
      call: undefined,
      localStream: undefined,
      remoteStream: undefined,
      presence: !this.network
        ? "Offline"
        : this.data?.pc?.connectionState === "connected" &&
          Date.now() - this.lastPong < 20000
        ? "Online"
        : this.state.session
        ? "Reconnecting"
        : "Offline",
    });
    clearTimeout(this.callTimer);
    clearTimeout(this.retryTimers.media);
    this.retryTimers.media = undefined;
    if (notify) {
      this.pendingCallEnds.set(call.id, {
        roomId: call.roomId,
        packet: { type: "call-end", id: call.id, reason },
      });
      this.flushCallEnds();
    }
    this.media?.close();
    this.media = undefined;
    this.local?.getTracks().forEach((t) => t.stop());
    this.local?.release();
    this.local = undefined;
    native.stopCall();
    await this.saveCall({ ...call, ended: Date.now(), result: reason });
  }
  mute() {
    const call = this.state.call;
    if (!call) return;
    this.local?.getAudioTracks().forEach((t) => {
      t.enabled = call.muted;
    });
    this.patch({ call: { ...call, muted: !call.muted } });
  }
  camera() {
    const call = this.state.call;
    if (!call) return;
    this.local?.getVideoTracks().forEach((t) => {
      t.enabled = !call.camera;
    });
    this.patch({ call: { ...call, camera: !call.camera } });
  }
  async switchCamera() {
    this.facing = this.facing === "user" ? "environment" : "user";
    await this.local
      ?.getVideoTracks()[0]
      ?.applyConstraints({ facingMode: this.facing });
  }
  async route(route: CallState["route"]) {
    if (route === "bluetooth" && Number(Platform.Version) >= 31) {
      const p = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      );
      if (p !== PermissionsAndroid.RESULTS.GRANTED)
        throw Error("Bluetooth permission was not granted.");
    }
    await native.route(route);
    if (this.state.call) this.patch({ call: { ...this.state.call, route } });
  }
  private async heartbeat() {
    if (this.state.typing && this.typingUntil < Date.now())
      this.patch({ typing: false });
    if (this.data) {
      this.data.send({ type: "ping", at: Date.now() });
      this.flushCallEnds();
      if (Date.now() - this.lastPong > 20000) {
        this.patch({ presence: "Reconnecting", typing: false });
        this.scheduleRestart("data");
      }
      if (this.active || this.state.call) await this.flush();
    }
    if (this.state.session && Date.now() > this.state.session.expiresAt)
      await this.closed("Room expired. Local history remains.");
    if (Date.now() - this.refreshing > 300000 && this.state.session) {
      this.signaling.send({ type: "ice-config" });
      this.refreshing = Date.now();
    }
    if (this.state.call && this.media) {
      const media = this.media;
      const callId = this.state.call.id;
      if (media.pc.connectionState !== "connected")
        this.scheduleRestart("media");
      let stats: Awaited<ReturnType<PeerLane["pc"]["getStats"]>>;
      try {
        stats = await media.pc.getStats();
      } catch (error) {
        if (this.media !== media || this.state.call?.id !== callId) return;
        throw error;
      }
      if (this.media !== media || this.state.call?.id !== callId) return;
      let quality = "Connecting";
      stats.forEach((s: Record<string, unknown>) => {
        if (
          s.type === "candidate-pair" &&
          s.state === "succeeded" &&
          s.nominated
        ) {
          const rtt = Number(s.currentRoundTripTime || 0);
          quality = rtt < 0.15 ? "Good" : rtt < 0.4 ? "Fair" : "Poor";
        }
      });
      if (this.state.call)
        this.patch({ call: { ...this.state.call, quality } });
    }
  }
  invitation() {
    const s = this.state.session;
    if (!s) throw Error("No active room.");
    return `${
      native.inviteHost
        ? `https://${native.inviteHost}/join`
        : "pupconnect://join"
    }?code=${s.code}&invite=${s.invite}${
      s.hiveHost ? `&hive=${s.hiveHost}` : ""
    }`;
  }
  async clearHistory() {
    if (this.state.call) throw Error("End your call before clearing history.");
    this.clearingHistory = true;
    try {
      await this.messageWrites;
      await vault.remove("m:");
      await vault.remove("c:");
      await vault.remove("call:");
      const session = this.state.session;
      const active: Conversation | undefined = session
        ? {
            id: session.id,
            code: session.code,
            name:
              session.peers.find((peer) => peer.id !== session.peerId)?.name ||
              `Room ${session.code}`,
            at: Date.now(),
          }
        : undefined;
      if (active) await vault.set("c:" + active.id, active);
      this.patch({
        messages: [],
        conversations: active ? [active] : [],
        history: [],
      });
    } finally {
      this.clearingHistory = false;
    }
  }
  destroy() {
    this.signaling.stop();
    this.data?.close();
    this.media?.close();
    this.local?.getTracks().forEach((t) => t.stop());
    this.local?.release();
    native.stopCall();
    clearInterval(this.tick);
    clearTimeout(this.callTimer);
    clearTimeout(this.backgroundTimer);
    for (const t of Object.values(this.retryTimers)) clearTimeout(t);
    this.unsubs.forEach((fn) => fn());
  }
}
