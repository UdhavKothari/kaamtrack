import { readVoiceNote } from "@/lib/ai";
import { addNote, getLot, overLimit } from "@/lib/store";
import { cleanNote, qtyText, todayIST } from "@/lib/lots";

export const maxDuration = 30;

// Open to job workers like the status tap (the secret link is the key), so it is rate limited: it can spend AI money.
const MAX_AUDIO = 2_500_000; // about 75 s of 16 kHz mono WAV

export async function POST(req: Request, ctx: RouteContext<"/api/lots/[token]/note">) {
  const { token } = await ctx.params;
  if (await overLimit(req, "note", 20, 3600)) return Response.json({ error: "Too many notes this hour. Try again later." }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  const typed = String(form?.get("text") ?? "").trim();
  const voice = audio instanceof File && audio.size > 0;
  if (!voice && !typed) return Response.json({ error: "Write a note or record one." }, { status: 400 });
  if (voice && audio.size > MAX_AUDIO) return Response.json({ error: "That recording is too long. Keep it under a minute." }, { status: 400 });

  try {
    const lot = await getLot(token);
    if (!lot) return Response.json({ error: "Lot not found" }, { status: 404 });

    let raw: unknown = {};
    if (voice) {
      const wav = Buffer.from(await audio.arrayBuffer()).toString("base64");
      raw = await readVoiceNote(wav, todayIST(), `${lot.process}, ${qtyText(lot)}`);
    }
    const note = cleanNote(raw, lot.status, new Date().toISOString(), voice ? "" : typed);
    if (!note.text) return Response.json({ error: "Couldn't hear anything in that recording. Try again, or type the note." }, { status: 422 });

    const saved = await addNote(token, note);
    return saved ? Response.json({ notes: saved.notes }) : Response.json({ error: "Lot not found" }, { status: 404 });
  } catch (e) {
    console.error("note failed", e);
    return Response.json({ error: "Couldn't save the note. Try again, or type it." }, { status: 502 });
  }
}
