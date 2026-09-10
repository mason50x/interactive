import type { Refusal } from "./rules";

/**
 * Looking at a picture, which is the one thing the word lists cannot do.
 *
 * ## Why a classifier, and why this one
 *
 * Everything else in this directory is deterministic and free, and both of
 * those are load-bearing: a filter that costs nothing per message is a filter
 * that runs on every message, and a filter with no model behind it has no
 * bill that grows with the room. A picture breaks both. There is no word list
 * for pixels, and every service that will read an image charges for it —
 * except OpenAI's moderation endpoint, which is priced at nothing, accepts
 * images, and answers with the same categories the lexicon already refuses
 * under. That is the whole of why it is this one. If it ever stops being
 * free the number to reach for is `IMAGE_TTL_MS`, not this file: the cost of
 * the feature is one request per upload, and nothing here is retried.
 *
 * ## It fails closed
 *
 * A picture the classifier could not read is refused, with `image-check`, and
 * it costs the sender nothing. That is not a judgement about the picture; it
 * is the only honest answer on a site with no moderators. The alternative —
 * letting a picture through because the service that would have looked at it
 * was down — turns an outage into a window, and an outage is exactly when a
 * window is being looked for. So a missing key, a timeout, a bad response and
 * a refused request all read the same to the caller: not now.
 *
 * ## What it refuses
 *
 * The categories that are about what is depicted. Sexual content, under the
 * same name the lexicon uses, and its minors variant under `exploitation`.
 * Self-harm, in every form the model separates. Gore, which is `graphic` — the
 * one category pictures have that sentences do not.
 *
 * Plain `violence` is deliberately not on the list. On a site of game
 * screenshots it is the category most likely to fire on a picture nobody
 * would object to, and the model's own line for it is drawn for a general
 * audience rather than for one that spends its time in fights with pixel
 * dragons. `violence/graphic` is where the line is drawn here instead. The
 * score is logged either way, so that judgement can be revisited with numbers
 * rather than remembered.
 *
 * The verdict is the model's own `categories` booleans, which are its
 * calibrated thresholds, rather than a hand-picked cut on `category_scores`.
 * A threshold picked here would be picked once, by somebody looking at a
 * handful of examples, and never looked at again.
 */

/** Where the check is sent. The key is read from the deployment, never passed. */
const ENDPOINT = "https://api.openai.com/v1/moderations";

/** The model that takes images. `latest` follows OpenAI's own upgrades. */
const MODEL = "omni-moderation-latest";

/** How long one picture is given before it is refused as unchecked. */
const TIMEOUT_MS = 20_000;

/**
 * What one picture came back as.
 *
 * `refusal` is a `Refusal` so pictures and text use the same client copy.
 */
export type ImageVerdict =
  | { ok: true }
  | { ok: false; refusal: ImageRefusal };

/** The subset of refusals a picture can earn. Mirrored by `settle`'s validator. */
export type ImageRefusal = Extract<
  Refusal,
  "sexual" | "exploitation" | "self-harm" | "graphic" | "image-check"
>;

/** The part of the response this reads. Everything else is ignored. */
type ModerationResponse = {
  model?: string;
  results?: ModerationResult[];
};

/** One picture's answer, as the model gives it. */
export type ModerationResult = {
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
};

/**
 * Category to refusal, in the order they are checked — so a picture that
 * trips more than one is refused for the worst, which is the same rule
 * `worst` in `./verdict.ts` applies to words.
 */
const CATEGORIES: { key: string; refusal: ImageRefusal }[] = [
  { key: "sexual/minors", refusal: "exploitation" },
  { key: "sexual", refusal: "sexual" },
  { key: "self-harm/instructions", refusal: "self-harm" },
  { key: "self-harm/intent", refusal: "self-harm" },
  { key: "self-harm", refusal: "self-harm" },
  { key: "violence/graphic", refusal: "graphic" },
];

/** The refusal every failure collapses to. Free, and says nothing about you. */
const UNCHECKED: ImageVerdict = {
  ok: false,
  refusal: "image-check",
};

/**
 * Ask whether a picture may be shown.
 *
 * Takes a URL rather than bytes because the file is already in Convex
 * storage and the classifier can fetch it from there directly; pulling it
 * into the action to re-send as base64 would move every byte twice for
 * nothing. The URL is the storage URL, which is unguessable and expires with
 * the file — the picture is deleted the moment this says no.
 */
export async function inspectImage(url: string): Promise<ImageVerdict> {
  const result = await moderate(url);
  if (result === null || result.categories === undefined) return UNCHECKED;

  for (const category of CATEGORIES) {
    if (result.categories[category.key] === true) {
      return {
        ok: false,
        refusal: category.refusal,
      };
    }
  }

  // Kept as a number in the logs and nowhere else, for the reason in the
  // note above: the line on plain violence is a judgement, and a judgement
  // is worth being able to check against what actually came through.
  const violence = result.category_scores?.violence;
  if (result.flagged === true && violence !== undefined) {
    console.log(`Image passed with violence score ${violence.toFixed(2)}`);
  }

  return { ok: true };
}

/**
 * The request itself, and the model's answer as it gave it.
 *
 * Split out from `inspectImage` so the scores can be looked at without a
 * verdict being made of them — `scores` in `convex/chat/attachments.ts` runs
 * this against a stored picture from the command line, which is how the
 * thresholds above get argued about with numbers. `null` is every failure:
 * no key, no network, a refused request, an unreadable body. Each one is
 * logged with its reason and none of them is retried.
 */
export async function moderate(url: string): Promise<ModerationResult | null> {
  const key = process.env.OPENAI_API_KEY;
  if (key === undefined || key === "") {
    // Loud, because the symptom on the client is every picture refused with
    // "try again in a minute", which reads as an outage rather than a
    // deployment that was never given its key.
    console.error(
      "OPENAI_API_KEY is not set on the Convex deployment; every picture is being refused. " +
        "Set it with `npx convex env set OPENAI_API_KEY sk-...` (and again with --prod).",
    );
    return null;
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{ type: "image_url", image_url: { url } }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Image check did not complete:", error);
    return null;
  }

  if (!response.ok) {
    // The body is the only place the reason is — a bad key and a rate limit
    // look the same from the status line alone.
    console.error(
      `Image check refused: ${response.status} ${await response.text().catch(() => "")}`,
    );
    return null;
  }

  let parsed: ModerationResponse;
  try {
    parsed = (await response.json()) as ModerationResponse;
  } catch (error) {
    console.error("Image check returned something unreadable:", error);
    return null;
  }

  const result = parsed.results?.[0];
  if (result === undefined) {
    console.error("Image check returned no result");
    return null;
  }
  return result;
}
