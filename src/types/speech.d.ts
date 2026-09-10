/*
 * The Web Speech API, as much of it as this app touches.
 *
 * This is a global script — no `import` or `export` — so these declarations
 * merge into the DOM lib rather than sit beside it. TypeScript already ships
 * `SpeechRecognitionResult`, `SpeechRecognitionResultList` and
 * `SpeechRecognitionAlternative`; it stops short of the recogniser itself,
 * its events, and the `webkit` alias Safari and Chrome still hang it on.
 * Only those gaps are filled here. If a TypeScript bump adds them, delete
 * this file.
 *
 * The constructors are declared as optional properties of `Window` rather
 * than as `declare var`, so every call site has to go through
 * `window.SpeechRecognition ?? window.webkitSpeechRecognition` — which is the
 * feature check, and the only correct way to reach it.
 */

type SpeechRecognitionErrorCode =
  | "aborted"
  | "audio-capture"
  | "bad-grammar"
  | "language-not-supported"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed";

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult:
    ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror:
    ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
