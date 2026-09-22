import access from "../../config/experience-access.json";

export const ACCESS_TTL_MS = 10 * 60 * 1000;
export const ACCESS_HEADER = "x-experience-access";

/** Access is bound to Mason's exact account, independently of editable roles. */
export function canUseX(clerkId) {
  return typeof clerkId === "string" && clerkId === access.xClerkId;
}

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decode(value) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
}

async function signingKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** A short-lived grant for X only; never expose a Clerk session to framed sites. */
export async function createExperienceAccess(clerkId, secret, now = Date.now()) {
  if (!canUseX(clerkId) || typeof secret !== "string" || secret.length < 32) return null;
  const payload = encode(new TextEncoder().encode(JSON.stringify({ sub: clerkId, app: "x", exp: now + ACCESS_TTL_MS })));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}

export async function verifyExperienceAccess(token, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 2048 || typeof secret !== "string" || secret.length < 32) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    const valid = await crypto.subtle.verify("HMAC", await signingKey(secret), decode(signature), new TextEncoder().encode(payload));
    if (!valid) return false;
    const grant = JSON.parse(new TextDecoder().decode(decode(payload)));
    return canUseX(grant.sub) && grant.app === "x" && Number.isSafeInteger(grant.exp) && grant.exp > now && grant.exp <= now + ACCESS_TTL_MS ? grant.exp : false;
  } catch {
    return false;
  }
}
