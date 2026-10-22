import { getLot, setStatus } from "@/lib/store";
import { STATUSES } from "@/lib/lots";

export async function GET(_req: Request, ctx: RouteContext<"/api/lots/[token]">) {
  const { token } = await ctx.params;
  try {
    const lot = await getLot(token);
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
    const lot = await setStatus(token, status, new Date().toISOString());
    return lot
      ? Response.json({ token, status: lot.status, status_updated_at: lot.status_updated_at })
      : Response.json({ error: "Lot not found" }, { status: 404 });
  } catch (e) {
    console.error("status update failed", e);
    return Response.json({ error: "Couldn't update. Try again.", }, { status: 502 });
  }
}
