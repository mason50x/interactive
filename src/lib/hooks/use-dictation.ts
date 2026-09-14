import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Speech into text, using the recogniser the browser already has.
 *
 * ## Why the browser and not a service
 *
 * Chrome, Edge and Safari ship a speech recogniser behind the Web Speech API.
 * It costs nothing, needs no key, and the audio never passes through this
 * app's server — which, for a chat between strangers, is the point. Firefox
 * has no recogniser at all, so `supported` is read as an external store with
 * a server snapshot of `false`: the button is absent on the server, absent
 * in Firefox, and appears after hydration everywhere else without a mismatch.
 *
 * ## Why the prompt is tied to the tap
 *
 * `start()` runs synchronously inside the click that asked for it, the same
 * rule the weather card follows for geolocation (see `src/lib/weather.ts`).
 * The microphone permission dialog hangs off that gesture; started from an
 * effect it would either be blocked or land on somebody who did not ask.
 * Nothing here starts in an effect, which is also what makes StrictMode's
 * mount, unmount, mount in development harmless — the only effect is the
 * cleanup, and it finds nothing running.
 *
 * ## Finals and interims
 *
 * The recogniser reports results twice: an interim guess that changes as
 * more is heard, then a final one that does not. Finals are handed to the
 * caller one at a time through `onFinal`, exactly once each, in order — the
 * caller appends them to whatever it holds, so text typed mid-sentence
 * survives. The interim is returned as `interim` for the caller to show
 * after the committed text and never to store; when the next final arrives
 * it replaces the guess it grew from.
 *
 * ## Stopping, and being stopped
 *
 * `stop()` is graceful: the utterance in flight still comes back as a final.
 * `abort()` is immediate and drops whatever was in flight; it is what a send
 * uses, because nothing further may arrive into a field that has just been
 * emptied. Chrome also ends a session on its own after a stretch of silence
 * and at about a minute regardless. Both cases arrive through `onend`, reset
 * the state to `idle`, and do not restart — the button returns, the text
 * stays, and another tap picks up where it left off.
 *
 * ## Errors
 *
 * Only the failures worth a sentence become one: a blocked or missing
 * microphone, no network, an unsupported language. Hearing nothing, being
 * aborted, and a grammar complaint are silent, because there is nothing the
 * reader can do about them and the button simply going back to idle says
 * enough.
 */

export type DictationState = "idle" | "starting" | "listening" | "stopping";

const subscribeNever = () => () => {};

function recogniser() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/** Copy for the codes worth telling somebody about. Absent means silent. */
const FAILURES: Partial<Record<SpeechRecognitionErrorCode, string>> = {
  "not-allowed":
    "Microphone access is blocked. Allow it in your browser's site settings to dictate.",
  "service-not-allowed":
    "Microphone access is blocked. Allow it in your browser's site settings to dictate.",
  "audio-capture": "No microphone was found.",
  network: "Dictation needs a network connection.",
  "language-not-supported": "Dictation is not available for this language.",
};

export function useDictation({
  onFinal,
  onError,
  lang,
}: {
  /** One finished segment, in order, exactly once. */
  onFinal: (segment: string) => void;
  /** A sentence for the reader. Silent codes never reach it. */
  onError: (message: string) => void;
  /** Defaults to the browser's own language. */
  lang?: string;
}) {
  const supported = useSyncExternalStore(
    subscribeNever,
    () => Boolean(recogniser()),
    () => false,
  );

  const [state, setState] = useState<DictationState>("idle");
  const [interim, setInterim] = useState("");

  const current = useRef<SpeechRecognition | null>(null);
  /** Results `[0, committed)` have already gone out through `onFinal`. */
  const committed = useRef(0);
  /** Mirror of `interim` for `onend`, which cannot read state. */
  const pending = useRef("");
  /** Set by `abort()`, so `onend` drops the tail instead of keeping it. */
  const discarding = useRef(false);
  const callbacks = useRef({ onFinal, onError });
  useEffect(() => {
    callbacks.current = { onFinal, onError };
  });

  const start = useCallback(() => {
    if (current.current !== null) return;
    const Recogniser = recogniser();
    if (!Recogniser) return;

    const rec = new Recogniser();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang ?? navigator.language;
    committed.current = 0;
    pending.current = "";
    discarding.current = false;

    // Every handler checks it still belongs to the live instance, so a
    // superseded recogniser's last words land nowhere.
    rec.onstart = () => {
      if (current.current === rec) setState("listening");
    };

    rec.onresult = (event) => {
      if (current.current !== rec) return;
      let guess = "";
      // From what has been committed rather than from `resultIndex`, which
      // some Android builds rewind. Each final goes out once either way.
      for (let i = committed.current; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          committed.current = i + 1;
          if (text !== "") callbacks.current.onFinal(text);
        } else if (text !== "") {
          guess = guess === "" ? text : `${guess} ${text}`;
        }
      }
      pending.current = guess;
      setInterim(guess);
    };

    rec.onerror = (event) => {
      if (current.current !== rec) return;
      const message = FAILURES[event.error];
      if (message !== undefined) callbacks.current.onError(message);
    };

    rec.onend = () => {
      if (current.current !== rec) return;
      current.current = null;
      setState("idle");
      // Chrome finalises before ending, whether asked to stop or stopping on
      // its own, so this is usually empty. When it is not, the words were
      // said and are kept — unless `abort()` asked otherwise.
      const tail = pending.current;
      pending.current = "";
      setInterim("");
      if (tail !== "" && !discarding.current) callbacks.current.onFinal(tail);
    };

    current.current = rec;
    setState("starting");
    try {
      rec.start();
    } catch {
      current.current = null;
      setState("idle");
    }
  }, [lang]);

  const stop = useCallback(() => {
    const rec = current.current;
    if (rec === null) return;
    setState("stopping");
    rec.stop();
  }, []);

  const abort = useCallback(() => {
    const rec = current.current;
    if (rec === null) return;
    discarding.current = true;
    rec.abort();
  }, []);

  useEffect(
    () => () => {
      current.current?.abort();
      current.current = null;
    },
    [],
  );

  return { supported, state, interim, start, stop, abort };
}
