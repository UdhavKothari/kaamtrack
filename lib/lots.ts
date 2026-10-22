// Plain rules for lots. No AI here: everything is checkable and never guesses.

export const PROCESSES = ["dyeing", "printing", "embroidery", "other"];
export const UNITS = ["metres", "thaan"];
export const STATUSES = ["Received", "In process", "Ready", "Dispatched"];
export const FIRST_STATUS = "Sent";

// What the lot card edits. Strings because they come from form inputs; "" means blank.
export type LotForm = {
  job_worker: string;
  process: string;
  quantity: string;
  unit: string;
  promised_date: string;
};

// One row in the Google Sheet.
export type Lot = {
  token: string;
  created_at: string;
  job_worker: string;
  process: string;
  quantity: number;
  unit: string;
  promised_date: string;
  status: string;
  status_updated_at: string;
};

export const REQUIRED: (keyof LotForm)[] = ["job_worker", "process", "quantity", "promised_date"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function isValidDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Turn whatever the AI sent back into safe form values. Anything wrong becomes blank and unclear.
export function cleanExtraction(raw: unknown) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const unclear = new Set(Array.isArray(r.unclear_fields) ? r.unclear_fields.filter((f) => typeof f === "string") : []);

  const process = str(r.process).toLowerCase();
  const unit = str(r.unit).toLowerCase();
  const qty = typeof r.quantity === "number" ? r.quantity : Number(str(r.quantity));
  const date = str(r.promised_date);

  const form: LotForm = {
    job_worker: str(r.job_worker),
    process: PROCESSES.includes(process) ? process : "",
    quantity: Number.isFinite(qty) && qty > 0 ? String(qty) : "",
    unit: UNITS.includes(unit) ? unit : "metres",
    promised_date: isValidDate(date) ? date : "",
  };
  for (const k of REQUIRED) if (!form[k]) unclear.add(k);

  return { isChallan: r.is_challan === true, form, unclear: [...unclear] as string[] };
}

// Required fields that are blank or invalid. Save is allowed only when this is empty.
export function missingFields(f: LotForm): (keyof LotForm)[] {
  const qty = Number(f.quantity);
  return REQUIRED.filter((k) => {
    if (k === "quantity") return !(Number.isFinite(qty) && qty > 0);
    if (k === "promised_date") return !isValidDate(f.promised_date);
    if (k === "process") return !PROCESSES.includes(f.process);
    return !f[k].trim();
  });
}

export function makeToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export const isToken = (s: string) => /^[0-9a-f]{16}$/.test(s);

export function newLot(f: LotForm, now = new Date()): Lot {
  const at = now.toISOString();
  return {
    token: makeToken(),
    created_at: at,
    job_worker: f.job_worker.trim(),
    process: f.process,
    quantity: Number(f.quantity),
    unit: UNITS.includes(f.unit) ? f.unit : "metres",
    promised_date: f.promised_date,
    status: FIRST_STATUS,
    status_updated_at: at,
  };
}

// 2026-10-28 -> 28/10/2026, the way dates are written in Surat.
export const showDate = (ymd: string) => (isValidDate(ymd) ? ymd.split("-").reverse().join("/") : ymd);

// Surat time, as YYYY-MM-DD.
export const todayIST = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const dayNumber = (ymd: string) => Date.parse(ymd + "T00:00:00Z") / 86_400_000;

export function isOverdue(lot: Pick<Lot, "promised_date" | "status">, today: string) {
  return lot.status !== "Dispatched" && isValidDate(lot.promised_date) && lot.promised_date < today;
}

export function daysOut(lot: Pick<Lot, "created_at">, today: string) {
  const sent = todayIST(new Date(lot.created_at));
  return Math.max(0, Math.round(dayNumber(today) - dayNumber(sent)));
}

// Rows from the sheet can come back as strings; make them proper lots and drop junk rows.
export function rowsToLots(rows: unknown): Lot[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && typeof r === "object" && isToken(String((r as Lot).token)))
    .map((r) => {
      const l = r as Record<string, unknown>;
      return {
        token: String(l.token),
        created_at: String(l.created_at ?? ""),
        job_worker: String(l.job_worker ?? ""),
        process: String(l.process ?? ""),
        quantity: Number(l.quantity) || 0,
        unit: String(l.unit ?? ""),
        promised_date: String(l.promised_date ?? ""),
        status: String(l.status ?? FIRST_STATUS),
        status_updated_at: String(l.status_updated_at ?? ""),
      };
    });
}

export function whatsappLink(lot: Lot, origin: string) {
  const text =
    `KaamTrack lot: ${lot.quantity} ${lot.unit}, ${lot.process}, promised ${lot.promised_date}.\n` +
    `Please tap your status here (no login needed): ${origin}/s/${lot.token}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
