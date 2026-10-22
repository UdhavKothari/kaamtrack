"use client";

import { useCallback, useEffect, useState } from "react";
import { missingFields, PROCESSES, UNITS, whatsappLink, type Lot, type LotForm } from "@/lib/lots";

type BoardLot = Lot & { overdue: boolean; days_out: number };

const EMPTY: LotForm = { job_worker: "", process: "", quantity: "", unit: "metres", promised_date: "" };
const LABELS: Record<keyof LotForm, string> = {
  job_worker: "Job worker",
  process: "Process",
  quantity: "Quantity",
  unit: "Unit",
  promised_date: "Promised date",
};

// Phone photos are 4-8 MB; Vercel rejects uploads over 4.5 MB. Shrink to ~1600px JPEG first.
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("shrink failed"))), "image/jpeg", 0.85));
}

export default function Home() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [card, setCard] = useState<LotForm | null>(null);
  const [unclear, setUnclear] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [reading, setReading] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [lots, setLots] = useState<BoardLot[]>([]);
  const [boardError, setBoardError] = useState("");

  const loadLots = useCallback(async () => {
    try {
      const res = await fetch("/api/lots", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLots(data);
      setBoardError("");
    } catch {
      setBoardError("Couldn't load lots. Retrying…");
    }
  }, []);

  // Refresh the board every 5 s, only while this tab is visible (each refresh costs an n8n run).
  useEffect(() => {
    loadLots();
    const id = setInterval(() => document.visibilityState === "visible" && loadLots(), 5000);
    const onShow = () => document.visibilityState === "visible" && loadLots();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [loadLots]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(file));
    setCard(null);
    setNotice("");
    setSeconds(null);
    setReading(true);
    const started = performance.now();
    try {
      const body = new FormData();
      body.append("photo", await shrink(file), "challan.jpg");
      const res = await fetch("/api/extract", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCard(data.form);
      setUnclear(data.unclear);
      setNotice(data.error ?? (data.isChallan ? "" : "This doesn't look like a challan. Check the photo, or type the details below."));
    } catch {
      setCard({ ...EMPTY });
      setUnclear([]);
      setNotice("Couldn't read this file. Please type the details below.");
    } finally {
      setSeconds((performance.now() - started) / 1000);
      setReading(false);
    }
  }

  function edit(k: keyof LotForm, v: string) {
    setCard((c) => (c ? { ...c, [k]: v } : c));
    setUnclear((u) => u.filter((f) => f !== k));
  }

  async function save() {
    if (!card || missingFields(card).length) return;
    setSaving(true);
    try {
      const res = await fetch("/api/lots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLots((l) => [{ ...data, overdue: false, days_out: 0 }, ...l]);
      setCard(null);
      setPhoto(null);
      setNotice("Lot saved. Send the status link to the job worker from the board below.");
    } catch (e) {
      setNotice(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const missing = card ? missingFields(card) : [];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const board = [...lots].sort((a, b) => Number(b.overdue) - Number(a.overdue));
  const overdueCount = lots.filter((l) => l.overdue).length;

  return (
    <main>
      <header>
        <h1>KaamTrack</h1>
        <p className="muted">Challan photo in, tracked lot out.</p>
      </header>

      <section className="panel">
        <div className="row">
          <label className="button primary">
            📷 Snap challan
            <input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} disabled={reading} />
          </label>
          <button className="button" onClick={() => { setCard({ ...EMPTY }); setUnclear([]); setPhoto(null); setNotice(""); setSeconds(null); }}>
            Type lot instead
          </button>
        </div>

        {reading && <p className="reading">Reading challan…</p>}
        {notice && <p className="notice">{notice}</p>}

        {card && (
          <div className="capture">
            {photo && <img src={photo} alt="Challan photo" className="photo" />}
            <form className="card" onSubmit={(e) => { e.preventDefault(); save(); }}>
              {seconds !== null && <p className="muted small">Read in {seconds.toFixed(1)} s. Check every field before saving.</p>}
              {(["job_worker", "process", "quantity", "promised_date"] as const).map((k) => (
                <label key={k} className={`field ${missing.includes(k) ? "missing" : ""}`}>
                  <span>
                    {LABELS[k]} {unclear.includes(k) && <em className="tag">unclear</em>}
                    {missing.includes(k) && <em className="req">required</em>}
                  </span>
                  {k === "process" ? (
                    <select value={card.process} onChange={(e) => edit("process", e.target.value)}>
                      <option value="">Choose…</option>
                      {PROCESSES.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  ) : k === "quantity" ? (
                    <div className="row">
                      <input type="number" inputMode="decimal" min="0" step="any" value={card.quantity} onChange={(e) => edit("quantity", e.target.value)} />
                      <select value={card.unit} onChange={(e) => edit("unit", e.target.value)} aria-label="Unit">
                        {UNITS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                  ) : (
                    <input type={k === "promised_date" ? "date" : "text"} value={card[k]} onChange={(e) => edit(k, e.target.value)} />
                  )}
                </label>
              ))}
              <button className="button primary" disabled={saving || missing.length > 0}>
                {saving ? "Saving…" : missing.length ? `Fill ${missing.length} red field${missing.length > 1 ? "s" : ""} to save` : "Save lot"}
              </button>
            </form>
          </div>
        )}
      </section>

      <section>
        <h2>
          Lots out <span className="muted">({lots.length}{overdueCount ? `, ${overdueCount} overdue` : ""})</span>
        </h2>
        {boardError && <p className="notice">{boardError}</p>}
        {!lots.length && !boardError && <p className="muted">No lots yet. Snap a challan to start.</p>}
        <ul className="board">
          {board.map((l) => (
            <li key={l.token} className={`lot ${l.overdue ? "overdue" : ""}`}>
              <div className="lot-main">
                <strong>{l.job_worker}</strong>
                <span className="muted">
                  {l.process} · {l.quantity} {l.unit}
                </span>
              </div>
              <span className={`status s-${l.status.replace(/\s/g, "").toLowerCase()}`}>{l.status}</span>
              <span className="muted small">
                {l.days_out} day{l.days_out === 1 ? "" : "s"} out · promised {l.promised_date}
                {l.overdue && <strong> · OVERDUE</strong>}
              </span>
              <div className="row">
                <a className="button small" href={whatsappLink(l, origin)} target="_blank" rel="noreferrer">
                  Send on WhatsApp
                </a>
                <button className="button small" onClick={() => navigator.clipboard.writeText(`${origin}/s/${l.token}`)}>
                  Copy link
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
