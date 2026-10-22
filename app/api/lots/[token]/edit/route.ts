import { getLot, rememberWorker, updateLot } from "@/lib/store";
import { formFromLot, missingFields, publicLot, type LotForm } from "@/lib/lots";

// Owner only (closed by the passcode proxy; only /api/lots/<token> itself is open to job workers).

// The lot card's current values, including the phone number, so the card can be filled for editing.
export async function GET(_req: Request, ctx: RouteContext<"/api/lots/[token]/edit">) {
  const { token } = await ctx.params;
  try {
    const lot = await getLot(token);
    return lot ? Response.json({ form: formFromLot(lot) }) : Response.json({ error: "Lot not found" }, { status: 404 });
  } catch (e) {
    console.error("load lot for edit failed", e);
    return Response.json({ error: "Couldn't load the lot." }, { status: 502 });
  }
}

export async function POST(req: Request, ctx: RouteContext<"/api/lots/[token]/edit">) {
  const { token } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Partial<LotForm>;
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
    const lot = await updateLot(token, form);
    if (!lot) return Response.json({ error: "Lot not found" }, { status: 404 });
    await rememberWorker(lot.job_worker, lot.phone);
    return Response.json(publicLot(lot));
  } catch (e) {
    console.error("edit lot failed", e);
    return Response.json({ error: "Couldn't save the changes. Try again." }, { status: 502 });
  }
}
