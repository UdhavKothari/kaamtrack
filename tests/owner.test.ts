import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpenPath, ownerToken, sameString } from "../lib/owner.ts";

test("open without a passcode: job worker pages and Meta/cron/login endpoints only", () => {
  for (const open of ["/s/0123456789abcdef", "/api/lots/0123456789abcdef", "/api/lots/0123456789abcdef/note", "/api/whatsapp/webhook", "/api/cron/remind", "/login", "/api/login"]) {
    assert.equal(isOpenPath(open), true, open);
  }
});

test("everything of the owner's needs the passcode, including look-alikes of the open paths", () => {
  for (const closed of [
    "/", "/whatsapp", "/api/lots", "/api/extract", "/api/workers", "/api/whatsapp/simulate",
    "/api/lots/0123456789abcdef/remind", "/api/lots/0123456789abcdef/nudge", "/api/lots/0123456789abcdef/messages",
    "/api/lots/0123456789abcdef/edit", "/api/lots/0123456789abcdef/delete", "/api/lots/0123456789abcdef/photo",
    "/api/lots/not-a-token", "/api/lots/not-a-token/note", "/api/lots/0123456789abcdef/note/x", "/api/lots/0123456789abcdef/", "/s/", "/s/a/b", "/api/cron", "/login/x", "/api/whatsapp/webhook/x",
  ]) {
    assert.equal(isOpenPath(closed), false, closed);
  }
});

test("the cookie value depends on the passcode, is stable, and never contains it", async () => {
  const a = await ownerToken("letmein");
  assert.equal(a, await ownerToken("letmein"));
  assert.notEqual(a, await ownerToken("letmein2"));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a.includes("letmein"), false);
});

test("string compare is exact, including length", () => {
  assert.equal(sameString("abc", "abc"), true);
  assert.equal(sameString("abc", "abd"), false);
  assert.equal(sameString("abc", "abcd"), false);
  assert.equal(sameString("", ""), true);
  assert.equal(sameString("", "x"), false);
});
