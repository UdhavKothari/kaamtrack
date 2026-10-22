"use client";

import { useCallback, useEffect, useState } from "react";
import { FILTERS, filterLots, missingFields, PROCESSES, showDate, UNITS, whatsappLink, type Filter, type LotForm, type PublicLot } from "@/lib/lots";
import { CameraIcon, StatusIcon } from "./StatusIcon";
import WhatsAppTimeline from "./WhatsAppTimeline";

type BoardLot = PublicLot & { overdue: boolean; days_out: number; can_auto_remind: boolean; wa_on: boolean };

const EMPTY: LotForm = { job_worker: "", phone: "", process: "", quantity: "", unit: "metres", promised_date: "" };
const LABELS: Record<keyof LotForm, string> = {
  job_worker: "Job worker",
  phone: "Job worker WhatsApp",
  process: "Process",
  quantity: "Quantity",
  unit: "Unit",
  promised_date: "Promised date",
};

// Phone photos are 4-8 MB; Vercel rejects uploads over 4.5 MB. Draw a smaller copy on a canvas first.
async function scaled(file: File, max: number) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
// ~1600px JPEG for the AI to read.
async function forReading(file: File): Promise<Blob> {
  const canvas = await scaled(file, 1600);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("shrink failed"))), "image/jpeg", 0.85));
}
// ~1100px JPEG, a few hundred KB at most, kept with the lot so it can be checked against the paper later.
async function forKeeping(file: File): Promise<string> {
  return (await scaled(file, 1100)).toDataURL("image/jpeg", 0.7);
}

export default function Home() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [kept, setKept] = useState<string | null>(null);
  const [card, setCard] = useState<LotForm | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [unclear, setUnclear] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [reading, setReading] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [lots, setLots] = useState<BoardLot[]>([]);
  const [boardError, setBoardError] = useState("");
  // "Now" is read after the page loads (Next doesn't allow reading the clock while it prepares the page).
  const [clock, setClock] = useState<Date | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [reminding, setReminding] = useState("");
  const [openChat, setOpenChat] = useState("");
  const [openPhoto, setOpenPhoto] = useState("");
  const [rowNote, setRowNote] = useState<{ token: string; text: string } | null>(null);

  const loadLots = useCallback(async () => {
    try {
      const res = await fetch("/api/lots", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLots(data);
      setClock(new Date());
      setBoardError("");
    } catch {
      setBoardError("Couldn't load lots. Retrying…");
    }
  }, []);

  // Refresh the board every 10 s, only while this tab is visible (each refresh is one Redis read).
  useEffect(() => {
    loadLots();
    const id = setInterval(() => document.visibilityState === "visible" && loadLots(), 10_000);
    const onShow = () => document.visibilityState === "visible" && loadLots();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [loadLots]);

  function resetCard(next: LotForm | null = null) {
    if (photo?.startsWith("blob:")) URL.revokeObjectURL(photo);
    setCard(next);
    setEditing(null);
    setUnclear([]);
    setPhoto(null);
    setKept(null);
    setSeconds(null);
    setNotice("");
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    resetCard();
    setPhoto(URL.createObjectURL(file));
    setReading(true);
    const started = performance.now();
    forKeeping(file).then(setKept).catch(() => {}); // keeping the photo is a bonus; never block the lot on it
    try {
      const body = new FormData();
      body.append("photo", await forReading(file), "challan.jpg");
      const res = await fetch("/api/extract", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCard(data.form);
      setUnclear(data.unclear);
      if (!data.form.phone) prefillPhone(data.form.job_worker);
      setNotice(data.error ?? (data.isChallan ? "" : "This doesn't look like a challan. Check the photo, or type the details below."));
    } catch (e) {
      setCard({ ...EMPTY });
      setNotice(e instanceof Error && e.message ? e.message : "Couldn't read this file. Please type the details below.");
    } finally {
      setSeconds((performance.now() - started) / 1000);
      setReading(false);
    }
  }

  function edit(k: keyof LotForm, v: string) {
    setCard((c) => (c ? { ...c, [k]: v } : c));
    setUnclear((u) => u.filter((f) => f !== k));
  }

  // Staff type a job worker's number once; after that it fills in when the name matches.
  async function prefillPhone(name: string) {
    if (!name.trim()) return;
    try {
      const res = await fetch(`/api/workers?name=${encodeURIComponent(name.trim())}`);
      const { phone } = await res.json();
      if (!phone) return;
      setCard((c) => (c && !c.phone ? { ...c, phone } : c));
      setUnclear((u) => u.filter((f) => f !== "phone"));
    } catch {
      // no remembered number; staff type it
    }
  }

  async function save() {
    if (!card || missingFields(card).length) return;
    setSaving(true);
    try {
      const url = editing ? `/api/lots/${editing}/edit` : "/api/lots";
      const body = editing ? card : { ...card, photo: kept ?? undefined };
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      resetCard();
      setNotice(editing ? "Changes saved." : "Lot saved. Send the status link to the job worker from the board below.");
      loadLots();
    } catch (e) {
      setNotice(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // Open a saved lot on the card to fix it. The link, status and history stay the same.
  async function startEdit(l: BoardLot) {
    try {
      const res = await fetch(`/api/lots/${l.token}/edit`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      resetCard(data.form);
      setEditing(l.token);
      if (l.has_photo) setPhoto(`/api/lots/${l.token}/photo`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setRowNote({ token: l.token, text: e instanceof Error && e.message ? e.message : "Couldn't open this lot." });
    }
  }

  async function removeLot(l: BoardLot) {
    if (!window.confirm(`Delete the lot for ${l.job_worker} (${l.quantity} ${l.unit})? Its status link stops working. This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/lots/${l.token}/delete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLots((all) => all.filter((x) => x.token !== l.token));
      if (editing === l.token) resetCard();
    } catch (e) {
      setRowNote({ token: l.token, text: e instanceof Error && e.message ? e.message : "Couldn't delete the lot." });
    }
  }

  async function remind(token: string) {
    setReminding(token);
    setRowNote(null);
    try {
      const res = await fetch(`/api/lots/${token}/remind`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRowNote({ token, text: "Reminder sent on WhatsApp ✓" });
      setOpenChat(token); // show the conversation so the reminder is visible straight away
      loadLots();
    } catch (e) {
      setRowNote({ token, text: e instanceof Error && e.message ? e.message : "Couldn't send the reminder." });
    } finally {
      setReminding("");
    }
  }

  // Free route: opens this job worker's WhatsApp chat with the reminder typed in; the owner taps Send.
  async function nudge(token: string) {
    const tab = window.open("", "_blank"); // opened first, inside the tap, so the browser doesn't block it
    setRowNote(null);
    try {
      const res = await fetch(`/api/lots/${token}/nudge`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (tab) tab.location.href = data.url;
      else window.location.href = data.url;
    } catch (e) {
      tab?.close();
      setRowNote({ token, text: e instanceof Error && e.message ? e.message : "Couldn't open WhatsApp." });
    }
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${token}`);
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? "" : c)), 2000);
    } catch {
      setRowNote({ token, text: "Couldn't copy. Use Send on WhatsApp instead." });
    }
  }

  const missing = card ? missingFields(card) : [];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const now = clock ?? new Date(0);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, filterLots(lots, f.key, "", now).length])) as Record<Filter, number>;
  const shown = filterLots(lots, filter, query, now).sort((a, b) => Number(b.overdue) - Number(a.overdue));

  return (
    <main className="wide">
      <header>
        <h1>KaamTrack</h1>
        <p className="muted">Challan photo in, tracked lot out.</p>
      </header>

      <section className="panel">
        <div className="row">
          <label className="button primary">
            <CameraIcon /> Snap challan
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} disabled={reading} />
          </label>
          <button className="button" onClick={() => resetCard({ ...EMPTY })}>
            Type lot instead
          </button>
        </div>

        {reading && <p className="reading" role="status">Reading challan…</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        {card && (
          <div className="capture">
            {photo && <img src={photo} alt="Challan photo" className="photo" />}
            <form className="card" onSubmit={(e) => { e.preventDefault(); save(); }}>
              {editing && <p className="notice">Editing a saved lot. Its link, status and history stay the same.</p>}
              {seconds !== null && <p className="muted small">Read in {seconds.toFixed(1)} s. Check every field before saving.</p>}
              {(["job_worker", "phone", "process", "quantity", "promised_date"] as const).map((k) => (
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
                  ) : k === "phone" ? (
                    <div className="row">
                      <span className="prefix">+91</span>
                      <input type="tel" inputMode="numeric" autoComplete="off" placeholder="98765 43210" value={card.phone} onChange={(e) => edit("phone", e.target.value)} />
                    </div>
                  ) : (
                    <input
                      type={k === "promised_date" ? "date" : "text"}
                      value={card[k]}
                      onChange={(e) => edit(k, e.target.value)}
                      onBlur={k === "job_worker" ? () => prefillPhone(card.job_worker) : undefined}
                    />
                  )}
                </label>
              ))}
              <div className="row">
                <button className="button primary" disabled={saving || missing.length > 0}>
                  {saving ? "Saving…" : missing.length ? `Fill ${missing.length} red field${missing.length > 1 ? "s" : ""} to save` : editing ? "Save changes" : "Save lot"}
                </button>
                {editing && <button type="button" className="button" onClick={() => resetCard()}>Cancel</button>}
              </div>
            </form>
          </div>
        )}
      </section>

      <section>
        <h2>
          Lots out <span className="muted">({counts.all}{counts.overdue ? `, ${counts.overdue} overdue` : ""})</span>
        </h2>
        {boardError && <p className="notice" role="alert">{boardError}</p>}

        {lots.length > 0 && (
          <div className="board-tools">
            <div className="chips" role="group" aria-label="Show lots">
              {FILTERS.map((f) => (
                <button key={f.key} className={`chip ${f.key === "overdue" && counts.overdue ? "alert" : ""}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                  {f.label} <span className="count">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            <input className="search" type="search" placeholder="Search job worker" aria-label="Search by job worker" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        )}

        {!lots.length && !boardError && <p className="muted">No lots yet. Snap a challan to start.</p>}
        {lots.length > 0 && !shown.length && (
          <p className="muted">
            No lots match.{" "}
            <button className="link" onClick={() => { setFilter("all"); setQuery(""); }}>Show all lots</button>
          </p>
        )}

        <ul className="board">
          {shown.map((l) => (
            <li key={l.token} className={`lot ${l.overdue ? "overdue" : ""}`}>
              <div className="lot-main">
                <strong>{l.job_worker}</strong>
                <span className="muted">
                  {l.process} · {l.quantity} {l.unit}
                </span>
              </div>
              <span className={`status s-${l.status.replace(/\s/g, "").toLowerCase()}`}>
                <StatusIcon status={l.status} size={16} /> {l.status}
              </span>
              <span className="muted small">
                {l.days_out} day{l.days_out === 1 ? "" : "s"} out · promised {showDate(l.promised_date)}
                {l.overdue && <strong> · OVERDUE</strong>}
              </span>
              <div className="row">
                <a className="button small" href={whatsappLink(l, origin)} target="_blank" rel="noreferrer">
                  Send on WhatsApp
                </a>
                <button className="button small" onClick={() => copyLink(l.token)} aria-live="polite">
                  {copied === l.token ? "Copied ✓" : "Copy link"}
                </button>
                {l.has_phone && l.status !== "Dispatched" && (
                  <button className="button small" onClick={() => nudge(l.token)}>
                    Nudge on WhatsApp
                  </button>
                )}
                {l.has_phone && l.can_auto_remind && l.status !== "Dispatched" && (
                  <button className="button small" onClick={() => remind(l.token)} disabled={reminding === l.token}>
                    {reminding === l.token ? "Sending…" : "Send reminder now"}
                  </button>
                )}
                {l.has_phone && l.wa_on && (
                  <button className="button small" onClick={() => setOpenChat((c) => (c === l.token ? "" : l.token))} aria-expanded={openChat === l.token}>
                    {openChat === l.token ? "Hide WhatsApp" : "WhatsApp"}
                  </button>
                )}
              </div>
              <div className="row">
                {l.has_photo && (
                  <button className="button small" onClick={() => setOpenPhoto((c) => (c === l.token ? "" : l.token))} aria-expanded={openPhoto === l.token}>
                    {openPhoto === l.token ? "Hide challan photo" : "Challan photo"}
                  </button>
                )}
                <button className="button small" onClick={() => startEdit(l)}>Edit</button>
                <button className="button small danger" onClick={() => removeLot(l)}>Delete</button>
              </div>
              {l.last_reminded_at && (
                <span className="muted small">
                  Last reminder {new Date(l.last_reminded_at).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                </span>
              )}
              {rowNote?.token === l.token && <span className="small" role="status">{rowNote.text}</span>}
              {openPhoto === l.token && (
                <a href={`/api/lots/${l.token}/photo`} target="_blank" rel="noreferrer">
                  <img src={`/api/lots/${l.token}/photo`} alt={`Challan photo for ${l.job_worker}`} className="photo" loading="lazy" />
                </a>
              )}
              {openChat === l.token && <WhatsAppTimeline token={l.token} onChanged={loadLots} />}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
