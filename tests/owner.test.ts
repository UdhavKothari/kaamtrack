import { test } from "node:test";
import assert from "node:assert/strict";
import { authConfig, canEnter, checkGoogleClaims, isEmail, isOpenPath, readSession, safeNext, sameString, signSession } from "../lib/owner.ts";

const cfg = { clientId: "cid.apps.googleusercontent.com", secret: "s3cret", emails: ["owner@example.com", "staff@example.com"] };

test("open without signing in: job worker pages, Meta/cron, and the sign-in steps only", () => {
  for (const open of [
    "/s/0123456789abcdef", "/api/lots/0123456789abcdef", "/api/lots/0123456789abcdef/note", "/api/whatsapp/webhook", "/api/cron/remind",
    "/login", "/api/auth/google", "/api/auth/google/callback", "/api/auth/logout",
  ]) {
    assert.equal(isOpenPath(open), true, open);
  }
});

test("everything of the owner's needs a sign-in, including look-alikes of the open paths", () => {
  for (const closed of [
    "/", "/whatsapp", "/api/lots", "/api/extract", "/api/workers", "/api/whatsapp/simulate", "/api/login",
    "/api/lots/0123456789abcdef/remind", "/api/lots/0123456789abcdef/nudge", "/api/lots/0123456789abcdef/messages",
    "/api/lots/0123456789abcdef/edit", "/api/lots/0123456789abcdef/delete", "/api/lots/0123456789abcdef/photo",
    "/api/lots/not-a-token", "/api/lots/not-a-token/note", "/api/lots/0123456789abcdef/note/x", "/api/lots/0123456789abcdef/", "/s/", "/s/a/b",
    "/api/cron", "/login/x", "/api/whatsapp/webhook/x", "/api/auth", "/api/auth/google/x", "/api/auth/other",
  ]) {
    assert.equal(isOpenPath(closed), false, closed);
  }
});

test("sign-in is on only with a client id, a secret and at least one email; emails are lowercased", () => {
  assert.equal(authConfig({}), null);
  assert.equal(authConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", OWNER_EMAILS: " , " }), null);
  assert.deepEqual(authConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", OWNER_EMAILS: " Owner@Example.com, x@y.in " })?.emails, ["owner@example.com", "x@y.in"]);
});

test("session cookie: round-trips, and is refused when forged or expired", async () => {
  const now = Date.parse("2026-10-23T00:00:00Z");
  const v = await signSession("Owner@Example.com", cfg.secret, now);
  assert.equal(await readSession(v, cfg, now + 1000), "owner@example.com");
  assert.equal(await readSession(v, { ...cfg, secret: "other" }, now), ""); // wrong key
  assert.equal(await readSession(v.replace("owner%40", "staff%40"), cfg, now), ""); // email swapped
  assert.equal(await readSession(v, cfg, now + 31 * 86_400_000), ""); // expired after 30 days
  assert.equal(await readSession(undefined, cfg, now), "");
  assert.equal(await readSession("garbage", cfg, now), "");
});

test("Google's answer: only a fresh, verified email for our app is accepted", () => {
  const now = Date.parse("2026-10-23T00:00:00Z");
  const ok = { iss: "https://accounts.google.com", aud: cfg.clientId, exp: now / 1000 + 300, email: "Staff@Example.com", email_verified: true };
  assert.deepEqual(checkGoogleClaims(ok, cfg, now), { email: "staff@example.com" });
  assert.deepEqual(checkGoogleClaims({ ...ok, email_verified: false }, cfg, now), { error: "unverified" });
  assert.deepEqual(checkGoogleClaims({ ...ok, aud: "someone-elses-app" }, cfg, now), { error: "bad-token" });
  assert.deepEqual(checkGoogleClaims({ ...ok, iss: "https://evil.example" }, cfg, now), { error: "bad-token" });
  assert.deepEqual(checkGoogleClaims({ ...ok, exp: now / 1000 - 1 }, cfg, now), { error: "bad-token" });
  assert.deepEqual(checkGoogleClaims(null, cfg, now), { error: "bad-token" });
});

test("after sign-in, only paths on this site are followed", () => {
  assert.equal(safeNext("/s/abc"), "/s/abc");
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext(null), "/");
});

test("string compare is exact, including length", () => {
  assert.equal(sameString("abc", "abc"), true);
  assert.equal(sameString("abc", "abd"), false);
  assert.equal(sameString("abc", "abcd"), false);
  assert.equal(sameString("", "x"), false);
});

test("who gets in: admins always, others only while on the Settings list", async () => {
  const list = new Set(["helper@gmail.com"]);
  const onList = async (e: string) => list.has(e);
  assert.equal(await canEnter("Owner@Example.com", cfg, onList), true); // admin, any case
  assert.equal(await canEnter("helper@gmail.com", cfg, onList), true);
  assert.equal(await canEnter("stranger@gmail.com", cfg, onList), false);
  assert.equal(await canEnter("", cfg, onList), false);
  list.delete("helper@gmail.com");
  assert.equal(await canEnter("helper@gmail.com", cfg, onList), false); // removed
});

test("the Settings field accepts plain email addresses only", () => {
  for (const ok of ["a@b.co", "ravi.patel@gmail.com"]) assert.equal(isEmail(ok), true, ok);
  for (const bad of ["", "ravi", "ravi@gmail", "a b@c.com", "@gmail.com", "a@b.c" + "o".repeat(260)]) assert.equal(isEmail(bad), false, bad);
});

test("a session still reads after a cookie parser has decoded it", async () => {
  const now = Date.parse("2026-10-23T00:00:00Z");
  const v = await signSession("owner@example.com", cfg.secret, now);
  assert.equal(await readSession(decodeURIComponent(v), cfg, now), "owner@example.com");
});
