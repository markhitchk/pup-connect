import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import wrtc from "@roamhq/wrtc";
import { createSignaling } from "../src/service.js";
import { client } from "./client.js";
import type { RtcSignal } from "../../shared/protocol.js";
async function until(predicate: () => boolean, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw Error("WebRTC smoke timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
async function main() {
  const turnUrl = process.env.PUP_TEST_TURN_URL;
  const turnSecret = process.env.PUP_TEST_TURN_SECRET;
  assert.equal(
    Boolean(turnUrl),
    Boolean(turnSecret),
    "Supply both TURN test settings"
  );
  const hive = process.env.PUP_TEST_HIVE === "1";
  assert(!(hive && turnUrl), "Hive has no central TURN configuration");
  const { service, a, b } = hive
    ? await require("../../hive/test/webrtc-fixture.cjs")()
    : await (async () => {
        const service = createSignaling(
          turnUrl ? { turn: [turnUrl], turnSecret } : {}
        );
        service.http.listen(0, "127.0.0.1");
        await once(service.http, "listening");
        const addr = service.http.address();
        assert(addr && typeof addr !== "string");
        const url = `ws://127.0.0.1:${addr.port}/ws`;
        const a = await client(url),
          b = await client(url);
        return { service, a, b };
      })();
  a.send({ type: "create", name: "Test A" });
  const { room } = await a.next("room");
  b.send({
    type: "join",
    name: "Test B",
    code: room.code,
    invite: room.invite,
    ...(hive ? { hiveHost: room.hiveHost } : {}),
  });
  const { room: guestRoom } = await b.next("room");
  if (turnUrl) {
    assert(room.iceServers[0]?.username);
    assert(guestRoom.iceServers[0]?.username);
    assert.notEqual(
      room.iceServers[0].username,
      guestRoom.iceServers[0].username
    );
  }
  const pcA = new wrtc.RTCPeerConnection({
      iceServers: room.iceServers,
      iceTransportPolicy: turnUrl ? "relay" : "all",
    }),
    pcB = new wrtc.RTCPeerConnection({
      iceServers: guestRoom.iceServers,
      iceTransportPolicy: turnUrl ? "relay" : "all",
    });
  const generation = randomUUID();
  let chainA = Promise.resolve(),
    chainB = Promise.resolve();
  const errors: unknown[] = [];
  const pending = new Map<RTCPeerConnection, RTCIceCandidateInit[]>([
    [pcA, []],
    [pcB, []],
  ]);
  async function signal(pc: RTCPeerConnection, p: RtcSignal, sender: typeof a) {
    if (p.kind === "restart") return;
    if (p.kind === "ice") {
      if (pc.remoteDescription) await pc.addIceCandidate(p.candidate);
      else pending.get(pc)!.push(p.candidate);
      return;
    }
    await pc.setRemoteDescription({ type: p.kind, sdp: p.sdp });
    for (const ice of pending.get(pc)!.splice(0)) await pc.addIceCandidate(ice);
    if (p.kind === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sender.send({
        type: "signal",
        payload: {
          kind: "answer",
          lane: "data",
          generation,
          sdp: answer.sdp,
        },
      });
    }
  }
  a.socket.on("message", (raw: { toString(): string }) => {
    const p = JSON.parse(raw.toString());
    if (p.type === "signal")
      chainA = chainA
        .then(() => signal(pcA, p.payload, a))
        .catch((e) => {
          errors.push(e);
        });
  });
  b.socket.on("message", (raw: { toString(): string }) => {
    const p = JSON.parse(raw.toString());
    if (p.type === "signal")
      chainB = chainB
        .then(() => signal(pcB, p.payload, b))
        .catch((e) => {
          errors.push(e);
        });
  });
  for (const [pc, sender] of [
    [pcA, a],
    [pcB, b],
  ] as const)
    pc.onicecandidate = (e) => {
      if (e.candidate)
        sender.send({
          type: "signal",
          payload: {
            kind: "ice",
            lane: "data",
            generation,
            candidate: {
              candidate: e.candidate.candidate,
              sdpMid: e.candidate.sdpMid,
              sdpMLineIndex: e.candidate.sdpMLineIndex,
            },
          },
        });
    };
  const audioA = new wrtc.nonstandard.RTCAudioSource(),
    audioB = new wrtc.nonstandard.RTCAudioSource();
  const videoA = new wrtc.nonstandard.RTCVideoSource(),
    videoB = new wrtc.nonstandard.RTCVideoSource();
  const tracks: MediaStreamTrack[] = [];
  const sinks: { stop(): void }[] = [];
  let audioReceivedA = 0,
    audioReceivedB = 0,
    videoReceivedA = 0,
    videoReceivedB = 0;
  for (const [pc, audio, video] of [
    [pcA, audioA, videoA],
    [pcB, audioB, videoB],
  ] as const) {
    for (const track of [audio.createTrack(), video.createTrack()]) {
      tracks.push(track);
      pc.addTrack(track, new wrtc.MediaStream([track]));
    }
    pc.ontrack = (e) => {
      if (e.track.kind === "audio") {
        const sink = new wrtc.nonstandard.RTCAudioSink(e.track);
        sink.ondata = () => {
          if (pc === pcA) audioReceivedA++;
          else audioReceivedB++;
        };
        sinks.push(sink);
      } else {
        const sink = new wrtc.nonstandard.RTCVideoSink(e.track);
        sink.onframe = () => {
          if (pc === pcA) videoReceivedA++;
          else videoReceivedB++;
        };
        sinks.push(sink);
      }
    };
  }
  let atB = "",
    atA = "";
  pcB.ondatachannel = (e) => {
    e.channel.onmessage = (m) => {
      atB = String(m.data);
      e.channel.send("ack:" + m.data);
    };
  };
  const channel = pcA.createDataChannel("pup-test");
  channel.onmessage = (e) => {
    atA = String(e.data);
  };
  const audioTimer = setInterval(() => {
    for (const source of [audioA, audioB])
      source.onData({ samples: new Int16Array(480), sampleRate: 48000 });
  }, 10);
  const videoTimer = setInterval(() => {
    for (const source of [videoA, videoB])
      source.onFrame({
        width: 32,
        height: 32,
        data: new Uint8Array(32 * 32 * 1.5).fill(128),
      });
  }, 33);
  const cleanup = async () => {
    clearInterval(audioTimer);
    clearInterval(videoTimer);
    sinks.forEach((s) => s.stop());
    tracks.forEach((track) => track.stop());
    pcA.close();
    pcB.close();
    a.socket.close();
    b.socket.close();
    await service.stop();
  };
  const offer = await pcA.createOffer();
  await pcA.setLocalDescription(offer);
  a.send({
    type: "signal",
    payload: { kind: "offer", lane: "data", generation, sdp: offer.sdp },
  });
  try {
    await until(() => channel.readyState === "open");
  } catch (e) {
    throw Error(
      JSON.stringify({
        a: pcA.connectionState,
        b: pcB.connectionState,
        iceA: pcA.iceConnectionState,
        iceB: pcB.iceConnectionState,
        signalingA: pcA.signalingState,
        signalingB: pcB.signalingState,
        errors: errors.map(String),
      })
    );
  }
  channel.send("real transport");
  await until(
    () =>
      atA === "ack:real transport" &&
      audioReceivedA > 0 &&
      audioReceivedB > 0 &&
      videoReceivedA > 0 &&
      videoReceivedB > 0
  );
  assert.equal(atB, "real transport");
  assert.deepEqual(errors, []);
  assert(pcA.sctp?.transport.state === "connected");
  async function assertRelay(pc: RTCPeerConnection) {
    const stats = await pc.getStats();
    const reports = [...stats.values()];
    const selectedId = reports.find(
      (s) => s.type === "transport"
    )?.selectedCandidatePairId;
    const pair = selectedId
      ? stats.get(selectedId)
      : reports.find(
          (s) =>
            s.type === "candidate-pair" &&
            s.state === "succeeded" &&
            s.nominated
        );
    assert(pair, "A nominated candidate pair must exist");
    assert.equal(stats.get(pair.localCandidateId)?.candidateType, "relay");
    assert.equal(stats.get(pair.remoteCandidateId)?.candidateType, "relay");
  }
  if (turnUrl) {
    await assertRelay(pcA);
    await assertRelay(pcB);
  }
  // Exercise an actual ICE restart with a new SDP offer and answer.
  const restart = await pcA.createOffer({ iceRestart: true });
  assert.notEqual(
    restart.sdp?.match(/a=ice-ufrag:(.+)/)?.[1],
    offer.sdp?.match(/a=ice-ufrag:(.+)/)?.[1],
    "ICE restart must rotate credentials"
  );
  await pcA.setLocalDescription(restart);
  a.send({
    type: "signal",
    payload: { kind: "offer", lane: "data", generation, sdp: restart.sdp },
  });
  await until(() => pcA.signalingState === "stable");
  channel.send("after restart");
  await until(() => atA === "ack:after restart");
  if (turnUrl) {
    await assertRelay(pcA);
    await assertRelay(pcB);
  }
  await cleanup();
  console.log(
    JSON.stringify({
      dataChannel: true,
      audioBothDirections: audioReceivedA > 0 && audioReceivedB > 0,
      videoBothDirections: videoReceivedA > 0 && videoReceivedB > 0,
      iceRestart: true,
      ...(turnUrl ? { relayBothDirections: true } : {}),
    })
  );
  // Keep the test-only native Node addon inside a disposable process. Its V8
  // shutdown destructor is unstable on Node 24; Android uses a different binding.
  // All assertions and explicit media/socket cleanup complete before this exit.
  process.exit(0);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
