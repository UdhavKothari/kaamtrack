"use client";

import { useEffect, useState } from "react";

type Data = { me: string; admin: boolean; admins: string[]; staff: string[] };

// Who can sign in with Google. Admins come from Vercel (OWNER_EMAILS); everyone else is managed here.
export default function Settings() {
  const [data, setData] = useState<Data | null>(null);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setNote(e.message || "Couldn't load the list."));
  }, []);

  async function change(method: "POST" | "DELETE", target: string) {
    setBusy(target);
    setNote("");
    try {
      const r = await fetch("/api/settings", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: target }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData((old) => (old ? { ...old, staff: d.staff } : old));
      if (method === "POST") setEmail("");
      setNote(method === "POST" ? `${target.trim().toLowerCase()} can now sign in.` : `${target} can no longer sign in (within a minute).`);
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="worker">
      <p><a className="link" href="/">← Back to the board</a></p>
      <h1>Settings</h1>
      <h2>Who can sign in</h2>
      <p className="muted">These Google accounts can sign in and see the board. Job workers never need an account.</p>
      {note && <p className="notice" role="status">{note}</p>}
      {data && (
        <>
          {data.admin ? (
            <form className="remark" onSubmit={(e) => { e.preventDefault(); if (email.trim()) change("POST", email); }}>
              <label htmlFor="new-email">Add a Google account</label>
              <div className="row">
                <input id="new-email" className="search" type="email" inputMode="email" autoComplete="off" placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="button primary" disabled={!email.trim() || !!busy}>Add</button>
              </div>
            </form>
          ) : (
            <p className="muted small">Only an admin can change this list.</p>
          )}
          <ul className="people">
            {data.admins.map((a) => (
              <li key={a}>
                <span>{a}{a === data.me && <span className="muted"> (you)</span>}</span>
                <span className="pill">Admin</span>
              </li>
            ))}
            {data.staff.map((s) => (
              <li key={s}>
                <span>{s}{s === data.me && <span className="muted"> (you)</span>}</span>
                {data.admin && (
                  <button className="button small danger" onClick={() => change("DELETE", s)} disabled={!!busy}>
                    {busy === s ? "Removing…" : "Remove"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!data.staff.length && <p className="muted small">Nobody added yet. Admins are set in Vercel and can always sign in.</p>}
        </>
      )}
    </main>
  );
}
