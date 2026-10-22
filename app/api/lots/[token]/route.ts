import { n8n } from "@/lib/n8n";
import { isToken, rowsToLots, STATUSES } from "@/lib/lots";

async function findLot(token: string) {
  if (!isToken(token)) return null;
  return rowsToLots(await n8n("lots")).find((l) => l.token === token) ?? null;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/lots/[token]">) {
  const { token } = await ctx.params;
  try {
    const lot = await findLot(token);
    return lot ? Response.json(lot) : Response.json({ error: "Lot not found" }, { status: 404 });
  } catch (e) {
    console.error("get lot failed", e);
    return Response.json({ error: "Couldn't load the lot." }, { status: 502 });
  }
}

export async function POST(req: Request, ctx: RouteContext<"/api/lots/[token]">) {
  const { token } = await ctx.params;
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };
  if (!status || !STATUSES.includes(status)) return Response.json({ error: "Unknown status" }, { status: 400 });

  try {
    if (!(await findLot(token))) return Response.json({ error: "Lot not found" }, { status: 404 });
    const update = { token, status, status_updated_at: new Date().toISOString() };
    await n8n("lot-status", update);
    return Response.json(update);
  } catch (e) {
    console.error("status update failed", e);
    return Response.json({ error: "Couldn't update. Try again." }, { status: 502 });
  }
}
