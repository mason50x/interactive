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
 * rule used for other browser permissions.
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
 * microphone, an unreachable service, an unsupported language. Hearing
 * nothing, being aborted, and a grammar complaint are silent, because there
 * is nothing the reader can do about them and the button simply going back
 * to idle says enough.
 *
 * ## When the service is out of reach
 *
 * Chrome's recogniser is a Google server, and `network` is what comes back
 * when the browser cannot reach it — a filtered school or office network, or
 * a Chromium fork (Brave, Electron) that ships the API without the service.
 * It fails the same way on every tap, so retrying teaches nothing. Chrome
 * can also recognise on the device, though: after one `network` failure the
 * next tap installs that model (the install needs the gesture, which is why
 * it waits for a tap rather than following the error) and listens locally,
 * and this browser keeps doing so from then on. Where there is no on-device
 * recogniser the sentence says so plainly instead of blaming the connection.
 */

export type DictationState = "idle" | "starting" | "listening" | "stopping";

const subscribeNever = () => () => {};

/**
 * Set once the service has failed here and on-device recognition is on offer.
 * A per-browser convenience: losing it costs one more failed tap.
 */
const LOCAL_KEY = "dictation:on-device";

function prefersLocal() {
  try {
    return localStorage.getItem(LOCAL_KEY) === "1";
  } catch {
    return false;
  }
}

function setPrefersLocal(on: boolean) {
  try {
    if (on) localStorage.setItem(LOCAL_KEY, "1");
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    // Private windows and blocked storage: the fallback is simply not kept.
  }
}

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
  "language-not-supported": "Dictation is not available for this language.",
};

/** `network`, which is handled apart from the rest; see the module notes. */
const UNREACHABLE_RETRY =
  "Couldn't reach the speech service. Tap the mic again to dictate on this device instead.";
const UNREACHABLE =
  "Dictation can't reach its speech service from this browser or network.";
const NO_LOCAL_MODEL =
  "On-device dictation is not available for this language.";

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
  /** Bumped to disown an on-device install still in flight. */
  const installs = useRef(0);
  const installing = useRef(false);
  const callbacks = useRef({ onFinal, onError });
  useEffect(() => {
    callbacks.current = { onFinal, onError };
  });

  const listen = useCallback(
    (
      Recogniser: SpeechRecognitionConstructor,
      language: string,
      local: boolean,
    ) => {
      const rec = new Recogniser();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = language;
      if (local) rec.processLocally = true;
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
        if (event.error === "network") {
          const canGoLocal = !local && recogniser()?.install !== undefined;
          setPrefersLocal(canGoLocal);
          callbacks.current.onError(
            canGoLocal ? UNREACHABLE_RETRY : UNREACHABLE,
          );
          return;
        }
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
    },
    [],
  );

  const start = useCallback(() => {
    if (current.current !== null || installing.current) return;
    const Recogniser = recogniser();
    if (!Recogniser) return;
    const language = lang ?? navigator.language;

    if (!(prefersLocal() && Recogniser.install)) {
      listen(Recogniser, language, false);
      return;
    }

    // Inside the tap, because fetching the model needs the gesture. When it
    // is already installed this resolves at once.
    const install = ++installs.current;
    installing.current = true;
    setState("starting");
    const settle = (ok: boolean) => {
      if (installs.current !== install) return;
      installing.current = false;
      if (ok) {
        listen(Recogniser, language, true);
        return;
      }
      // Next tap tries the service again; the network may have come back.
      setPrefersLocal(false);
      setState("idle");
      callbacks.current.onError(NO_LOCAL_MODEL);
    };
    Recogniser.install({ langs: [language], processLocally: true }).then(
      settle,
      () => settle(false),
    );
  }, [lang, listen]);

  /** Drops an on-device install still in flight. True if there was one. */
  const cancelInstall = useCallback(() => {
    if (!installing.current) return false;
    installing.current = false;
    installs.current++;
    setState("idle");
    return true;
  }, []);

  const stop = useCallback(() => {
    if (cancelInstall()) return;
    const rec = current.current;
    if (rec === null) return;
    setState("stopping");
    rec.stop();
  }, [cancelInstall]);

  const abort = useCallback(() => {
    if (cancelInstall()) return;
    const rec = current.current;
    if (rec === null) return;
    discarding.current = true;
    rec.abort();
  }, [cancelInstall]);

  useEffect(
    () => () => {
      installs.current++;
      current.current?.abort();
      current.current = null;
    },
    [],
  );

  return { supported, state, interim, start, stop, abort };
}
