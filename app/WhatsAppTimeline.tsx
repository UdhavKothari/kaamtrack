"use client";

import { useCallback, useEffect, useState } from "react";
import type { Msg } from "@/lib/inbound";

type Data = { mode: "mock" | "meta"; messages: Msg[] };

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const STATE = { sent: "Sent", delivered: "Delivered", read: "Read", failed: "Failed" } as const;
const QUICK = ["1 Received", "2 In process", "3 Ready", "4 Dispatched"];

// One lot's WhatsApp conversation: our reminders, the job worker's replies, and what the app did about them.
// While simulating, it also lets you play the job worker.
export default function WhatsAppTimeline({ token, onChanged }: { token: string; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/lots/${token}/messages`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
      setError("");
    } catch {
      setError("Couldn't load messages.");
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 3000);
    return () => clearInterval(id);
  }, [load]);

  async function reply(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, text }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setDraft("");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  }

  const simulating = data?.mode === "mock";

  return (
    <div className="wa">
      {simulating && <p className="wa-banner">Simulated WhatsApp. Nothing is sent to a real phone. This is exactly what a job worker would see and how the app answers.</p>}
      {error && <p className="notice" role="alert">{error}</p>}

      <div className="wa-log" role="log" aria-label="WhatsApp conversation" aria-live="polite">
        {data && !data.messages.length && <p className="muted small">No messages yet. Send a reminder, or reply as the job worker below.</p>}
        {data?.messages.map((m) =>
          m.dir === "note" ? (
            <p key={m.id} className="wa-note">{m.text} · {clock(m.at)}</p>
          ) : (
            <div key={m.id} className={`bubble ${m.dir}`}>
              <p>{m.text}</p>
              <span className="bubble-meta">
                {m.dir === "out" ? (m.kind === "reminder" ? "Reminder from KaamTrack" : "Reply from KaamTrack") : "Job worker"} · {clock(m.at)}
                {m.dir === "out" && m.state && <strong className={`tick ${m.state}`}> · {STATE[m.state]}</strong>}
                {m.error && <em> ({m.error})</em>}
              </span>
            </div>
          ),
        )}
      </div>

      {simulating && (
        <form className="wa-sim" onSubmit={(e) => { e.preventDefault(); reply(draft); }}>
          <span className="small muted">Reply as the job worker (simulated)</span>
          <div className="row">
            {QUICK.map((q) => (
              <button key={q} type="button" className="button small" disabled={sending} onClick={() => reply(q[0])}>{q}</button>
            ))}
          </div>
          <div className="row">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder='Type a reply, e.g. "ho gaya"' maxLength={500} aria-label="Reply as the job worker" />
            <button className="button small primary" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
