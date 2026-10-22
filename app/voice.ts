// Record from the phone's microphone and hand back a 16 kHz mono WAV.
// Phones record webm or mp4; WAV is the one format the AI step accepts from every phone, so convert here.
export const MAX_SECONDS = 60;

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start();

  // Resolves with the WAV once stop() is called (or after MAX_SECONDS).
  const done = new Promise<Blob>((ok, fail) => {
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      try {
        ok(toWav(await new Blob(chunks).arrayBuffer()));
      } catch (e) {
        fail(e);
      }
    };
  });
  const timer = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000);
  return { done, stop: () => { clearTimeout(timer); if (rec.state === "recording") rec.stop(); } };
}

async function toWav(raw: ArrayBuffer): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  const pcm = (await ctx.decodeAudioData(raw)).getChannelData(0);
  void ctx.close();
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); out.setUint32(4, 36 + pcm.length * 2, true); text(8, "WAVEfmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  text(36, "data"); out.setUint32(40, pcm.length * 2, true);
  pcm.forEach((s, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([out], { type: "audio/wav" });
}
