import { readChallan } from "@/lib/ai";
import { overLimit } from "@/lib/store";
import { cleanExtractions, todayIST } from "@/lib/lots";

export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  if (await overLimit(req, "extract", 60, 3600)) {
    return Response.json({ error: "Too many photos this hour. Try again later." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || !photo.type.startsWith("image/")) {
    return Response.json({ error: "Please upload a photo (JPG or PNG)." }, { status: 400 });
  }
  if (photo.size === 0 || photo.size > MAX_BYTES) {
    return Response.json({ error: "Photo is empty or too large. Try again." }, { status: 400 });
  }

  try {
    const base64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
    const raw = await readChallan(base64, photo.type, todayIST());
    return Response.json(cleanExtractions(raw)); // { isChallan, cards: [{ form, unclear }] }
  } catch (e) {
    console.error("extract failed", e);
    // Bad or unreadable file: hand back an empty card so staff can type the lot in.
    return Response.json({ ...cleanExtractions({}), error: "Couldn't read this photo. Please type the details." });
  }
}
