import { afterEach, beforeEach, expect, test, vi } from "vitest";
import access from "../../config/experience-access.json";
import {
  ACCESS_HEADER,
  ACCESS_TTL_MS,
  canUseX,
  createExperienceAccess,
  verifyExperienceAccess,
} from "../../experience/src/access.js";
import worker from "../../experience/src/worker.js";
import {
  EXPERIENCE_APPS,
  experienceAppsFor,
  findExperienceApp,
} from "../../src/lib/experience";

const secret = "test-only-experience-secret-at-least-32-characters";
const now = Date.UTC(2026, 8, 22, 12);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function relay(
  url: string,
  token: string | null,
  configuredSecret: string | undefined = secret,
) {
  return worker.fetch(
    new Request("https://experience.test/v3/", {
      headers: {
        "x-bare-url": url,
        "x-bare-headers": "{}",
        ...(token ? { [ACCESS_HEADER]: token } : {}),
      },
    }),
    { EXPERIENCE_ACCESS_SECRET: configuredSecret },
  );
}

test("only Mason's stable Clerk identity can discover X or receive a grant", async () => {
  expect(experienceAppsFor(access.xClerkId).map((app) => app.id)).toContain(
    "x",
  );
  expect(findExperienceApp("x", access.xClerkId)?.start).toBe("https://x.com/");
  expect(EXPERIENCE_APPS.map((app) => app.id)).not.toContain("x");
  for (const identity of [
    null,
    undefined,
    "mason",
    "masonsyzn",
    "ceo",
    "moderator",
    "user_other",
  ]) {
    expect(canUseX(identity)).toBe(false);
    expect(findExperienceApp("x", identity)).toBeNull();
    expect(await createExperienceAccess(identity, secret)).toBeNull();
  }
});

test("grants expire and fail closed for missing, mismatched and undersized secrets", async () => {
  const token = await createExperienceAccess(access.xClerkId, secret);
  expect(await verifyExperienceAccess(token, secret)).toBe(now + ACCESS_TTL_MS);
  expect(await verifyExperienceAccess(token, `${secret}-wrong`)).toBe(false);
  expect(await verifyExperienceAccess(token, undefined)).toBe(false);
  expect(await createExperienceAccess(access.xClerkId, "short")).toBeNull();
  vi.setSystemTime(now + ACCESS_TTL_MS);
  expect(await verifyExperienceAccess(token, secret)).toBe(false);
});

test("changing the signed identity or expiry cannot widen access", async () => {
  const token = (await createExperienceAccess(access.xClerkId, secret))!;
  const [payload, signature] = token.split(".");
  const grant = JSON.parse(Buffer.from(payload, "base64url").toString());
  for (const changed of [
    { ...grant, sub: "user_other" },
    { ...grant, exp: now + ACCESS_TTL_MS * 2 },
    { ...grant, app: "all" },
  ]) {
    const forged = `${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${signature}`;
    expect(await verifyExperienceAccess(forged, secret)).toBe(false);
  }
  expect(await verifyExperienceAccess(`${token}.extra`, secret)).toBe(false);
  expect(await verifyExperienceAccess("invalid", secret)).toBe(false);
});

test.each(["x.com", "twitter.com", "twimg.com", "t.co"])(
  "Mason's grant unlocks %s and subdomains, but never lookalikes",
  async (host) => {
    const token = await createExperienceAccess(access.xClerkId, secret);
    const upstream = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", upstream);
    for (const hostname of [host, `cdn.${host}`]) {
      expect(
        (await relay(`https://${hostname}/`, token)).headers.get(
          "x-bare-status",
        ),
      ).toBe("200");
    }
    upstream.mockClear();
    for (const hostname of [`evil${host}`, `${host}.evil.example`]) {
      expect((await relay(`https://${hostname}/`, token)).status).toBe(403);
    }
    expect(upstream).not.toHaveBeenCalled();
  },
);

test("direct relay requests cannot bypass the X restriction or leak grants upstream", async () => {
  const upstream = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", upstream);
  const token = await createExperienceAccess(access.xClerkId, secret);
  expect((await relay("https://x.com/", null)).status).toBe(403);
  expect((await relay("https://x.com/", token, "wrong")).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
  await relay("https://x.com/", token);
  const options = (upstream.mock.calls[0] as unknown as [URL, RequestInit])[1];
  expect(new Headers(options.headers).has(ACCESS_HEADER)).toBe(false);
  expect(options.redirect).toBe("manual");
});

test("a failed X grant never disables public Experience services", async () => {
  const upstream = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", upstream);
  for (const app of EXPERIENCE_APPS) {
    expect(
      (await relay(app.start, "invalid", "")).headers.get("x-bare-status"),
    ).toBe("200");
  }
  expect(upstream).toHaveBeenCalledTimes(EXPERIENCE_APPS.length);
});
