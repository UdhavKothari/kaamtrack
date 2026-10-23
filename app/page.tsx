"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  facilitiesOf, FILTERS, filterLots, missingFields, PROCESSES, qtyText, showDate, stageTotals, toMetres, UNITS, whatsappLink,
  type Filter, type LotForm, type PublicLot,
} from "@/lib/lots";
import { CameraIcon, DocIcon, FilterIcon, PlusIcon, StatusIcon } from "./StatusIcon";
import Notes from "./Notes";
import WhatsAppTimeline from "./WhatsAppTimeline";

type BoardLot = PublicLot & { overdue: boolean; days_out: number; can_auto_remind: boolean; wa_on: boolean };

const EMPTY: LotForm = {
  job_worker: "", facility: "", phone: "", process: "", quality: "", quantity: "", unit: "metres", promised_date: "", challan_no: "", taka: "",
};
const LABELS: Record<keyof LotForm, string> = {
  job_worker: "Job worker",
  facility: "Company / facility",
  phone: "Job worker WhatsApp",
  process: "Process",
  quality: "Fabric quality",
  quantity: "Quantity",
  unit: "Unit",
  promised_date: "Promised date",
  challan_no: "Challan no.",
  taka: "Taka (rolls)",
};
const FIELDS = ["facility", "job_worker", "phone", "process", "quality", "quantity", "taka", "promised_date", "challan_no"] as const;
const OPTIONAL = ["facility", "quality", "taka", "challan_no"];
const slug = (s: string) => s.replace(/\s/g, "").toLowerCase();

// A challan waiting to be checked: one per photo, or one per PDF page.
type Pending = { form: LotForm; unclear: string[]; kept: string | null; label: string };

// Phone photos are 4-8 MB; Vercel rejects uploads over 4.5 MB. Draw a smaller copy on a canvas first.
function shrink(src: HTMLCanvasElement | ImageBitmap, max: number) {
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(src.width * scale);
  canvas.height = Math.round(src.height * scale);
  canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}
// ~1600px JPEG for the AI to read.
const forReading = (src: HTMLCanvasElement | ImageBitmap): Promise<Blob> =>
  new Promise((ok, fail) => shrink(src, 1600).toBlob((b) => (b ? ok(b) : fail(new Error("shrink failed"))), "image/jpeg", 0.85));
// ~1100px JPEG, a few hundred KB at most, kept with the lot so it can be checked against the paper later.
const forKeeping = (src: HTMLCanvasElement | ImageBitmap) => shrink(src, 1100).toDataURL("image/jpeg", 0.7);

// Read one image with the AI. Returns one or more cards; a failure becomes one empty card with the reason.
async function readImage(src: HTMLCanvasElement | ImageBitmap, label: string): Promise<{ cards: Pending[]; note: string }> {
  let kept: string | null = null;
  try {
    kept = forKeeping(src); // keeping the image is a bonus; never block the lot on it
  } catch {}
  try {
    const body = new FormData();
    body.append("photo", await forReading(src), "challan.jpg");
    const res = await fetch("/api/extract", { method: "POST", body });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const many = data.cards.length > 1;
    const cards = (data.cards as { form: LotForm; unclear: string[] }[]).map((c, i) => ({ ...c, kept, label: many ? `${label}, challan ${i + 1}` : label }));
    return { cards, note: data.error ?? (data.isChallan ? "" : `${label} doesn't look like a challan. Check it, or type the details.`) };
  } catch (e) {
    return { cards: [{ form: { ...EMPTY }, unclear: [], kept, label }], note: e instanceof Error && e.message ? e.message : `Couldn't read ${label}. Please type the details.` };
  }
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
  const [facility, setFacility] = useState("");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [reminding, setReminding] = useState("");
  const [openChat, setOpenChat] = useState("");
  const [openPhoto, setOpenPhoto] = useState("");
  const [queue, setQueue] = useState<Pending[]>([]); // challans from the same file still to check
  const [place, setPlace] = useState<{ n: number; total: number; label: string } | null>(null);
  const [rowNote, setRowNote] = useState<{ token: string; text: string } | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const capture = useRef<HTMLElement>(null);

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

  // When a card opens (photo read, typed lot, or edit), bring it into view.
  const cardOpen = !!card;
  useEffect(() => {
    if (cardOpen) capture.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [cardOpen]);

  function resetCard(next: LotForm | null = null) {
    setCard(next);
    setEditing(null);
    setUnclear([]);
    setPhoto(null);
    setKept(null);
    setSeconds(null);
    setNotice("");
    setQueue([]);
    setPlace(null);
  }

  // Put one waiting challan on the card. `carry` is the card just saved from the same file: its promised date and
  // phone fill in when this challan has none, tagged "unclear" so staff look before saving.
  function showPending(p: Pending, n: number, total: number, carry?: LotForm) {
    const form = { ...p.form };
    const unclear = [...p.unclear];
    for (const k of ["promised_date", "phone"] as const) {
      if (carry && !form[k] && carry[k]) {
        form[k] = carry[k];
        unclear.push(k);
      }
    }
    setCard(form);
    setUnclear(unclear);
    setKept(p.kept);
    setPhoto(p.kept);
    setPlace(total > 1 ? { n, total, label: p.label } : null);
    if (!form.phone) prefillPhone(form.job_worker);
  }

  // A photo, or a PDF with one challan per page (each page becomes its own lot).
  async function onPhoto(file: File | undefined) {
    if (!file) return;
    resetCard();
    setReading(true);
    const started = performance.now();
    try {
      let images: (HTMLCanvasElement | ImageBitmap)[];
      let skipped = 0;
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const { pdfPages } = await import("./pdf");
        const { pages, total } = await pdfPages(file);
        images = pages;
        skipped = total - pages.length;
      } else {
        images = [await createImageBitmap(file)];
      }
      // Read up to 6 pages at a time, keeping page order.
      const results: { cards: Pending[]; note: string }[] = [];
      for (let i = 0; i < images.length; i += 6) {
        const batch = images.slice(i, i + 6).map((img, j) => readImage(img, images.length > 1 ? `Page ${i + j + 1}` : "This photo"));
        results.push(...(await Promise.all(batch)));
      }
      const all = results.flatMap((r) => r.cards);
      const notes = results.map((r) => r.note).filter(Boolean);
      if (skipped) notes.push(`Only the first ${images.length} pages were read; ${skipped} more were skipped.`);
      showPending(all[0], 1, all.length);
      setQueue(all.slice(1));
      setNotice(notes.join(" "));
    } catch (e) {
      console.error(e);
      setCard({ ...EMPTY });
      setNotice("Couldn't open this file. Please type the details below.");
    } finally {
      setSeconds((performance.now() - started) / 1000);
      setReading(false);
    }
  }

  // Move on to the next challan from the same file (after saving, or when skipping one).
  function nextPending(carry?: LotForm, saved = false) {
    const [next, ...rest] = queue;
    if (!next || !place) {
      resetCard();
      return false;
    }
    const n = place.n + 1;
    showPending(next, n, place.total, carry);
    setQueue(rest);
    setNotice(saved ? `Saved challan ${place.n} of ${place.total}. Check challan ${n} below.` : `Skipped challan ${place.n}.`);
    return true;
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
      loadLots();
      if (!editing && nextPending(card, true)) return;
      const many = place ? `Last challan from this file saved.` : "Lot saved.";
      resetCard();
      setNotice(editing ? "Changes saved." : `${many} Open each lot below to send the status link to the job worker.`);
    } catch (e) {
      setNotice(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // Save this challan and every one still waiting from the same file in one go. Challans with no promised date or
  // phone take this card's; any that still miss a required field (or fail to save) stay on the card to check.
  async function saveAll() {
    if (!card || missingFields(card).length || !place) return;
    setSaving(true);
    const items: Pending[] = [{ form: card, unclear: [], kept, label: place.label }, ...queue].map((p) => ({
      ...p,
      form: { ...p.form, promised_date: p.form.promised_date || card.promised_date, phone: p.form.phone || card.phone },
    }));
    const ok = await Promise.all(
      items.map(async (p) => {
        if (missingFields(p.form).length) return false;
        try {
          const res = await fetch("/api/lots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...p.form, photo: p.kept ?? undefined }) });
          return res.ok;
        } catch {
          return false;
        }
      }),
    );
    setSaving(false);
    loadLots();
    const left = items.filter((_, i) => !ok[i]);
    const saved = items.length - left.length;
    if (!left.length) {
      resetCard();
      setNotice(`All ${saved} lots saved. Open each lot below to send the status link to the job worker.`);
      return;
    }
    showPending(left[0], 1, left.length);
    setQueue(left.slice(1));
    setNotice(`Saved ${saved} of ${items.length}. ${left.length} need${left.length === 1 ? "s" : ""} checking: fill the red fields below.`);
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
    } catch (e) {
      setRowNote({ token: l.token, text: e instanceof Error && e.message ? e.message : "Couldn't open this lot." });
    }
  }

  async function removeLot(l: BoardLot) {
    if (!window.confirm(`Delete the lot for ${l.facility || l.job_worker} (${qtyText(l)})? Its status link stops working. This can't be undone.`)) return;
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
  const live = filterLots(lots, "all", "", now); // everything on the main board, for the chart and the facility list
  const stages = stageTotals(live);
  const outMetres = stages.reduce((m, s) => m + s.metres, 0);
  const overdueCount = live.filter((l) => l.overdue).length;
  const facilities = facilitiesOf(live);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, filterLots(lots, f.key, "", now, facility).length])) as Record<Filter, number>;
  const shown = filterLots(lots, filter, query, now, facility).sort((a, b) => Number(b.overdue) - Number(a.overdue));
  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "All";
  const activeFilters = Number(filter !== "all") + Number(!!facility);
  const clearAll = () => { setFilter("all"); setFacility(""); setQuery(""); };
  const showCapture = !!(card || reading || notice);

  return (
    <main className="wide">
      <header className="top">
        <div>
          <h1>KaamTrack</h1>
          <p className="muted">Every lot, where it is today.</p>
        </div>
        <form method="post" action="/api/auth/logout" className="row">
          <a className="button small" href="/settings">Settings</a>
          <button className="button small">Sign out</button>
        </form>
      </header>

      {showCapture && (
        <section className="panel" ref={capture}>
          {reading && <p className="reading" role="status">Reading the challan… (a PDF takes a little longer, every page is read)</p>}
          {notice && <p className="notice" role="status">{notice}</p>}

          {card && (
            <div className="capture">
              {photo && <img src={photo} alt="Challan photo" className="photo" />}
              <form className="card" onSubmit={(e) => { e.preventDefault(); save(); }}>
                {editing && <p className="notice">Editing a saved lot. Its link, status and history stay the same.</p>}
                {place && (
                  <p className="place">
                    <strong>Challan {place.n} of {place.total}</strong> <span className="muted">· {place.label}</span>
                  </p>
                )}
                {seconds !== null && <p className="muted small">Read in {seconds.toFixed(1)} s. Check every field before saving.</p>}
                {FIELDS.map((k) => (
                  <label key={k} className={`field ${missing.includes(k) ? "missing" : ""}`}>
                    <span>
                      {LABELS[k]} {OPTIONAL.includes(k) && <span className="muted small">(optional)</span>}
                      {unclear.includes(k) && <em className="tag">unclear</em>}
                      {missing.includes(k) && <em className="req">required</em>}
                    </span>
                    {k === "process" ? (
                      <select value={card.process} onChange={(e) => edit("process", e.target.value)}>
                        <option value="">Choose…</option>
                        {PROCESSES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    ) : k === "quantity" ? (
                      <>
                        <div className="row">
                          <input type="number" inputMode="decimal" min="0" step="any" value={card.quantity} onChange={(e) => edit("quantity", e.target.value)} />
                          <select value={card.unit} onChange={(e) => edit("unit", e.target.value)} aria-label="Unit">
                            {UNITS.filter((u) => u !== "thaan" || card.unit === "thaan").map((u) => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                        {card.unit === "lots" && Number(card.quantity) > 0 && <span className="muted small">1 lot = 1200 m, so this is {toMetres(Number(card.quantity), "lots")} metres</span>}
                      </>
                    ) : k === "taka" ? (
                      <input type="number" inputMode="numeric" min="0" step="1" value={card.taka} onChange={(e) => edit("taka", e.target.value)} />
                    ) : k === "phone" ? (
                      <div className="row">
                        <span className="prefix">+91</span>
                        <input type="tel" inputMode="numeric" autoComplete="off" placeholder="98765 43210" value={card.phone} onChange={(e) => edit("phone", e.target.value)} />
                      </div>
                    ) : (
                      <input
                        type={k === "promised_date" ? "date" : "text"}
                        list={k === "facility" ? "facilities" : undefined}
                        placeholder={k === "quality" ? "e.g. 60 gram georgette" : undefined}
                        value={card[k]}
                        onChange={(e) => edit(k, e.target.value)}
                        onBlur={k === "job_worker" ? () => prefillPhone(card.job_worker) : undefined}
                      />
                    )}
                  </label>
                ))}
                <datalist id="facilities">{facilities.map((f) => <option key={f.name} value={f.name} />)}</datalist>
                <div className="row">
                  <button className="button primary" disabled={saving || missing.length > 0}>
                    {saving ? "Saving…" : missing.length ? `Fill ${missing.length} red field${missing.length > 1 ? "s" : ""} to save` : editing ? "Save changes" : "Save lot"}
                  </button>
                  {place && queue.length > 0 && (
                    <button type="button" className="button" onClick={saveAll} disabled={saving || missing.length > 0}>
                      Save all {queue.length + 1} lots
                    </button>
                  )}
                  {place && place.n < place.total && <button type="button" className="button" onClick={() => nextPending()}>Skip this one</button>}
                  <button type="button" className="button" onClick={() => resetCard()}>{place ? "Stop" : "Cancel"}</button>
                </div>
                {place && queue.length > 0 && (
                  <p className="muted small">Save all uses this card&apos;s promised date and phone for any challan that has none. Challans with other gaps stay here to check.</p>
                )}
              </form>
            </div>
          )}
        </section>
      )}

      {boardError && <p className="notice" role="alert">{boardError}</p>}

      {lots.length > 0 && (
        <section className="panel tracker" aria-label="Where all lots are">
          <div className="tracker-head">
            <strong>{live.length} lot{live.length === 1 ? "" : "s"} out</strong>
            <span className="muted small">{outMetres.toLocaleString("en-IN")} m{overdueCount > 0 && <strong className="late"> · {overdueCount} overdue</strong>}</span>
          </div>
          <div className="bar" role="img" aria-label={stages.map((s) => `${s.status} ${s.lots}`).join(", ")}>
            {stages.filter((s) => s.lots > 0).map((s) => <span key={s.status} className={`seg s-${slug(s.status)}`} style={{ flexGrow: s.lots }} />)}
          </div>
          <div className="stages">
            {stages.map((s) => (
              <button key={s.status} className={`stage ${filter === s.status ? "on" : ""}`} aria-pressed={filter === s.status} onClick={() => setFilter(filter === s.status ? "all" : (s.status as Filter))}>
                <span className={`status s-${slug(s.status)}`}><StatusIcon status={s.status} size={16} /> {s.status}</span>
                <strong>{s.lots}</strong>
                <span className="muted small">{s.metres.toLocaleString("en-IN")} m</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        {lots.length > 0 && (
          <div className="toolbar">
            <input className="search" type="search" placeholder="Search lots, challan no." aria-label="Search lots" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="button filter-btn" onClick={() => sheet.current?.showModal()}>
              <FilterIcon /> Filter{activeFilters > 0 && <span className="badge">{activeFilters}</span>}
            </button>
          </div>
        )}
        {activeFilters > 0 && (
          <div className="active-filters">
            {filter !== "all" && <button className="chip" onClick={() => setFilter("all")} aria-label={`Remove filter ${filterLabel}`}>{filterLabel} ✕</button>}
            {facility && <button className="chip" onClick={() => setFacility("")} aria-label={`Remove filter ${facility}`}>{facility} ✕</button>}
          </div>
        )}

        {!lots.length && !boardError && <p className="muted empty">No lots yet. Tap “Snap” to photograph a challan, or “PDF” for a challan file.</p>}
        {lots.length > 0 && !shown.length && (
          <p className="muted">
            No lots match. <button className="link" onClick={clearAll}>Show all lots</button>
          </p>
        )}

        <ul className="board">
          {shown.map((l) => (
            <li key={l.token}>
              <details className={`lot ${l.overdue ? "overdue" : ""}`}>
                <summary>
                  <span className="lot-top">
                    <strong>{l.facility || l.job_worker}</strong>
                    <span className="chev" aria-hidden="true" />
                  </span>
                  <span className="lot-line">
                    <span className={`status s-${slug(l.status)}`}><StatusIcon status={l.status} size={16} /> {l.status}</span>
                    <span>{qtyText(l)}{l.taka > 0 && ` · ${l.taka} taka`}</span>
                    <span className="muted">{l.overdue ? <strong className="late">OVERDUE · {showDate(l.promised_date)}</strong> : `due ${showDate(l.promised_date)}`}</span>
                    {l.notes.length > 0 && <span className={`pill ${l.notes[l.notes.length - 1].problem ? "problem" : ""}`}>{l.notes[l.notes.length - 1].problem ? "Problem noted" : `${l.notes.length} note${l.notes.length > 1 ? "s" : ""}`}</span>}
                  </span>
                </summary>

                <div className="lot-body">
                  <dl className="facts">
                    {l.facility && <><dt>Job worker</dt><dd>{l.job_worker}</dd></>}
                    <dt>Process</dt><dd>{l.process}</dd>
                    {l.quality && <><dt>Fabric</dt><dd>{l.quality}</dd></>}
                    {l.challan_no && <><dt>Challan</dt><dd>{l.challan_no}</dd></>}
                    <dt>Out for</dt><dd>{l.days_out} day{l.days_out === 1 ? "" : "s"}</dd>
                  </dl>
                  <Notes notes={l.notes} />
                  <div className="actions">
                    <a className="button small" href={whatsappLink(l, origin)} target="_blank" rel="noreferrer">Send on WhatsApp</a>
                    <button className="button small" onClick={() => copyLink(l.token)} aria-live="polite">{copied === l.token ? "Copied ✓" : "Copy link"}</button>
                    {l.has_phone && l.status !== "Dispatched" && <button className="button small" onClick={() => nudge(l.token)}>Nudge on WhatsApp</button>}
                    {l.has_phone && l.can_auto_remind && l.status !== "Dispatched" && (
                      <button className="button small" onClick={() => remind(l.token)} disabled={reminding === l.token}>{reminding === l.token ? "Sending…" : "Send reminder now"}</button>
                    )}
                    {l.has_phone && l.wa_on && (
                      <button className="button small" onClick={() => setOpenChat((c) => (c === l.token ? "" : l.token))} aria-expanded={openChat === l.token}>{openChat === l.token ? "Hide WhatsApp" : "WhatsApp"}</button>
                    )}
                    {l.has_photo && (
                      <button className="button small" onClick={() => setOpenPhoto((c) => (c === l.token ? "" : l.token))} aria-expanded={openPhoto === l.token}>{openPhoto === l.token ? "Hide challan" : "Challan photo"}</button>
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
                      <img src={`/api/lots/${l.token}/photo`} alt={`Challan photo for ${l.facility || l.job_worker}`} className="photo" loading="lazy" />
                    </a>
                  )}
                  {openChat === l.token && <WhatsAppTimeline token={l.token} onChanged={loadLots} />}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <nav className="dock" aria-label="Add a lot">
        <label className="button primary">
          <CameraIcon /> Snap
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} disabled={reading} />
        </label>
        <label className="button">
          <DocIcon /> PDF
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} disabled={reading} />
        </label>
        <button className="button" onClick={() => resetCard({ ...EMPTY })} aria-label="Type a lot"><PlusIcon /> Type</button>
      </nav>

      <dialog className="sheet" ref={sheet} onClick={(e) => e.target === sheet.current && sheet.current.close()} aria-labelledby="filter-title">
        <div className="sheet-head">
          <h2 id="filter-title">Filter lots</h2>
          <button className="button small" onClick={() => sheet.current?.close()}>Close</button>
        </div>
        <h3>Status</h3>
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip ${f.key === "overdue" && counts.overdue ? "alert" : ""}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <span className="count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <h3>Company / facility</h3>
        {facilities.length === 0 ? (
          <p className="muted small">Facilities appear here once a lot has one.</p>
        ) : (
          <div className="chips">
            <button className="chip" aria-pressed={!facility} onClick={() => setFacility("")}>All</button>
            {facilities.map((f) => (
              <button key={f.name} className="chip" aria-pressed={facility === f.name} onClick={() => setFacility(f.name)}>
                {f.name} <span className="count">{f.count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="row sheet-foot">
          <button className="button primary" onClick={() => sheet.current?.close()}>Show {shown.length} lot{shown.length === 1 ? "" : "s"}</button>
          {activeFilters > 0 && <button className="button" onClick={() => { setFilter("all"); setFacility(""); }}>Clear</button>}
        </div>
      </dialog>
    </main>
  );
}
