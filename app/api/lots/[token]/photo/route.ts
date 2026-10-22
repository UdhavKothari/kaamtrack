import { getPhoto } from "@/lib/store";

// Owner only (closed by the passcode proxy). The kept challan photo, so a lot can be checked against the paper.
export async function GET(_req: Request, ctx: RouteContext<"/api/lots/[token]/photo">) {
  const { token } = await ctx.params;
  try {
    const photo = await getPhoto(token);
    if (!photo) return new Response("No photo", { status: 404 });
    return new Response(new Uint8Array(photo), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.error("photo failed", e);
    return new Response("Couldn't load the photo", { status: 502 });
  }
}
