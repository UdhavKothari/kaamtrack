// Calls our n8n Cloud webhooks. The secret header stops strangers from writing to the sheet.
export async function n8n(path: string, body?: unknown): Promise<unknown> {
  const base = process.env.N8N_BASE_URL;
  if (!base) throw new Error("N8N_BASE_URL is not set");

  const res = await fetch(`${base.replace(/\/$/, "")}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-kaamtrack-secret": process.env.N8N_SECRET ?? "" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`n8n ${path} ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
