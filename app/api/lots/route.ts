import { listLots, saveLot } from "@/lib/store";
import { daysOut, isOverdue, missingFields, newLot, todayIST, type LotForm } from "@/lib/lots";

export async function GET() {
  try {
    const today = todayIST();
    const lots = (await listLots())
      .map((l) => ({ ...l, overdue: isOverdue(l, today), days_out: daysOut(l, today) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Response.json(lots);
  } catch (e) {
    console.error("list lots failed", e);
    return Response.json({ error: "Couldn't load lots." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<LotForm>;
  const form: LotForm = {
    job_worker: String(body.job_worker ?? ""),
    process: String(body.process ?? ""),
    quantity: String(body.quantity ?? ""),
    unit: String(body.unit ?? ""),
    promised_date: String(body.promised_date ?? ""),
  };
  const missing = missingFields(form);
  if (missing.length) return Response.json({ error: "Missing fields", missing }, { status: 400 });

  try {
    const lot = newLot(form);
    await saveLot(lot);
    return Response.json(lot);
  } catch (e) {
    console.error("save lot failed", e);
    return Response.json({ error: "Couldn't save the lot. Try again." }, { status: 502 });
  }
}
