"use client";

import { useUser } from "@clerk/nextjs";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/solid";
import { useMutation, useQuery } from "convex/react";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Monogram } from "@/components/app/chat/monogram";
import { PixelFloor } from "@/components/visuals/pixel-floor";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { claimError, handleShapeError } from "@/lib/chat";
import { useStillness } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Availability } from "../../../../convex/chat/profiles";

/**
 * How long the field waits after a keystroke before it asks the server whether
 * the handle is free.
 *
 * Long enough that typing a twelve-character handle is one question rather than
 * twelve, short enough that it is answered before a hand has left the keyboard.
 */
const CHECK_AFTER_MS = 350;

/** How long the letters churn before they have all landed on the handle. */
const CIPHER_MS = 1250;

/**
 * How long the whole handoff takes, in the ordinary case.
 *
 * Longer than either the cipher or the dissolve, on purpose: the last half
 * second is the part where nothing moves and you are looking at the letter and
 * the name you will be known by. A ceremony that cuts away on its own last
 * frame reads as a transition rather than as an answer.
 *
 * Under reduced motion there is nothing to wait for — the cipher lands on its
 * first frame and the dissolve is collapsed to an instant by `globals.css` —
 * so the hold shrinks to the shortest beat that still reads as a beat.
 */
const REVEAL_MS = 2200;
const REVEAL_STILL_MS = 500;

/** The glyphs the name churns through on its way to being a handle.
 *
 *  Lowercase hex and punctuation, which is what a handle is made of plus the
 *  noise around it. Nothing uppercase: the churn has to read as the same line
 *  of type being rewritten, and a capital letter in a face this size reads as a
 *  different line. */
const GLYPHS = "abcdef0123456789#$%&*<>/\\|_[]{}=+?~";

/**
 * The one screen everybody sees before they can say anything.
 *
 * It exists because the account has a real first name and a real photograph on
 * it and chat must never use either. So both are on the page exactly once, at
 * the size they deserve, and then they are taken away in front of you: the
 * picture goes out of focus into the letter that stands in for you in every
 * thread, and the name is rewritten, a character at a time, into the handle you
 * just chose. Nothing about that is decoration. It is the only moment the
 * trade this app makes is visible, and it is worth two seconds.
 *
 * Asking for a handle is the whole of the setup — no display name, no picture,
 * no bio. Every field a profile does not have is a field nobody can be
 * identified by.
 *
 * The shape is checked here so the field can object before a round trip. Every
 * other check — reserved names, whether it reads as something unpleasant,
 * whether somebody already has one close enough to it — happens on the server,
 * and none of the rules behind those checks are in this bundle. See
 * `src/lib/chat.ts`.
 *
 * `onHold` is how the ceremony survives its own success; see `submit`.
 */
export function HandleGate({ onHold }: { onHold: (held: boolean) => void }) {
  const claim = useMutation(api.chat.profiles.claimHandle);
  const { user } = useUser();
  const still = useStillness();

  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The claimed handle and the colour the server gave it, once there is one.
   *  Also the signal to start the ceremony — everything below reads
   *  `claimed !== null` as "we are done asking".
   *
   *  The hue is carried back from the mutation rather than worked out here.
   *  `claimHandle` picks one off the wheel at random, and a disc that resolved
   *  out of the blur in one colour and then sat in the rail in another would
   *  make a liar of the only part of this screen that is a promise about what
   *  comes next. */
  const [claimed, setClaimed] = useState<{ handle: string; hue: number } | null>(
    null,
  );

  const shape = handle === "" ? null : handleShapeError(handle);

  /* What is worth asking the server about: a handle that has already passed the
     shape check here, because a two-character one is not a question, it is a
     mistake the field can answer on its own. */
  const wanted = shape === null ? handle : "";

  /* The debounced copy of it, which is what the query is actually keyed on. */
  const [probe, setProbe] = useState("");

  useEffect(() => {
    const ask = setTimeout(() => setProbe(wanted), CHECK_AFTER_MS);
    return () => clearTimeout(ask);
  }, [wanted]);

  const availability = useQuery(
    api.chat.profiles.available,
    probe === "" ? "skip" : { handle: probe },
  );

  /* Three states and the difference between them is which one the field is
     allowed to claim. `undefined` from a Convex query is "no answer yet", and
     a stale `probe` is the same thing a beat earlier — both are the spinner.
     `null` is a signed-out caller, which this screen cannot be but the query
     can still say, and it is treated as no answer rather than as a refusal. */
  const settled = probe === wanted && availability !== undefined;
  let verdict = settled ? (availability ?? null) : null;
  if (typeof window !== "undefined" && window.location.search.includes("fake")) {
    verdict = !settled || wanted === "" ? null : wanted.startsWith("z") ? { ok: false as const, reason: "taken" as const } : { ok: true as const };
  } // TEMP
  const checking = wanted !== "" && !settled;

  /* A known refusal stops the button; a check still in flight does not. The
     server is the authority either way, and holding the button hostage to a
     round trip somebody has already outrun would be slower than being wrong. */
  const ready =
    handle !== "" &&
    shape === null &&
    !busy &&
    claimed === null &&
    verdict?.ok !== false;

  // What Clerk knows you as, which is the one thing this screen exists to stop
  // being how anyone finds you. It is on the page for as long as it takes to
  // replace it and then it is gone.
  const name = user?.fullName ?? user?.username ?? "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);

    // Held *before* the round trip and not after it, which is the whole reason
    // this is a prop rather than a piece of state in here.
    //
    // Nothing on this screen navigates: the profile query is a subscription, so
    // the row landing is what swaps this screen for the chat — the same way the
    // agreement card gets out of its own way. But Convex resolves a mutation
    // only once the queries it changed have been applied, so by the line after
    // this `await` the profile is already there and `ChatFrame` has already
    // taken the gate down. A hold asked for at that point is asked for by a
    // component that no longer exists, and the ceremony never runs at all.
    onHold(true);
    if (window.location.search.includes("fake")) { setClaimed({ handle, hue: Math.floor(Math.random() * 12) * 30 + 10 }); setBusy(false); return; } // TEMP
    const result = await claim({ handle });
    setBusy(false);

    if (!result.ok) {
      setError(claimError(result.reason));
      onHold(false);
      return;
    }

    setClaimed({ handle, hue: result.hue });
  }

  // Let go once it has played. The gate is not unmounted by this — `ChatFrame`
  // is — so if the subscription were somehow still behind, what stays on screen
  // is the finished ceremony rather than an empty form.
  useEffect(() => {
    if (claimed === null) return;

    const done = setTimeout(
      () => onHold(false),
      still ? REVEAL_STILL_MS : REVEAL_MS,
    );
    return () => clearTimeout(done);
  }, [claimed, still, onHold]);

  return (
    <div className="relative flex size-full flex-col items-center justify-center overflow-hidden p-6 pb-[16vh]">
      <PixelFloor />

      {/* The visible line under the picture is a name, not a heading, and a
          name is a poor thing to hand a screen reader as the title of a page.
          So the title is here, said once, and the design carries on without
          drawing it. */}
      <h1 className="sr-only">Pick a handle</h1>

      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        {/* Both faces live in the same box and are laid on top of each other,
            because a dissolve between two elements only reads as one object
            changing if neither of them moves while it happens. */}
        <div className="relative size-32">
          {user?.imageUrl ? (
            <Image
              src={sized(user.imageUrl, 256)}
              alt=""
              width={256}
              height={256}
              // Clerk serves these from its own CDN already sized by the
              // `width` query above; running them back through the optimizer
              // would be a second hop for no gain.
              unoptimized
              className={cn(
                "absolute inset-0 size-32 rounded-full object-cover",
                claimed !== null && "animate-handle-dissolve",
              )}
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0 size-32 rounded-full bg-muted"
            />
          )}

          {claimed !== null && (
            <Monogram
              handle={claimed.handle}
              hue={claimed.hue}
              className="animate-handle-resolve absolute inset-0 size-32 text-[2.75rem]"
            />
          )}
        </div>

        {/* `min-h` and not a fixed height: this holds the row while Clerk
            resolves, so the description below it does not step down the page a
            frame after the picture arrives. */}
        <p
          className={cn(
            "text-display mt-6 min-h-9 text-[2rem] break-words transition-colors duration-300",
            claimed !== null && "text-primary",
          )}
        >
          <Cipher
            from={name}
            to={claimed === null ? name : `@${claimed.handle}`}
            running={claimed !== null}
            still={still}
          />
        </p>

        {/* Everything you were asked for leaves once you have answered, so the
            last thing on the screen is the letter and the name. */}
        <div
          className={cn(
            "w-full transition-opacity duration-500",
            claimed !== null && "pointer-events-none opacity-0",
          )}
        >
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
            The only name chat will ever show. Your real name and email stay out
            of it, and you may change this twice — then never again.
          </p>

          <form onSubmit={submit} className="mt-6">
            {/* No `gap` on the row: the verdict collapses to nothing when
                there is nothing to say, and a gap would hold eight pixels open
                on the right of an empty field for it. Both neighbours carry
                their own margin instead, and the verdict's is inside the part
                that collapses. */}
            <div className="flex items-center rounded-xl border border-border bg-background px-3 focus-within:border-primary">
              <span className="mr-2 text-[0.9375rem] text-faint">@</span>
              <input
                value={handle}
                onChange={(event) => {
                  setHandle(event.target.value.toLowerCase());
                  setError(null);
                }}
                autoFocus
                maxLength={20}
                spellCheck={false}
                autoComplete="off"
                aria-label="Handle"
                placeholder="something"
                disabled={claimed !== null}
                className="h-11 min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-faint"
              />
              <Verdict checking={checking} verdict={verdict} />
            </div>

            {/* One message at a time, and the local one goes first: complaining
                that a handle is taken while it is also too short is two problems
                to fix in an order nobody was told. */}
            <p className="mt-2 min-h-5 text-[0.8125rem] text-destructive">
              {shape ?? error ?? ""}
            </p>

            <Button type="submit" disabled={!ready} className="mt-2 w-full">
              {busy ? "Claiming…" : "Claim it"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * The answer, inside the field it is about.
 *
 * Three states in one box — nothing, a spinner, a verdict — and the width is
 * the thing that has to move between them, because everything here sits to the
 * right of a caret somebody is still typing at. A width that snaps drags the
 * whole field with it.
 *
 * CSS cannot transition to `auto`, so the growth is the `0fr` to `1fr` grid
 * trick: a single-column grid whose track is either nothing or the width of its
 * own content, with the content clipped while it is neither. It is used twice,
 * nested — once for the whole indicator appearing, once for the label arriving
 * beside the icon — which is what makes the spinner-to-verdict step a movement
 * rather than a jump. `activity-card.tsx` explains why this is *not* used for
 * the same job there: an animated grid track costs a layout pass per frame, and
 * there are up to 82 of those on screen at once. There is exactly one of this.
 *
 * The icons share a box and cross-fade in place. Swapping them would put a
 * sixteen-pixel hole in the middle of a width that is already moving.
 *
 * Everything inside the clip fades in a beat *after* the width has opened, and
 * out before it closes. That delay is the whole difference between this reading
 * as something arriving and reading as something being sliced: a track that is
 * animating from nothing to ninety pixels spends a quarter of a second showing
 * a fraction of a tick and half a word, and the fix for that is not to have
 * anything visible in the clip while it is moving.
 */
function Verdict({
  checking,
  verdict,
}: {
  checking: boolean;
  verdict: Availability | null;
}) {
  const good = verdict?.ok === true;
  const bad = verdict?.ok === false;
  const label = good ? "Looks good" : bad ? "Unavailable" : "";
  const shown = checking || verdict !== null;

  return (
    <div
      className="grid transition-[grid-template-columns] duration-300 ease-out"
      style={{ gridTemplateColumns: shown ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        <div
          className={cn(
            "flex items-center gap-1.5 pr-px pl-2 text-[0.8125rem] whitespace-nowrap transition-[color,opacity] duration-200",
            shown ? "opacity-100 delay-150" : "opacity-0",
            good && "text-success",
            bad && "text-destructive",
            !good && !bad && "text-faint",
          )}
        >
          {/* One box, three occupants, all the same size. */}
          <span className="relative size-4 shrink-0">
            <Spinner
              aria-hidden
              className={cn(
                "absolute inset-0 transition-opacity duration-200",
                checking ? "opacity-100" : "opacity-0",
              )}
            />
            <CheckCircleIcon
              aria-hidden
              className={cn(
                "absolute inset-0 size-4 transition-opacity duration-200",
                good ? "opacity-100" : "opacity-0",
              )}
            />
            <XCircleIcon
              aria-hidden
              className={cn(
                "absolute inset-0 size-4 transition-opacity duration-200",
                bad ? "opacity-100" : "opacity-0",
              )}
            />
          </span>

          {/* The label is the part that actually changes width. `aria-live`
              rather than a second hidden node: this is short, it is the whole
              answer, and it is only ever announced once it has settled. */}
          <span
            className="grid transition-[grid-template-columns] duration-300 ease-out"
            style={{ gridTemplateColumns: label === "" ? "0fr" : "1fr" }}
          >
            <span
              className={cn(
                "overflow-hidden transition-opacity duration-200",
                label === "" ? "opacity-0" : "opacity-100 delay-150",
              )}
              aria-live="polite"
            >
              {label}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * One line of type being rewritten into another, a character at a time.
 *
 * Each position gets a window: it holds the old character until its window
 * opens, churns through `GLYPHS` while the window is open, and lands on its
 * final character when the window closes. The windows are staggered across the
 * line and overlap heavily, which is what makes the whole line look like it is
 * being worked on at once while still resolving left to right.
 *
 * The churn is deliberately not a fresh glyph per position per frame. At sixty
 * frames a second that is a grey smear; re-rolling roughly a third of the
 * positions on any given frame leaves each glyph on screen long enough to be
 * read as a character, which is the entire effect.
 *
 * Under reduced motion the churn does not happen at all and the line is simply
 * the handle. There is no softer version of a flicker.
 *
 * Only the frame callback writes state. Everything that is not mid-churn — not
 * running yet, running under reduced motion, finished — is worked out during
 * the render from the props, because a `setState` in the body of an effect is a
 * second render to say what the first one already had in hand.
 */
function Cipher({
  from,
  to,
  running,
  still,
}: {
  from: string;
  to: string;
  running: boolean;
  still: boolean;
}) {
  // `null` until the first frame has something to show, which is what lets the
  // line render from the props before then.
  const [churn, setChurn] = useState<string | null>(null);
  // Held across frames so a glyph survives the frames it was not re-rolled on.
  const glyphs = useRef<string[]>([]);

  useEffect(() => {
    if (!running || still) return;

    const length = Math.max(from.length, to.length);
    glyphs.current = Array.from(
      { length },
      () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    );

    const started = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / CIPHER_MS);

      let out = "";
      for (let index = 0; index < length; index += 1) {
        // The last position opens at 0.55 and every window is 0.45 long, so
        // the line finishes exactly as the clock runs out however long it is.
        const opens = length === 1 ? 0 : (index / (length - 1)) * 0.55;
        if (progress < opens) {
          out += from[index] ?? "";
        } else if (progress >= opens + 0.45) {
          out += to[index] ?? "";
        } else {
          if (Math.random() < 0.35) {
            glyphs.current[index] =
              GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
          out += glyphs.current[index];
        }
      }

      setChurn(out);
      if (progress < 1) raf = requestAnimationFrame(frame);
      else setChurn(to);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [from, to, running, still]);

  const text = !running ? from : still ? to : (churn ?? from);

  // The finished line is announced; the churn is not. A screen reader reading
  // out a thousand milliseconds of noise is the accessible version of nothing.
  return (
    <>
      <span aria-hidden>{text}</span>
      <span className="sr-only" aria-live="polite">
        {running ? to : from}
      </span>
    </>
  );
}

/** Clerk's images are sized by a query on the URL, so ask for one that holds
 *  up at this size on a retina screen rather than scaling the 36px the rail
 *  asked for. Anything that is not a URL we can parse is left alone. */
function sized(url: string, width: number) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("width", String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}
