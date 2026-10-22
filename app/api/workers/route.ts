import { workerPhone } from "@/lib/store";
import { localPhone } from "@/lib/lots";

// Returns the remembered number for exactly one job worker name; there is no way to list everyone.
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (!name) return Response.json({ phone: "" });
  try {
    return Response.json({ phone: localPhone(await workerPhone(name)) });
  } catch (e) {
    console.error("worker lookup failed", e);
    return Response.json({ phone: "" });
  }
}
