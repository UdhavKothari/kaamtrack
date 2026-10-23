"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { qtyText, showDate, STATUSES, type PublicLot } from "@/lib/lots";
import { MicIcon, StatusIcon, StopIcon } from "../../StatusIcon";
import Notes from "../../Notes";
import { startRecording } from "../../voice";

// The job worker's page: one lot, four buttons, a remark box and a voice note, no login.
// useParams() only has a value at request time, so Next needs it inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<main><h1>KaamTrack</h1><p className="reading">Loading…</p></main>}>
      <StatusPage />
    </Suspense>
  );
}

function StatusPage() {
  const { token } = useParams<{ token: string }>();
  const [lot, setLot] = useState<PublicLot | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [done, setDone] = useState("");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const rec = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null);

  useEffect(() => {
    fetch(`/api/lots/${token}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(r.status === 404 ? "Lot not found. Please check the link." : data.error);
        setLot(data);
      })
      .catch((e) => setError(e.message || "Couldn't load this lot."));
  }, [token]);

  async function tap(status: string) {
    setSaving(status);
    setDone("");
    setError("");
    try {
      const r = await fetch(`/api/lots/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setLot((l) => (l ? { ...l, ...data } : l));
      setDone("Updated ✓ The owner can see it now.");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't update. Try again.");
    } finally {
      setSaving("");
    }
  }

  // Send a typed remark or a recorded WAV; the server reads the voice note with the AI.
  async function sendNote(audio?: Blob) {
    setSending(true);
    setDone("");
    setError("");
    try {
      const body = new FormData();
      if (audio) body.append("audio", audio, "note.wav");
      else body.append("text", text);
      const r = await fetch(`/api/lots/${token}/note`, { method: "POST", body });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setLot((l) => (l ? { ...l, notes: data.notes } : l));
      if (!audio) setText("");
      setDone("Note sent ✓ The owner can see it now.");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't send the note. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function toggleRecording() {
    setError("");
    if (rec.current) {
      rec.current.stop();
      return;
    }
    try {
      const r = await startRecording();
      rec.current = r;
      setRecording(true);
      const wav = await r.done;
      rec.current = null;
      setRecording(false);
      await sendNote(wav);
    } catch {
      rec.current = null;
      setRecording(false);
      setError("Couldn't use the microphone. Allow it in your browser, or type your note.");
    }
  }

  if (error && !lot) return <main><h1>KaamTrack</h1><p className="notice">{error}</p></main>;
  if (!lot) return <main><h1>KaamTrack</h1><p className="reading">Loading…</p></main>;

  return (
    <main className="worker">
      <h1>KaamTrack</h1>
      <div className="panel">
        <p>
          <strong>{qtyText(lot)}</strong> for <strong>{lot.process}</strong>
          {lot.quality && <> · {lot.quality}</>}
        </p>
        <p className="muted">
          {lot.facility ? `${lot.facility} · ` : ""}Job worker: {lot.job_worker} · Promised: {showDate(lot.promised_date)}
          {lot.challan_no && <> · Challan {lot.challan_no}</>}{lot.taka > 0 && <> · {lot.taka} taka</>}
        </p>
      </div>
      <p>Tap the current status of this lot:</p>
      <div className="status-buttons">
        {STATUSES.map((s) => (
          <button key={s} className={`button big s-btn s-${s.replace(/\s/g, "").toLowerCase()}`} aria-pressed={lot.status === s} disabled={!!saving} onClick={() => tap(s)}>
            <StatusIcon status={s} size={28} />
            <span>{saving === s ? "Saving…" : s}</span>
            {lot.status === s && <span className="here">Now</span>}
          </button>
        ))}
      </div>

      <form className="remark" onSubmit={(e) => { e.preventDefault(); if (text.trim()) sendNote(); }}>
        <label htmlFor="remark">Anything to tell the owner? (optional)</label>
        <textarea id="remark" rows={3} maxLength={1000} placeholder="For example: 20 metres short, will be ready Friday" value={text} onChange={(e) => setText(e.target.value)} disabled={recording || sending} />
        <div className="row">
          <button className="button primary" disabled={!text.trim() || sending || recording}>{sending && !recording ? "Sending…" : "Send note"}</button>
          <button type="button" className={`button ${recording ? "rec" : ""}`} onClick={toggleRecording} disabled={sending}>
            {recording ? <><StopIcon /> Stop and send</> : <><MicIcon /> Record voice note</>}
          </button>
        </div>
        {recording && <p className="reading" role="status">Recording… speak, then tap Stop (up to 1 minute).</p>}
        {sending && <p className="reading" role="status">Sending…</p>}
      </form>

      {done && <p className="done" role="status">{done}</p>}
      {error && <p className="notice" role="alert">{error}</p>}
      <Notes notes={lot.notes} />
    </main>
  );
}
