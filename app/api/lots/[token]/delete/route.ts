import { deleteLot } from "@/lib/store";

// Owner only. Permanent: the lot and its worker link are gone. The board asks "are you sure?" first.
export async function POST(_req: Request, ctx: RouteContext<"/api/lots/[token]/delete">) {
  const { token } = await ctx.params;
  try {
    return (await deleteLot(token)) ? Response.json({ ok: true }) : Response.json({ error: "Lot not found" }, { status: 404 });
  } catch (e) {
    console.error("delete lot failed", e);
    return Response.json({ error: "Couldn't delete the lot." }, { status: 502 });
  }
}
