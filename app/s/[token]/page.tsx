"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { STATUSES, type Lot } from "@/lib/lots";
import { StatusIcon } from "../../StatusIcon";

// The job worker's page: one lot, four buttons, no login.
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
  const [lot, setLot] = useState<Lot | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [done, setDone] = useState(false);

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
    setDone(false);
    try {
      const r = await fetch(`/api/lots/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setLot((l) => (l ? { ...l, ...data } : l));
      setDone(true);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't update. Try again.");
    } finally {
      setSaving("");
    }
  }

  if (error && !lot) return <main><h1>KaamTrack</h1><p className="notice">{error}</p></main>;
  if (!lot) return <main><h1>KaamTrack</h1><p className="reading">Loading…</p></main>;

  return (
    <main className="worker">
      <h1>KaamTrack</h1>
      <div className="panel">
        <p>
          <strong>{lot.quantity} {lot.unit}</strong> for <strong>{lot.process}</strong>
        </p>
        <p className="muted">Job worker: {lot.job_worker} · Promised: {lot.promised_date}</p>
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
      {done && <p className="done">Updated ✓ The owner can see it now.</p>}
      {error && <p className="notice">{error}</p>}
    </main>
  );
}
