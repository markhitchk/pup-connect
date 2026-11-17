import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { RTCView } from "react-native-webrtc";
import QRCode from "react-native-qrcode-svg";
import { Controller } from "./src/core/controller";
import { native } from "./src/core/native";
import type { Tab } from "./src/core/models";
import colors from "./src/assets/colors.json";
import { Icon, type IconName } from "./src/ui/Icon";
const tabs: Record<Tab, IconName> = {
  Chats: "ic_chat",
  Calls: "ic_phone",
  Pack: "ic_group",
  Settings: "fa_gear",
};
export default function App() {
  return (
    <SafeAreaProvider>
      <PupApp />
    </SafeAreaProvider>
  );
}
export function PupApp() {
  const [controller] = useState(() => new Controller());
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const system = useColorScheme();
  const dark =
    state.settings.theme === "dark" ||
    (state.settings.theme === "system" && system === "dark");
  const c = dark ? colors.dark : colors.light;
  const { width, height } = useWindowDimensions();
  const wide = width >= 800;
  const compact = height < 480;
  const [menu, setMenu] = useState(false),
    [roomDialog, setRoomDialog] = useState(false),
    [qr, setQr] = useState(false),
    [search, setSearch] = useState(""),
    [join, setJoin] = useState(""),
    [draft, setDraft] = useState(""),
    [stun, setStun] = useState(""),
    [name, setName] = useState("");
  const [, setClock] = useState(0);
  const messages = useRef<FlatList>(null);
  const run = controller.run;
  useEffect(() => {
    void controller.init();
    return () => controller.destroy();
  }, []);
  useEffect(() => {
    setName(state.settings.name);
    setStun(state.settings.stun);
  }, [state.settings.name, state.settings.stun]);
  useEffect(() => {
    if (!state.call) return;
    const t = setInterval(() => setClock((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [state.call?.id]);
  useEffect(() => {
    const sub = Linking.addEventListener("url", (e) => invite(e.url));
    void Linking.getInitialURL().then((url) => {
      if (url) invite(url);
    });
    return () => sub.remove();
  }, []);
  function invite(url: string) {
    setJoin(url);
    setRoomDialog(true);
  }
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (menu) {
        setMenu(false);
        return true;
      }
      if (state.settings.selected) {
        run(() => controller.settings({ selected: undefined }));
        return true;
      }
      if (state.settings.tab !== "Chats") {
        run(() => controller.settings({ tab: "Chats" }));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [menu, state.settings.selected, state.settings.tab]);
  const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      height: compact ? 48 : 56,
      backgroundColor: c.app_bar,
      paddingHorizontal: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderBottomWidth: 1,
      borderColor: c.divider,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { color: c.text, fontSize: 20, fontWeight: "700" },
    text: { color: c.text, fontSize: 14 },
    muted: { color: c.muted, fontSize: 12, lineHeight: 18 },
    small: { color: c.meta, fontSize: 11, fontWeight: "700" },
    icon: {
      minWidth: 42,
      minHeight: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: c.nav_bg,
    },
    connection: {
      height: 50,
      paddingHorizontal: 8,
      paddingVertical: 5,
      backgroundColor: c.connection_bar,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    address: {
      flex: 1,
      height: 40,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    badge: { color: c.cyan, fontWeight: "700", fontSize: 10 },
    body: { flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center" },
    content: { padding: 14, gap: 10, paddingBottom: 24 },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card_bg,
      padding: 14,
      gap: 8,
    },
    button: {
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface2,
    },
    primary: { backgroundColor: c.cyan, borderColor: c.cyan },
    buttonText: { color: c.cyan, fontSize: 13, fontWeight: "700" },
    input: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.text,
      backgroundColor: c.panel,
      fontSize: 14,
    },
    nav: {
      minHeight: 60,
      flexDirection: "row",
      borderTopWidth: 1,
      borderColor: c.divider,
      backgroundColor: c.nav_bg,
    },
    navItem: {
      flex: 1,
      minHeight: 60,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    scrim: {
      flex: 1,
      backgroundColor: "#0009",
      justifyContent: "center",
      padding: 20,
    },
    modal: {
      width: "100%",
      maxWidth: 480,
      alignSelf: "center",
      maxHeight: "95%",
      backgroundColor: c.bg,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 18,
      gap: 12,
    },
    bubble: {
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      maxWidth: "86%",
      marginBottom: 8,
    },
    divider: { height: 1, backgroundColor: c.divider },
    section: {
      fontSize: 11,
      letterSpacing: 1,
      fontWeight: "700",
      color: c.meta,
      marginTop: 8,
    },
    video: {
      flex: 1,
      minHeight: 100,
      backgroundColor: "#000",
      borderRadius: 14,
    },
    toggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingVertical: 5,
    },
    error: {
      padding: 12,
      backgroundColor: c.surface2,
      borderBottomWidth: 1,
      borderColor: c.error,
    },
    call: { flex: 1, padding: 16, gap: 12, backgroundColor: c.bg },
  });
  const text = (value: string, muted = false) => (
    <Text style={muted ? s.muted : s.text}>{value}</Text>
  );
  function button(
    label: string,
    action: () => unknown,
    primary = false,
    disabled = false
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => run(action)}
        disabled={disabled}
        style={({ pressed }) => [
          s.button,
          primary && s.primary,
          { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[s.buttonText, primary && { color: c.on_accent }]}>
          {label}
        </Text>
      </Pressable>
    );
  }
  function icon(
    name: IconName,
    label: string,
    action: () => unknown,
    disabled = false
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => run(action)}
        style={[s.icon, { opacity: disabled ? 0.4 : 1 }]}
      >
        <Icon name={name} />
      </Pressable>
    );
  }
  function title(value: string) {
    return (
      <Text accessibilityRole="header" style={s.title}>
        {value}
      </Text>
    );
  }
  function card(children: React.ReactNode) {
    return <View style={s.card}>{children}</View>;
  }
  function toggle(
    label: string,
    value: boolean,
    action: () => unknown,
    help?: string
  ) {
    return (
      <View style={s.toggle}>
        <View style={{ flex: 1 }}>
          {text(label)}
          {help && text(help, true)}
        </View>
        <Switch
          accessibilityLabel={label}
          value={value}
          onValueChange={() => run(action)}
          trackColor={{ true: c.cyan, false: c.border }}
        />
      </View>
    );
  }
  function navigate(tab: Tab) {
    setMenu(false);
    run(() => controller.settings({ tab }));
  }
  function newRoom() {
    setRoomDialog(true);
    setMenu(false);
  }
  const selected = state.conversations.find(
    (x) => x.id === state.settings.selected
  );
  const activeRoom = state.session?.id === selected?.id && !!state.session;
  const conversationMessages = state.messages
    .filter((m) => m.roomId === selected?.id)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const peer = state.session?.peers.find((p) => p.id !== state.session?.peerId);
  const list = (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[s.row, { justifyContent: "space-between" }]}>
        {title("Chats")}
        {button("New room", newRoom)}
      </View>
      <TextInput
        accessibilityLabel="Search conversations"
        placeholder="Search conversations"
        placeholderTextColor={c.hint}
        value={search}
        onChangeText={setSearch}
        style={s.input}
      />
      {!state.conversations.length &&
        card(
          <>
            {text("No recent rooms")}
            {text("Create a room or join with an invitation to begin.", true)}
            {button("Create or join room", newRoom, true)}
          </>
        )}
      {state.conversations
        .filter((x) =>
          `${x.name} ${x.code}`.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => b.at - a.at)
        .map((conv) => (
          <Pressable
            key={conv.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${conv.name}`}
            onPress={() =>
              run(() =>
                controller.settings({ selected: conv.id, tab: "Chats" })
              )
            }
            style={[
              s.card,
              conv.id === selected?.id && { borderColor: c.cyan },
            ]}
          >
            <View style={s.row}>
              <Icon name="ic_chat" />
              <View style={{ flex: 1 }}>
                {text(conv.name)}
                {text(
                  `${conv.code} · ${
                    conv.archived
                      ? "Local archive"
                      : state.session?.id === conv.id
                      ? state.presence
                      : "History"
                  }`,
                  true
                )}
              </View>
              <Text style={s.badge}>
                {state.messages.filter(
                  (m) => m.roomId === conv.id && !m.mine && m.status !== "read"
                ).length || ""}
              </Text>
            </View>
            {text(
              state.messages
                .filter((m) => m.roomId === conv.id)
                .sort((a, b) => b.at - a.at)[0]?.body || "No messages yet",
              true
            )}
          </Pressable>
        ))}
    </ScrollView>
  );
  const chat = (
    <View style={{ flex: 1 }}>
      <View style={[s.content, { paddingBottom: 8 }]}>
        <View style={s.row}>
          {icon("fa_arrow_left", "Back to chats", () =>
            controller.settings({ selected: undefined })
          )}
          <View style={{ flex: 1 }}>
            {title(selected?.name || "Room")}
            {text(
              activeRoom
                ? state.typing
                  ? "Typing…"
                  : state.presence
                : "Saved on this device",
              true
            )}
          </View>
          {activeRoom &&
            icon(
              "ic_phone",
              "Voice call",
              () => controller.call(false),
              state.presence !== "Online"
            )}
          {activeRoom &&
            icon("ic_group", "Room controls", () => navigate("Pack"))}
        </View>
      </View>
      <FlatList
        ref={messages}
        data={conversationMessages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14 }}
        onContentSizeChange={() =>
          messages.current?.scrollToEnd({ animated: false })
        }
        ListEmptyComponent={text(
          "No messages yet. Invite your peer to connect.",
          true
        )}
        renderItem={({ item: m }) => (
          <View
            style={[
              s.bubble,
              {
                alignSelf: m.mine ? "flex-end" : "flex-start",
                backgroundColor: m.mine ? c.welcome_bg : c.panel,
              },
            ]}
          >
            <Text selectable style={s.text}>
              {m.body}
            </Text>
            <Text style={[s.muted, { fontSize: 10, marginTop: 5 }]}>
              {new Date(m.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {m.mine ? ` · ${m.status}` : ""}
            </Text>
          </View>
        )}
      />
      {activeRoom ? (
        <View
          style={[
            s.row,
            { padding: 10, borderTopWidth: 1, borderColor: c.divider },
          ]}
        >
          <TextInput
            accessibilityLabel="Message"
            multiline
            maxLength={4000}
            placeholder="Message"
            placeholderTextColor={c.hint}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              controller.typing(!!value);
            }}
            onBlur={() => controller.typing(false)}
            style={[s.input, { flex: 1, maxHeight: 120 }]}
          />
          {button(
            "Send",
            async () => {
              await controller.send(draft);
              setDraft("");
              controller.typing(false);
            },
            true,
            !draft.trim()
          )}
        </View>
      ) : (
        <View style={s.content}>
          {text(
            "This is retained history. Join a new room to connect again.",
            true
          )}
          {button("Create or join room", newRoom)}
        </View>
      )}
    </View>
  );
  const calls = (
    <ScrollView contentContainerStyle={s.content}>
      {title("Calls")}
      {card(
        <>
          {text(peer?.name || "Connect with your pack")}
          {text("Voice and video calls use your active peer connection.", true)}
          {button(
            "Start voice call",
            () => controller.call(false),
            true,
            state.presence !== "Online"
          )}
          {button(
            "Start video call",
            () => controller.call(true),
            false,
            state.presence !== "Online"
          )}
        </>
      )}
      <Text style={s.section}>RECENT CALLS</Text>
      {!state.history.length && text("No calls yet.", true)}
      {state.history
        .slice()
        .sort((a, b) => b.at - a.at)
        .map((call) => (
          <View key={call.id} style={s.card}>
            {text(
              `${call.incoming ? "Incoming" : "Outgoing"} ${
                call.video ? "video" : "voice"
              } call`
            )}
            {text(
              `${new Date(call.at).toLocaleString()} · ${
                call.result || "In progress"
              }`,
              true
            )}
            {call.result === "interrupted"
              ? text("Duration unavailable · interrupted", true)
              : call.connectedAt &&
                text(
                  `${Math.max(
                    0,
                    Math.floor(
                      ((call.ended || Date.now()) - call.connectedAt) / 1000
                    )
                  )} seconds`,
                  true
                )}
          </View>
        ))}
    </ScrollView>
  );
  const pack = (
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.row}>
        <Icon name="ic_paw" size={30} />
        {title("Pack")}
      </View>
      {state.session
        ? card(
            <>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                {text("ROOM CODE")}
                <Text style={s.badge}>{state.session.role.toUpperCase()}</Text>
              </View>
              <Text
                selectable
                style={{
                  fontSize: 36,
                  letterSpacing: 6,
                  fontWeight: "700",
                  color: c.cyan,
                }}
              >
                {state.session.code}
              </Text>
              {text(
                `Expires ${new Date(state.session.expiresAt).toLocaleString()}`,
                true
              )}
              {text(`You · ${state.settings.name}`)}
              {text(
                peer
                  ? `${peer.name} · ${state.presence}`
                  : "Waiting for a peer",
                true
              )}
              {button("Copy room code", () => native.copy(state.session!.code))}
              {button(
                "Share invitation",
                () => Share.share({ message: controller.invitation() }),
                true
              )}
              {button("Show QR invitation", () => setQr(true))}
              {state.session.role === "host" &&
                button(
                  state.session.locked
                    ? "Unlock room joining"
                    : "Lock room joining",
                  () => controller.lock()
                )}
              {button(
                state.session.role === "host" ? "Close room" : "Leave room",
                () =>
                  Alert.alert(
                    "Close this connection?",
                    "This room will close for both peers. Local chat history remains.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Close room",
                        style: "destructive",
                        onPress: () => run(() => controller.leave()),
                      },
                    ]
                  )
              )}
            </>
          )
        : card(
            <>
              {text("Your room, your pack")}
              {text(
                "Rooms connect two devices. Code-only requests need host approval. Invitations contain a private access token.",
                true
              )}
              {button("Create or join room", newRoom, true)}
            </>
          )}
      {text(
        "Room membership is retained on the participating devices until expiry. Both apps must be online. History stays on this device.",
        true
      )}
    </ScrollView>
  );
  const settings = (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {title("App Settings")}
      {card(
        <>
          <View style={s.row}>
            <Icon name="ic_paw" size={42} />
            <View>
              {text("Pup Connect Identity")}
              {text("Device-only identity", true)}
            </View>
          </View>
          <TextInput
            accessibilityLabel="Display name"
            value={name}
            onChangeText={setName}
            maxLength={40}
            placeholderTextColor={c.hint}
            style={s.input}
          />
          {button("Save display name", () =>
            controller.settings({ name: name.trim() })
          )}
        </>
      )}
      <Text style={s.section}>APPEARANCE</Text>
      {card(
        <View style={[s.row, { flexWrap: "wrap" }]}>
          {(["system", "light", "dark"] as const).map((theme) => (
            <View key={theme} style={{ flex: 1, minWidth: 75 }}>
              {button(
                theme[0].toUpperCase() + theme.slice(1),
                () => controller.settings({ theme }),
                state.settings.theme === theme
              )}
            </View>
          ))}
        </View>
      )}
      <Text style={s.section}>CONNECTION</Text>
      {card(
        <>
          {text("Pup Hive · App-to-app network")}
          {text(
            "Devices find each other through same-Wi-Fi discovery and the shared peer network. Create a room and share its private invitation; no Pup Connect server URL is needed.",
            true
          )}
          {toggle(
            "Use public discovery bootstrap",
            state.settings.publicDiscovery,
            () =>
              controller.settings({
                publicDiscovery: !state.settings.publicDiscovery,
              }),
            "Starts discovery through shared public routing peers and enables configured STUN. Turn off to start through same-Wi-Fi peers without public bootstrap or STUN. Learned peer routes may still reach the internet; this is not a network firewall."
          )}
          {text("Direct-connection discovery (advanced)")}
          {text(
            "Optional public STUN services help devices find an internet path. They do not carry message contents. Empty uses local network addresses only.",
            true
          )}
          <TextInput
            accessibilityLabel="STUN services"
            value={stun}
            onChangeText={setStun}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            placeholder="stun:host:port"
            placeholderTextColor={c.hint}
            style={[s.input, { minHeight: 90 }]}
          />
          {button("Save discovery settings", () =>
            controller.settings({ stun: stun.trim() })
          )}
          {button(
            "Reconnect",
            () => {
              controller.signaling.reconnect();
            },
            false,
            !state.session
          )}
          {text(
            state.session
              ? `${state.presence} · ${state.session.iceServers.length} ICE configuration entries`
              : "No active room",
            true
          )}
        </>
      )}
      <Text style={s.section}>NOTIFICATIONS & PRIVACY</Text>
      {card(
        <>
          {toggle(
            "Notifications",
            state.settings.notifications,
            () => controller.notifications(!state.settings.notifications),
            "Private previews: message text and peer names are hidden."
          )}
          {toggle("Send read receipts", state.settings.readReceipts, () =>
            controller.settings({ readReceipts: !state.settings.readReceipts })
          )}
          {toggle("Share typing status", state.settings.typing, () =>
            controller.settings({ typing: !state.settings.typing })
          )}
          {button("Audio, video & notification permissions", () =>
            Linking.openSettings()
          )}
          {button("Privacy & security", () =>
            Alert.alert(
              "Privacy & security",
              "Messages and calls use WebRTC encrypted transport. The hive exchanges connection information over encrypted peer connections. Shared discovery peers can observe network addresses and discovery metadata; six-digit codes are discoverable and require host approval. QR invitations pin the host peer key. History, hive identity and room tokens are encrypted on this device. There is no cloud message store or independently audited identity protection."
            )
          )}
          {button("Clear local history", () =>
            Alert.alert(
              "Clear history?",
              "Delete messages and call history from this device? Flash storage may retain encrypted remnants. This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => run(() => controller.clearHistory()),
                },
              ]
            )
          )}
        </>
      )}
      <Text style={s.section}>ABOUT</Text>
      {card(
        <>
          {text("Pup Connect · Harley’s Studios")}
          {text(`Version ${native.version} · Build ${native.build}`, true)}
          {text("com.harleytg.pupconnect", true)}
          {text(
            "Calls and messaging require both peers to be connected. Suspended or terminated apps cannot receive calls; keep Pup Connect open while waiting. Active calls use a foreground service.",
            true
          )}
          {button("Contact support", () =>
            Linking.openURL(
              "mailto:harleytg.hq@gmail.com?subject=Pup%20Connect%20Support"
            )
          )}
        </>
      )}
    </ScrollView>
  );
  const call = state.call;
  const duration = call?.connectedAt
    ? Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000))
    : 0;
  return (
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <View style={s.header}>
          {icon("fa_bars", "Open menu", () => setMenu(true))}
          <Icon name="ic_paw" size={30} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[s.title, { fontSize: 16 }]}>
              Pup Connect [Beta]
            </Text>
            <Text style={s.small}>
              {state.session
                ? `Room ${state.session.code}`
                : "Private chat · Local identity"}
            </Text>
          </View>
          <Text style={s.badge}>{state.presence}</Text>
          {icon("fa_bell", "Notification settings", () => navigate("Settings"))}
        </View>
        <View style={s.connection}>
          {icon("fa_arrow_left", "Back", () =>
            controller.settings({ tab: "Chats", selected: undefined })
          )}
          {icon(
            "fa_rotate_right",
            "Refresh connection",
            () => controller.signaling.reconnect(),
            !state.session
          )}
          <View style={s.address}>
            <Text style={s.badge}>P2P</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.muted, { fontSize: 9 }]}>HIVE CONNECTION</Text>
              <Text numberOfLines={1} style={[s.text, { fontSize: 11 }]}>
                {state.session
                  ? `${state.session.code} · ${state.presence}`
                  : "No active room"}
              </Text>
            </View>
            {icon(
              "fa_copy",
              "Copy room code",
              () => native.copy(state.session!.code),
              !state.session
            )}
          </View>
        </View>
        {state.error && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss status"
            style={s.error}
            onPress={() => controller.patch({ error: undefined })}
          >
            <Text style={[s.text, { color: c.error }]}>{state.error}</Text>
            <Text style={s.muted}>Tap to dismiss</Text>
          </Pressable>
        )}
        {state.pending && (
          <View style={s.content}>
            {text(
              `${state.pending.name} wants to join. Approve only a person you expect.`
            )}
            <View style={s.row}>
              {button("Approve", () => controller.approve(true), true)}
              {button("Decline", () => controller.approve(false))}
            </View>
          </View>
        )}
        {state.waiting && !roomDialog && (
          <View style={s.content}>
            {text("Connecting / waiting for host approval…", true)}
            {button("Cancel connection", () => {
              controller.signaling.stop();
              controller.patch({ waiting: false });
            })}
          </View>
        )}
        {!state.ready ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              gap: 16,
            }}
          >
            <Icon name="ic_paw" size={80} />
            <ActivityIndicator color={c.cyan} />
          </View>
        ) : (
          <View style={s.body}>
            {state.settings.tab === "Chats" ? (
              wide ? (
                <View style={{ flex: 1, flexDirection: "row" }}>
                  <View
                    style={{
                      width: 310,
                      borderRightWidth: 1,
                      borderColor: c.divider,
                    }}
                  >
                    {list}
                  </View>
                  <View style={{ flex: 1 }}>
                    {selected ? (
                      chat
                    ) : (
                      <View style={s.content}>
                        {title("Your pack is one room away")}
                        {text("Choose a conversation or create a room.", true)}
                        {button("New room", newRoom, true)}
                      </View>
                    )}
                  </View>
                </View>
              ) : selected ? (
                chat
              ) : (
                list
              )
            ) : state.settings.tab === "Calls" ? (
              calls
            ) : state.settings.tab === "Pack" ? (
              pack
            ) : (
              settings
            )}
          </View>
        )}
        <View style={s.nav}>
          {(Object.keys(tabs) as Tab[]).map((tab) => (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityLabel={tab}
              accessibilityState={{ selected: state.settings.tab === tab }}
              onPress={() => navigate(tab)}
              style={[
                s.navItem,
                state.settings.tab === tab && {
                  backgroundColor: c.nav_pressed,
                },
              ]}
            >
              <Icon
                name={tabs[tab]}
                color={state.settings.tab === tab ? c.cyan : c.muted}
              />
              <Text
                style={[
                  s.muted,
                  {
                    fontSize: 11,
                    color: state.settings.tab === tab ? c.cyan : c.muted,
                  },
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={menu}
        transparent
        animationType="fade"
        onRequestClose={() => setMenu(false)}
      >
        <Pressable style={s.scrim} onPress={() => setMenu(false)}>
          <Pressable
            style={[s.modal, { alignSelf: "flex-start" }]}
            onPress={() => {}}
          >
            {title("Pup Connect")}
            {text(state.settings.name, true)}
            {(Object.keys(tabs) as Tab[]).map((tab) => (
              <React.Fragment key={tab}>
                {button(tab, () => navigate(tab))}
              </React.Fragment>
            ))}
            {button("Create or join room", newRoom, true)}
            {button("Close menu", () => setMenu(false))}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={roomDialog}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setRoomDialog(false);
        }}
      >
        <View style={s.scrim}>
          <ScrollView
            style={s.modal}
            contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            {title("Connect your pack")}
            {state.error && (
              <Text style={{ color: c.error }}>{state.error}</Text>
            )}
            {text(
              "Create a private room or use a six-digit code / invitation.",
              true
            )}
            {state.waiting && (
              <View style={s.row}>
                <ActivityIndicator color={c.cyan} />
                {text("Connecting / waiting for host approval…", true)}
              </View>
            )}
            {button(
              "Create Room",
              async () => {
                await controller.create();
                setRoomDialog(false);
              },
              true,
              !!state.session || state.waiting
            )}
            <TextInput
              accessibilityLabel="Room code or invitation"
              value={join}
              onChangeText={setJoin}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={1024}
              placeholder="Six-digit code or invitation"
              placeholderTextColor={c.hint}
              style={s.input}
            />
            {button(
              "Join Room",
              async () => {
                await controller.join(join);
                setRoomDialog(false);
              },
              true,
              !!state.session || state.waiting || !join.trim()
            )}
            {button("Scan QR invitation", async () => {
              const raw = await native.scan();
              if (raw) setJoin(raw);
            })}
            {!!state.session &&
              text(
                "Leave the active room in Pack before joining another.",
                true
              )}
            {button("Close", () => setRoomDialog(false))}
          </ScrollView>
        </View>
      </Modal>
      <Modal
        visible={qr && !!state.session}
        transparent
        onRequestClose={() => setQr(false)}
      >
        <View style={s.scrim}>
          <View style={s.modal}>
            {title("Room invitation")}
            <View
              style={{
                padding: 18,
                backgroundColor: "#fff",
                alignSelf: "center",
                borderRadius: 12,
              }}
            >
              {state.session && (
                <QRCode
                  value={controller.invitation()}
                  size={Math.max(80, Math.min(width - 110, height - 220, 260))}
                />
              )}
            </View>
            {text(
              "This QR code grants access to your room. Share it privately.",
              true
            )}
            {button("Close", () => setQr(false))}
          </View>
        </View>
      </Modal>
      <Modal visible={!!call} animationType="slide" onRequestClose={() => {}}>
        <SafeAreaView style={s.call}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, gap: 12, paddingBottom: 12 }}
          >
            {state.error && (
              <View style={s.card}>
                <Text style={{ color: c.error }}>{state.error}</Text>
                {button("Open Android permissions", () =>
                  Linking.openSettings()
                )}
                {button("Dismiss call status", () =>
                  controller.patch({ error: undefined })
                )}
              </View>
            )}
            {call && (
              <>
                {title(`${call.video ? "Video" : "Voice"} call`)}
                {text(peer?.name || "Your peer")}
                {text(
                  `${
                    call.phase === "incoming"
                      ? "Incoming call"
                      : call.phase === "outgoing"
                      ? "Calling…"
                      : call.phase === "connecting"
                      ? "Connecting…"
                      : `${Math.floor(duration / 60)}:${String(
                          duration % 60
                        ).padStart(2, "0")}`
                  } · ${call.quality}`,
                  true
                )}
                {call.video && call.phase !== "incoming" && (
                  <View
                    style={{
                      height: Math.max(220, Math.min(height * 0.5, 540)),
                      gap: 8,
                    }}
                  >
                    {state.remoteStream ? (
                      <RTCView
                        streamURL={state.remoteStream}
                        style={s.video}
                        objectFit="contain"
                      />
                    ) : (
                      <View
                        style={[
                          s.video,
                          { alignItems: "center", justifyContent: "center" },
                        ]}
                      >
                        {text("Waiting for peer video", true)}
                      </View>
                    )}
                    {state.localStream && call.camera && (
                      <RTCView
                        streamURL={state.localStream}
                        mirror
                        objectFit="contain"
                        style={{
                          height: Math.min(height / 4, 160),
                          width: "45%",
                          alignSelf: "flex-end",
                        }}
                      />
                    )}
                  </View>
                )}
                {call.phase === "incoming" ? (
                  <>
                    {button("Accept call", () => controller.accept(), true)}
                    {button("Decline call", () =>
                      controller.endCall("declined")
                    )}
                  </>
                ) : (
                  <>
                    <View style={[s.row, { flexWrap: "wrap" }]}>
                      {button(
                        call.muted ? "Unmute microphone" : "Mute microphone",
                        () => controller.mute()
                      )}
                      {button(
                        call.route === "speaker"
                          ? "Use earpiece"
                          : "Use speaker",
                        () =>
                          controller.route(
                            call.route === "speaker" ? "earpiece" : "speaker"
                          )
                      )}
                      {button("Use Bluetooth", () =>
                        controller.route("bluetooth")
                      )}
                    </View>
                    {call.video && (
                      <View style={[s.row, { flexWrap: "wrap" }]}>
                        {button(
                          call.camera ? "Disable camera" : "Enable camera",
                          () => controller.camera()
                        )}
                        {button(
                          "Switch camera",
                          () => controller.switchCamera(),
                          false,
                          !state.localStream
                        )}
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </ScrollView>
          {call &&
            call.phase !== "incoming" &&
            button("End call", () => controller.endCall("ended"), true)}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
