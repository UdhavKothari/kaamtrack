import { listLots, rememberWorker, saveLot, savePhoto } from "@/lib/store";
import { whatsappMode, whatsappReady } from "@/lib/whatsapp";
import { daysOut, isOverdue, isStorablePhoto, missingFields, newLot, publicLot, todayIST, type LotForm } from "@/lib/lots";

export async function GET() {
  try {
    const today = todayIST();
    const lots = (await listLots())
      .map((l) => ({ ...publicLot(l), overdue: isOverdue(l, today), days_out: daysOut(l, today), can_auto_remind: whatsappReady(), wa_on: whatsappMode() !== "off" }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Response.json(lots);
  } catch (e) {
    console.error("list lots failed", e);
    return Response.json({ error: "Couldn't load lots." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<LotForm> & { photo?: unknown };
  const form: LotForm = {
    job_worker: String(body.job_worker ?? ""),
    phone: String(body.phone ?? ""),
    process: String(body.process ?? ""),
    quantity: String(body.quantity ?? ""),
    unit: String(body.unit ?? ""),
    promised_date: String(body.promised_date ?? ""),
  };
  const missing = missingFields(form);
  if (missing.length) return Response.json({ error: "Missing fields", missing }, { status: 400 });

  try {
    const lot = newLot(form);
    if (isStorablePhoto(body.photo)) {
      try {
        await savePhoto(lot.token, body.photo);
        lot.has_photo = true;
      } catch (e) {
        console.error("keeping the photo failed; saving the lot without it", e);
      }
    }
    await saveLot(lot);
    await rememberWorker(lot.job_worker, lot.phone);
    return Response.json(publicLot(lot));
  } catch (e) {
    console.error("save lot failed", e);
    return Response.json({ error: "Couldn't save the lot. Try again." }, { status: 502 });
  }
}
