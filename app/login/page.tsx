"use client";

import { useEffect, useState } from "react";

const ERRORS: Record<string, string> = {
  "not-allowed": "This Google account isn't on the owner list. Ask the owner to add your email.",
  unverified: "Google hasn't verified this account's email yet.",
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long or was opened in another tab. Please try again.",
  google: "Couldn't reach Google. Please try again.",
  "bad-token": "Google's reply couldn't be checked. Please try again.",
  "not-setup": "Google sign-in isn't set up on this site yet.",
};

export default function Login() {
  // Read the address after the page loads (Next doesn't allow reading it while it prepares the page).
  const [error, setError] = useState("");
  const [href, setHref] = useState("/api/auth/google");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get("error");
    if (code) setError(ERRORS[code] ?? "Couldn't sign in. Please try again.");
    const next = q.get("next");
    if (next) setHref(`/api/auth/google?next=${encodeURIComponent(next)}`);
  }, []);

  return (
    <main className="worker">
      <h1>KaamTrack</h1>
      <div className="card panel">
        <p>Sign in with the Google account the owner added.</p>
        {error && <p className="notice" role="alert">{error}</p>}
        <a className="button primary" href={href}>
          <GoogleIcon /> Sign in with Google
        </a>
      </div>
      <p className="muted small">Job workers don&apos;t need this. Their link opens on its own.</p>
    </main>
  );
}

// Google's "G", drawn in one colour so it sits on the green button.
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zm-5.6-8a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9zM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" />
  </svg>
);
