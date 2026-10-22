"use client";

import { useState } from "react";

export default function Login() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Go back to where they were headed, but only to a path on this site.
      const next = new URLSearchParams(window.location.search).get("next") ?? "/";
      window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't sign in. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="worker">
      <h1>KaamTrack</h1>
      <form className="card panel" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="field">
          <span>Owner passcode</span>
          <input type="password" autoComplete="current-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoFocus />
        </label>
        {error && <p className="notice" role="alert">{error}</p>}
        <button className="button primary" disabled={busy || !passcode}>{busy ? "Checking…" : "Open the board"}</button>
      </form>
      <p className="muted small">Job workers don't need this. Their link opens on its own.</p>
    </main>
  );
}
