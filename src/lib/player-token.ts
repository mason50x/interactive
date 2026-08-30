/**
 * Access grants for the player origin.
 *
 * The player origin cannot use the session. That is the entire point of it
 * existing — a Clerk cookie there is a cookie game code can read — so the
 * usual answer of "run the auth middleware on it too" is the one answer
 * unavailable. Instead the app, which does hold the session, signs a short
 * grant naming one game, and the player origin verifies the signature before
 * serving anything. No session crosses the boundary and no crawler gets a
 * page: an unsigned request is a 404.
 *
 * A grant is deliberately weak. It authorises loading one game for a couple of
 * hours and nothing else — it is not a session, cannot be exchanged for one,
 * and carries no ability to reach Convex or read anything about the user.
 *
 * It is also readable by the game, since it travels in the URL. That is why
 * the subject is a keyed hash of the Clerk user id rather than the id itself:
 * we keep the ability to tie a request back to an account server-side without
 * handing game code the identifier that would let it do the same.
 */

/** Long enough to survive a game left open over a lesson, short enough that a
 *  leaked URL is worth little. Only checked when the document loads, so it
 *  never interrupts a run in progress. */
const GRANT_TTL_SECONDS = 2 * 60 * 60;

/** Query parameter carrying the grant. */
export const GRANT_PARAM = "t";

type GrantPayload = {
  /** Game slug this grant is good for. */
  s: string;
  /** Expiry, epoch seconds. */
  e: number;
  /** Pseudonymous subject — a keyed hash of the Clerk user id. */
  u: string;
};

const encoder = new TextEncoder();

function secret(): string | null {
  return process.env.PLAYER_TOKEN_SECRET || null;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromBase64url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** HMAC-SHA256 via Web Crypto, which is the one implementation available in
 *  both the Node runtime the dashboard renders in and the edge runtime the
 *  proxy verifies in. */
async function sign(key: string, data: string): Promise<string> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", material, encoder.encode(data));
  return base64url(new Uint8Array(signature));
}

/** Compares in time independent of where the first difference falls, so a
 *  caller cannot recover a signature byte at a time by timing the rejection. */
function equalsInConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Signs a grant for one game. Server-side only, and only ever after the
 * caller has established who the user is.
 */
export async function mintPlayerGrant(slug: string, userId: string): Promise<string> {
  const key = secret();
  if (!key) {
    // Loud rather than silent: a missing secret must not degrade into serving
    // games unauthenticated, and the dashboard is the right place to notice.
    throw new Error(
      "PLAYER_TOKEN_SECRET is not set — the player origin cannot be gated. " +
        "Run `vercel env pull`, or set it on the deployment.",
    );
  }

  const payload: GrantPayload = {
    s: slug,
    e: Math.floor(Date.now() / 1000) + GRANT_TTL_SECONDS,
    u: (await sign(key, `subject:${userId}`)).slice(0, 22),
  };

  const body = base64url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await sign(key, body)}`;
}

/**
 * Verifies a grant against the game actually being requested.
 *
 * Returns a plain boolean, and false for every failure — bad signature, wrong
 * game, expired, malformed, no secret configured. The caller answers 404 to
 * all of them alike, so nothing about why is observable from outside.
 */
export async function verifyPlayerGrant(
  grant: string | null,
  slug: string,
): Promise<boolean> {
  const key = secret();
  if (!key || !grant || !slug) return false;

  const [body, signature] = grant.split(".");
  if (!body || !signature) return false;

  if (!equalsInConstantTime(signature, await sign(key, body))) return false;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(bytesFromBase64url(body)),
    ) as GrantPayload;

    if (payload.s !== slug) return false;
    if (typeof payload.e !== "number") return false;
    return payload.e > Date.now() / 1000;
  } catch {
    return false;
  }
}
