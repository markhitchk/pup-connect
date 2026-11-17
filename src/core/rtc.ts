import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
} from "react-native-webrtc";
import type RTCDataChannel from "react-native-webrtc/lib/typescript/RTCDataChannel";
import {
  dataPacket,
  type DataPacket,
  type IceServer,
  type RtcSignal,
} from "../../shared/protocol";
export type Lane = "data" | "media";
export class PeerLane {
  readonly pc: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private candidates: Extract<RtcSignal, { kind: "ice" }>["candidate"][] = [];
  private closed = false;
  private negotiating = false;
  constructor(
    readonly lane: Lane,
    readonly generation: string,
    ice: IceServer[],
    private relayOnly: boolean,
    private signal: (p: RtcSignal) => void,
    private change: (status: string) => void,
    private receive: (p: DataPacket) => void,
    private stream: (s: MediaStream) => void,
    private error: (e: unknown) => void,
    private callId?: string
  ) {
    this.pc = new RTCPeerConnection({
      iceServers: ice,
      iceTransportPolicy: relayOnly ? "relay" : "all",
    });
    this.pc.addEventListener("icecandidate", (e) => {
      if (e.candidate && !this.closed)
        this.signal({
          kind: "ice",
          lane,
          generation,
          candidate: {
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid ?? null,
            sdpMLineIndex: e.candidate.sdpMLineIndex ?? null,
          },
        });
    });
    this.pc.addEventListener("connectionstatechange", () => {
      if (!this.closed) this.change(this.pc.connectionState);
    });
    this.pc.addEventListener("datachannel", (e) => this.bind(e.channel));
    this.pc.addEventListener("track", (e) => {
      if (!this.closed && e.streams[0]) this.stream(e.streams[0]);
    });
  }
  private bind(ch: RTCDataChannel) {
    if (this.channel && this.channel !== ch) {
      ch.close();
      return;
    }
    this.channel = ch;
    ch.addEventListener("open", () => this.change("open"));
    ch.addEventListener("close", () => {
      if (!this.closed) this.change("disconnected");
    });
    ch.addEventListener("message", (e) => {
      if (this.closed || typeof e.data !== "string" || e.data.length > 20000)
        return;
      try {
        const p = dataPacket.safeParse(JSON.parse(e.data));
        if (p.success) this.receive(p.data);
      } catch {
        /* Malformed peer packets are ignored, never logged. */
      }
    });
  }
  async offer(restart = false) {
    if (this.closed || this.negotiating || this.pc.signalingState !== "stable")
      return;
    this.negotiating = true;
    try {
      if (this.lane === "data" && !this.channel)
        this.bind(
          this.pc.createDataChannel("pup-messages-v1", { ordered: true })
        );
      const offer = await this.pc.createOffer({ iceRestart: restart });
      if (this.closed) return;
      await this.pc.setLocalDescription(offer);
      this.signal({
        kind: "offer",
        lane: this.lane,
        generation: this.generation,
        callId: this.callId,
        sdp: offer.sdp!,
      });
    } finally {
      this.negotiating = false;
    }
  }
  async handle(p: RtcSignal) {
    if (this.closed || p.kind === "restart" || p.generation !== this.generation)
      return;
    if (p.kind === "ice") {
      if (this.pc.remoteDescription)
        await this.pc.addIceCandidate(new RTCIceCandidate(p.candidate));
      else if (this.candidates.length < 128) this.candidates.push(p.candidate);
      return;
    }
    if (p.kind === "answer" && this.pc.signalingState !== "have-local-offer")
      return;
    await this.pc.setRemoteDescription(
      new RTCSessionDescription({ type: p.kind, sdp: p.sdp })
    );
    for (const candidate of this.candidates.splice(0))
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    if (p.kind === "offer") {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.signal({
        kind: "answer",
        lane: this.lane,
        generation: this.generation,
        sdp: answer.sdp!,
      });
    }
  }
  send(packet: DataPacket): boolean {
    if (
      this.channel?.readyState !== "open" ||
      this.channel.bufferedAmount > 256000
    )
      return false;
    try {
      this.channel.send(JSON.stringify(packet));
      return true;
    } catch (e) {
      this.error(e);
      return false;
    }
  }
  setIce(ice: IceServer[]) {
    this.pc.setConfiguration({
      iceServers: ice,
      iceTransportPolicy: this.relayOnly ? "relay" : "all",
    });
  }
  close() {
    this.closed = true;
    this.channel?.close();
    this.pc.close();
  }
}
