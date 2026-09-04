"use client";

import { Popover } from "@base-ui/react/popover";
import { ArrowUpTrayIcon, PencilIcon } from "@heroicons/react/24/solid";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Monogram } from "@/components/app/chat/monogram";
import { OptionTiles } from "@/components/app/chat/option-tiles";
import { AVATAR_EMOJI, AVATAR_HUES, MAX_INITIALS } from "@/lib/chat";
import { cn } from "@/lib/utils";

/**
 * The whole of a disc: what is on it, and what it is on.
 *
 * Sent whole every time, because both mutations behind this take it whole —
 * `setAvatar` in `convex/chat/profiles.ts` and `setLook` in
 * `convex/chat/groups.ts`. See the note on either for why: a patch that could
 * land half of somebody's choice is a patch that eventually will.
 */
export type Face = { emoji?: string; initials?: string; hue?: number };

export type FaceUploadResult =
  { ok: true; previewUrl: string } | { ok: false; message: string };

/** The two halves of the choice, in the order they are asked. */
type Step = "picture" | "colour";

/** And the two things a picture can be. There is deliberately no third. */
type Mode = "photo" | "emoji" | "letters";

const STEPS: readonly { step: Step; title: string; hint: string }[] = [
  {
    step: "picture",
    title: "Picture",
    hint: "A face, or your own letters.",
  },
  { step: "colour", title: "Background", hint: "What it sits on." },
];

/**
 * Your disc, and the one gesture that changes it.
 *
 * ## Why this is a component and not two
 *
 * A person's disc and a group's disc were edited by two different pieces of UI
 * that did the same job — a stepper walking a ring of emoji here, a row of
 * swatches and a letters field there — and they sit one click apart in the same
 * column. Both are now this. The only thing that differs between the two is
 * what is written beside the disc, which is why that is `children`.
 *
 * ## The shape of it
 *
 * The disc is on the left and it is the button. Hovering it puts a pencil over
 * it, which is the plainest available statement that the picture is the thing
 * you are about to change — and the pencil goes away again the moment the
 * editor is open, because from then on the disc's job is to be the preview and
 * covering a preview is the one thing it cannot do while you are working.
 *
 * Pressing it opens the choices in a popup hung off the disc, the way the
 * account menu in the rail hangs off the avatar down there — same panel, same
 * border, same motion, and `.popup-drop` in `globals.css` is `.popup-slide`
 * for a popup that arrives from above instead of below.
 *
 * A popup and not a section that grows the page. Both of the places this is
 * used are already tall — a settings panel that has replaced a list of
 * conversations, and a sheet with a group's whole membership under it — and
 * pushing all of that down to make room for a grid of faces moves the thing
 * you were reading to make room for a thing you will close in four seconds. A
 * popup takes no room, and the disc it is anchored to stays exactly where it
 * was, which matters more here than usual: the disc is the preview.
 *
 * ## Why it is a stepper
 *
 * Picture and colour are one choice each and they compose, so showing both at
 * once means a grid of sixteen faces stacked on a wheel of twelve colours in a
 * panel this narrow — around forty targets under one heading. Asked one at a
 * time,
 * each step is a small set with a single question over it, and the disc beside
 * them is the running answer. You can also walk back, because the second
 * question often changes your mind about the first.
 *
 * ## What it may write
 *
 * The faces come from `AVATAR_EMOJI`, the colours from `AVATAR_HUES`, and the
 * letters are two characters that the server shape-checks. A person may also
 * upload a moderated image owned by their chat profile; groups remain on the
 * built-in faces and letters.
 */
export function FaceEditor({
  name,
  label,
  face,
  imageUrl,
  onUpload,
  onChange,
  children,
}: {
  /** What the disc falls back to when nothing is chosen: a handle, or a title. */
  name: string;
  /** What the disc is called to a screen reader — "your picture", "the group picture". */
  label: string;
  face: Face;
  /** A moderated image owned by this chat profile, never a Clerk image. */
  imageUrl?: string;
  /** Present only for people; group pictures remain emoji or letters. */
  onUpload?: (file: File) => Promise<FaceUploadResult>;
  /** The whole face, every time. See `Face`. */
  onChange: (face: Face) => void;
  /** What sits to the right of the disc. A name, and a number about it. */
  children: ReactNode;
}) {
  const { emoji, initials, hue } = face;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("picture");
  const [letters, setLetters] = useState(initials ?? "");

  // Which control the picture step is showing. It starts on whichever half is
  // in use, and after that it is the user's — somebody who clears their letters
  // is still on the letters step and about to type different ones, not asking
  // to be sent back to the emoji sheet.
  const [mode, setMode] = useState<Mode>(() =>
    imageUrl !== undefined
      ? "photo"
      : emoji === undefined && initials !== undefined
        ? "letters"
        : "emoji",
  );

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localImage, setLocalImage] = useState<
    { url: string; replaces?: string } | undefined
  >();
  const localImageCurrent =
    localImage !== undefined && imageUrl === localImage.replaces;
  const shownImage = localImageCurrent ? localImage.url : imageUrl;

  const body = useRef<HTMLDivElement>(null);

  // `undefined` is "however tall it is", and it is what the popup opens at.
  // The number only exists so that *stepping* has something to travel between:
  // `auto` cannot be interpolated, so the first measurement replaces a natural
  // height with the same height in pixels — no motion — and every one after
  // that is a step changing the contents under a box that follows them.
  const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined);

  const worn = letters.trim() || undefined;

  /**
   * The face as it stands, with one part swapped.
   *
   * Every control here goes through this, which is what keeps a colour from
   * quietly clearing a picture: the parts nobody touched are read back off the
   * current face and sent again unchanged. `letters` is preferred over
   * `initials` because it is the newer of the two — what has been typed but not
   * yet committed still belongs to the face.
   */
  function send(part: Face) {
    clearLocalImage();
    setUploadError(null);
    onChange({ emoji, initials: worn, hue, ...part });
  }

  // Following the server without undoing what is being typed.
  //
  // Both are needed. The field has to follow a change it did not make — another
  // tab, or the emoji that drops the letters on its way in — and it must not
  // follow its own answer coming back, because that answer arrives *late*: type
  // `A`, delete it, and the round trip for `A` lands on an empty field and
  // refills it with the letter that was just deleted. So the last value this
  // field sent is remembered, and what comes back equal to it is its own echo
  // and ignored. Anything else is somebody else's change, and is adopted.
  //
  // Both are adjusted during render rather than in an effect, which is what
  // React asks for when a piece of state is a prop plus a memory of it — an
  // effect would paint the stale value first and correct it afterwards. Held as
  // state and not in a ref for the same reason: a ref read during render is a
  // value React does not know was read.
  const [pushed, setPushed] = useState(initials);
  const [seen, setSeen] = useState(initials);
  if (seen !== initials) {
    setSeen(initials);
    if (initials !== pushed) {
      setPushed(initials);
      setLetters(initials ?? "");
      // Letters arriving from anywhere else means the letters are the half in
      // use, and the step should be showing the half in use. This is also what
      // gets the first draw right: the panel can be built before the profile
      // query has landed, and `mode` was picked off a face that was not there
      // yet.
      if (initials !== undefined) setMode("letters");
    }
  }

  const [seenImage, setSeenImage] = useState(imageUrl);
  if (seenImage !== imageUrl) {
    setSeenImage(imageUrl);
    if (imageUrl !== undefined && localImage === undefined) setMode("photo");
  }

  // Keep the local processed pixels on screen until the reactive profile read
  // returns the replacement storage URL, then release the object URL.
  useEffect(() => {
    if (localImage === undefined || imageUrl === localImage.replaces) return;
    URL.revokeObjectURL(localImage.url);
  }, [imageUrl, localImage]);

  useEffect(
    () => () => {
      if (localImage !== undefined) URL.revokeObjectURL(localImage.url);
    },
    [localImage],
  );

  function clearLocalImage() {
    if (localImage !== undefined) URL.revokeObjectURL(localImage.url);
    setLocalImage(undefined);
  }

  async function upload(file: File) {
    if (onUpload === undefined || uploading) return;
    setUploading(true);
    setUploadError(null);
    const result = await onUpload(file);
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.message);
      return;
    }
    clearLocalImage();
    setLocalImage({ url: result.previewUrl, replaces: imageUrl });
    setMode("photo");
  }

  // The letters settle before they are sent. A colour or a face is one press
  // and goes at once; this is somebody typing, and a write per keystroke would
  // be three writes to say `MS`.
  useEffect(() => {
    if (mode !== "letters") return;
    if ((initials ?? "") === letters.trim()) return;
    const timer = setTimeout(() => {
      setPushed(worn);
      onChange({ emoji: undefined, initials: worn, hue });
    }, 350);
    return () => clearTimeout(timer);
  }, [mode, letters, worn, initials, hue, onChange]);

  // Measured before paint and keyed on what is about to be inside, so the box
  // is aimed at the right number on the frame the step changes rather than
  // correcting itself one frame later.
  useLayoutEffect(() => {
    const node = body.current;
    if (node) setBodyHeight(node.offsetHeight);
  }, [step, mode, open]);

  // And this keeps it honest for the changes no render of ours announces — a
  // letters field wrapping its caption, or a narrow screen rewrapping the
  // sheet of faces.
  useEffect(() => {
    const node = body.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setBodyHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  const at = STEPS.findIndex((one) => one.step === step);
  const chosen =
    shownImage !== undefined ||
    emoji !== undefined ||
    initials !== undefined ||
    hue !== undefined;

  return (
    <Popover.Root
      open={open}
      onOpenChange={setOpen}
      // Put back once the popup is gone rather than as it starts leaving: a
      // panel that snaps to step one on its way out plays the last four seconds
      // backwards on the way. The height goes with it, so the next opening is
      // measured against what is actually in there rather than against
      // whichever step this one happened to end on.
      onOpenChangeComplete={(shown) => {
        if (shown) return;
        setStep("picture");
        setBodyHeight(undefined);
      }}
    >
      <div className="flex items-center gap-3">
        <Popover.Trigger
          aria-label={`Change ${label}`}
          className="group relative shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Monogram
            handle={name === "" ? "?" : name}
            imageUrl={shownImage}
            emoji={emoji}
            initials={initials}
            hue={hue}
            className="size-14 text-[1.25rem]"
          />

          {/* Over the disc, and only while the popup is shut. See the note at
              the top: once it is open the disc is the preview, and a preview
              with a pencil on it is a preview you cannot read. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity duration-150",
              // Off the state rather than off `group-data-popup-open`, which
              // would be a second variant fighting `group-hover` for the same
              // property and settling it by whichever rule Tailwind emitted
              // last.
              open
                ? null
                : "group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          >
            <PencilIcon className="size-5" />
          </span>
        </Popover.Trigger>

        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          className="z-50 outline-none"
        >
          <Popover.Popup className="popup-drop w-[17rem] rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-lg shadow-black/[0.08] outline-none">
            <div className="flex items-baseline gap-2">
              {/* A `p` rather than the heading Base UI would render: this
                  labels the popup for a reader, and a level-two heading
                  portalled out of a settings panel is a heading in the wrong
                  outline. */}
              <Popover.Title
                render={<p />}
                className="text-[0.875rem] font-semibold"
              >
                {STEPS[at].title}
              </Popover.Title>
              <p className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted-foreground">
                {STEPS[at].hint}
              </p>
            </div>

            <div
              // The upload panel is intentionally compact. Let it take its
              // natural height instead of briefly inheriting the taller emoji
              // grid's measured height, which otherwise leaves a large empty
              // shelf above the footer after switching to Photo.
              style={{
                height:
                  step === "picture" && mode === "photo"
                    ? undefined
                    : bodyHeight,
              }}
              className="overflow-hidden transition-[height] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            >
              {/* The measured one, and deliberately not the keyed one below
                  it: a `key` remounts, and an observer left watching the node
                  that was replaced reports the detached element at zero. */}
              <div ref={body} className="pt-2.5">
                {/* Keyed on the step, so each one arrives rather than the
                  contents changing under a heading that did not move. The
                  direction is the direction of travel — forward comes in from
                  the right, back from the left — which is the only thing that
                  says these two are beside each other rather than stacked. */}
                <div
                  key={step}
                  className={cn(
                    "animate-in fade-in duration-200",
                    step === "colour"
                      ? "slide-in-from-right-3"
                      : "slide-in-from-left-3",
                  )}
                >
                  {step === "picture" ? (
                    <Picture
                      name={name}
                      mode={mode}
                      emoji={emoji}
                      letters={letters}
                      imageUrl={shownImage}
                      canUpload={onUpload !== undefined}
                      uploading={uploading}
                      error={uploadError}
                      onMode={(next) => {
                        setMode(next);
                        // A stored photo belongs only to Photo mode. Leaving
                        // it is a real style change, so remove its attachment
                        // immediately rather than keeping hidden bytes around
                        // until an emoji or letters are chosen later.
                        if (next !== "photo" && shownImage !== undefined) {
                          setLetters("");
                          setPushed(undefined);
                          send({ emoji: undefined, initials: undefined });
                          return;
                        }
                        // Choosing to write letters is choosing not to wear a
                        // face. Choosing the sheet writes nothing until one is
                        // picked — the letters stay on the disc until something
                        // replaces them, which is what makes the tab a view and
                        // not an edit.
                        if (next === "letters") send({ emoji: undefined });
                      }}
                      onFile={(file) => void upload(file)}
                      onEmoji={(next) => {
                        // The disc has room for one thing, and the server drops
                        // the letters when a face arrives. Dropped here too —
                        // including from the memory of what was last sent, so
                        // that the empty initials coming back are read as this
                        // press's own echo and not as somebody clearing them
                        // from another tab.
                        setLetters("");
                        setPushed(undefined);
                        send({ emoji: next, initials: undefined });
                      }}
                      onLetters={setLetters}
                    />
                  ) : (
                    <Colour hue={hue} onHue={(next) => send({ hue: next })} />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              {/* Back to the letter and the colour the name gives it, which is
                  where everybody starts and the only way back to it. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!chosen}
                onClick={() => {
                  clearLocalImage();
                  setLetters("");
                  setPushed(undefined);
                  setMode("emoji");
                  setUploadError(null);
                  onChange({});
                }}
              >
                Reset
              </Button>

              <span className="flex-1" />

              {at > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(STEPS[at - 1].step)}
                >
                  Back
                </Button>
              ) : null}

              <Button
                type="button"
                size="sm"
                onClick={() =>
                  at < STEPS.length - 1 && mode !== "photo"
                    ? setStep(STEPS[at + 1].step)
                    : setOpen(false)
                }
              >
                {at < STEPS.length - 1 && mode !== "photo" ? "Next" : "Done"}
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Step one: a moderated upload, sixteen faces, or two letters. */
function Picture({
  name,
  mode,
  emoji,
  letters,
  imageUrl,
  canUpload,
  uploading,
  error,
  onMode,
  onFile,
  onEmoji,
  onLetters,
}: {
  name: string;
  mode: Mode;
  emoji?: string;
  letters: string;
  imageUrl?: string;
  canUpload: boolean;
  uploading: boolean;
  error: string | null;
  onMode: (mode: Mode) => void;
  onFile: (file: File) => void;
  onEmoji: (emoji: string | undefined) => void;
  onLetters: (letters: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);

  function take(files: FileList | null) {
    const file = files?.[0];
    if (file !== undefined) onFile(file);
  }

  return (
    <>
      <OptionTiles
        value={mode}
        onPick={onMode}
        className={cn("grid gap-1", canUpload ? "grid-cols-3" : "grid-cols-2")}
        options={[
          ...(canUpload ? [{ value: "photo" as const, label: "Photo" }] : []),
          { value: "emoji" as const, label: "Emoji" },
          { value: "letters" as const, label: "Letters" },
        ]}
      />

      {mode === "photo" && canUpload ? (
        <>
          <input
            ref={field}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => {
              take(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading}
            aria-label={
              imageUrl === undefined
                ? "Upload profile picture"
                : "Replace profile picture"
            }
            onClick={() => field.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              take(event.dataTransfer.files);
            }}
            className="mt-2 flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dotted border-border-strong bg-foreground/[0.025] text-muted-foreground transition-colors outline-none hover:border-primary/60 hover:bg-primary/[0.035] hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait"
          >
            <ArrowUpTrayIcon className="size-6 text-primary" />
            <span className="text-[0.8125rem] font-medium">
              {uploading ? "Checking…" : "Drop or Click"}
            </span>
          </button>
          {error === null ? null : (
            <p role="status" className="mt-2 text-[0.75rem] text-destructive">
              {error}
            </p>
          )}
        </>
      ) : mode === "emoji" ? (
        <div className="mt-2 grid grid-cols-8 gap-1">
          {AVATAR_EMOJI.map((face) => {
            const on = emoji === face;
            return (
              <button
                key={face}
                type="button"
                aria-label={face}
                aria-pressed={on}
                // Pressing the one already on takes it off, which is the only
                // way back to a bare disc without leaving this step.
                onClick={() => onEmoji(on ? undefined : face)}
                className={cn(
                  "flex aspect-square cursor-pointer items-center justify-center rounded-lg border text-[1.0625rem] transition-[background-color,border-color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                  on
                    ? "border-primary bg-primary/10"
                    : "border-transparent hover:bg-foreground/[0.06]",
                )}
              >
                {face}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          value={letters}
          onChange={(event) =>
            onLetters(event.target.value.replace(/[^a-z0-9]/gi, ""))
          }
          maxLength={MAX_INITIALS}
          spellCheck={false}
          autoComplete="off"
          aria-label="Letters on the picture"
          placeholder={`Letters, or ${name.slice(0, 1).toLowerCase() || "?"}`}
          className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-3 text-[0.875rem] transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
        />
      )}
    </>
  );
}

/** Step two: twelve colours and the one the name gives it. */
function Colour({
  hue,
  onHue,
}: {
  hue?: number;
  onHue: (hue: number | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {AVATAR_HUES.map((swatch) => {
        const on = hue === swatch;
        return (
          <button
            key={swatch}
            type="button"
            aria-label={`Colour ${swatch}`}
            aria-pressed={on}
            onClick={() => onHue(swatch)}
            className={cn(
              // A swatch is the colour it sets, so there is nothing to label.
              "monogram size-6 cursor-pointer rounded-full border-2 transition-[border-color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              on
                ? "border-primary"
                : "border-transparent hover:border-border-strong",
            )}
            style={{ "--monogram-hue": swatch } as CSSProperties}
          />
        );
      })}

      <button
        type="button"
        aria-pressed={hue === undefined}
        onClick={() => onHue(undefined)}
        className={cn(
          "flex h-6 cursor-pointer items-center rounded-full border px-2 text-[0.75rem] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          hue === undefined
            ? "border-primary text-foreground"
            : "border-border text-muted-foreground hover:border-border-strong",
        )}
      >
        Default
      </button>
    </div>
  );
}
