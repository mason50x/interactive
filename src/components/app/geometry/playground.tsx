"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import {
  FigureFrame,
  describePuzzle,
} from "@/components/app/geometry/problems";

type Started = Extract<
  FunctionReturnType<typeof api.timeoutPuzzles.start>,
  { status: "started" }
>;
type Puzzle = Started["puzzle"];
type Solution = { display: string; working: string };

type Notice =
  | { kind: "correct"; solution: Solution }
  | { kind: "wrong"; solution: Solution }
  | { kind: "late"; solution: Solution }
  | { kind: "left" }
  | { kind: "expired" };

type Run =
  | { phase: "loading" }
  | {
      phase: "playing";
      session: string;
      puzzle: Puzzle;
      /** Counts puzzles shown, so each one mounts fresh. */
      round: number;
      notice?: Notice;
    }
  | { phase: "stale" }
  | { phase: "passed"; solution: Solution }
  | { phase: "clear" };

function useSecondsLeft(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return deadline === null
    ? null
    : Math.max(0, Math.ceil((deadline - now) / 1000));
}

function NoticeBanner({ notice }: { notice: Notice }) {
  switch (notice.kind) {
    case "correct":
      return (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
          <span className="font-medium">Correct.</span> Last puzzle:{" "}
          {notice.solution.working}
        </p>
      );
    case "wrong":
      return (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">
          <span className="font-medium">
            The last one was {notice.solution.display}, so your streak starts
            over.
          </span>{" "}
          {notice.solution.working}
        </p>
      );
    case "late":
      return (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">
          <span className="font-medium">
            Too slow, it was {notice.solution.display}.
          </span>{" "}
          Your streak starts over.
        </p>
      );
    case "left":
      return (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">
          <span className="font-medium">You left the tab.</span> Your streak
          starts over with a new puzzle.
        </p>
      );
    case "expired":
      return (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">
          <span className="font-medium">Time ran out.</span> Your streak starts
          over with a new puzzle.
        </p>
      );
  }
}

function Progress({ streak, goal }: { streak: number; goal: number | null }) {
  if (goal === null)
    return (
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-neutral-500">
          Just for fun. Your timeout ends on its own.
        </span>
        <span className="font-semibold tabular-nums">
          Streak {streak}
          {streak >= 3 && <span aria-hidden="true"> 🔥</span>}
        </span>
      </div>
    );
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-neutral-500">
          Get {goal} right in a row to lift your timeout
        </span>
        <span className="font-semibold tabular-nums">
          {streak}/{goal}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Puzzles solved in a row"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={streak}
        className="mt-2 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${goal}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: goal }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-colors duration-300 ${
              i < streak ? "bg-emerald-500" : "bg-neutral-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function PuzzleCard({
  puzzle,
  pending,
  onAnswer,
  onExpire,
  onSkip,
}: {
  puzzle: Puzzle;
  pending: boolean;
  onAnswer: (guess: number) => void;
  onExpire: () => void;
  /** Only offered when nothing rides on the streak. */
  onSkip?: () => void;
}) {
  const inputId = useId();
  const problem = describePuzzle(puzzle.params);
  const [guess, setGuess] = useState("");
  const [hinted, setHinted] = useState(false);
  const secondsLeft = useSecondsLeft(puzzle.deadline);
  const expired = secondsLeft === 0;

  useEffect(() => {
    if (expired) onExpire();
  }, [expired, onExpire]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(guess.trim().replace(/[^\d.\-]/g, ""));
    if (pending || guess.trim() === "" || !Number.isFinite(value)) return;
    onAnswer(value);
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100">
        <FigureFrame description={problem.description}>
          {problem.figure}
        </FigureFrame>
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <p className="font-medium text-blue-600">{problem.topic}</p>
          {secondsLeft !== null && (
            <p
              className={`tabular-nums ${secondsLeft <= 15 ? "font-medium text-rose-600" : "text-neutral-500"}`}
            >
              {Math.floor(secondsLeft / 60)}:
              {String(secondsLeft % 60).padStart(2, "0")}
            </p>
          )}
        </div>
        <p className="mt-1.5 leading-relaxed">{problem.prompt}</p>

        <form onSubmit={submit} className="mt-4 flex items-stretch gap-2">
          <label htmlFor={inputId} className="sr-only">
            Your answer
          </label>
          <div className="flex min-w-0 flex-1 items-center rounded-lg border border-neutral-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
            <input
              id={inputId}
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder="Your answer"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 tabular-nums outline-none placeholder:text-neutral-400"
            />
            {problem.unit && (
              <span className="pr-3 text-neutral-500">{problem.unit}</span>
            )}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          >
            Check
          </button>
        </form>

        <div aria-live="polite" className="text-sm">
          {hinted && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              {problem.hint}
            </p>
          )}
        </div>
        {(!hinted || onSkip) && (
          <div className="mt-4 flex gap-4 text-sm text-neutral-500">
            {!hinted && (
              <button
                type="button"
                onClick={() => setHinted(true)}
                className="underline-offset-4 hover:text-black hover:underline"
              >
                Hint
              </button>
            )}
            {onSkip && (
              <button
                type="button"
                disabled={pending}
                onClick={onSkip}
                className="underline-offset-4 hover:text-black hover:underline"
              >
                Skip
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Work the timeout off: twenty geometry puzzles right in a row lifts it,
 * when the timeout allows a math bypass. Otherwise the puzzles are for fun.
 *
 * The server owns the streak, the timer, the answers and which mode applies
 * (`convex/timeoutPuzzles.ts`); this page only shows them. With the bypass
 * on, any page load starts a new run and leaving the tab ends the streak.
 */
export function GeometryPlayground({ mathBypass }: { mathBypass: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  const start = useMutation(api.timeoutPuzzles.start);
  const answer = useMutation(api.timeoutPuzzles.answer);
  const forfeit = useMutation(api.timeoutPuzzles.forfeit);
  const [run, setRun] = useState<Run>({ phase: "loading" });
  const [pending, setPending] = useState(false);
  const session = run.phase === "playing" ? run.session : null;
  // The server says which mode applies; the prop only covers loading.
  const counts =
    run.phase === "playing" ? run.puzzle.goal !== null : mathBypass;
  const away = useRef(false);

  const begin = useCallback(async () => {
    setRun({ phase: "loading" });
    const result = await start({});
    setRun(
      result.status === "started"
        ? {
            phase: "playing",
            session: result.session,
            puzzle: result.puzzle,
            round: 0,
          }
        : { phase: "clear" },
    );
  }, [start]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void start({}).then((result) => {
      if (cancelled) return;
      setRun(
        result.status === "started"
          ? {
              phase: "playing",
              session: result.session,
              puzzle: result.puzzle,
              round: 0,
            }
          : { phase: "clear" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, start]);

  const reset = useCallback(
    async (kind: "left" | "expired" | null) => {
      if (!session) return;
      const result = await forfeit({ session });
      setRun((current) =>
        current.phase !== "playing" || current.session !== session
          ? current
          : result.status === "stale"
            ? { phase: "stale" }
            : {
                ...current,
                puzzle: result.puzzle,
                round: current.round + 1,
                notice: kind ? { kind } : undefined,
              },
      );
    },
    [forfeit, session],
  );

  // Leaving the tab, the window or the page ends the streak. The server does
  // the resetting; a reload or a second tab also restarts from `start`.
  useEffect(() => {
    if (!session || !counts) return;
    const leave = () => {
      if (away.current) return;
      away.current = true;
      void reset("left");
    };
    const back = () => {
      if (document.visibilityState === "visible" && document.hasFocus())
        away.current = false;
    };
    const onVisibility = () =>
      document.visibilityState === "hidden" ? leave() : back();
    if (!document.hasFocus() || document.visibilityState === "hidden") leave();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", leave);
    window.addEventListener("pagehide", leave);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", leave);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("focus", back);
    };
  }, [session, counts, reset]);

  const submit = async (guess: number) => {
    if (!session) return;
    setPending(true);
    try {
      const result = await answer({ session, guess });
      if (result.status === "stale") setRun({ phase: "stale" });
      else if (result.status === "passed")
        setRun({ phase: "passed", solution: result.solution });
      else
        setRun((current) => ({
          phase: "playing",
          session,
          puzzle: result.puzzle,
          round: current.phase === "playing" ? current.round + 1 : 0,
          notice: { kind: result.status, solution: result.solution },
        }));
    } finally {
      setPending(false);
    }
  };

  // Inside the app the timeout gate swaps this screen out on its own. Pages
  // rendered on the server with the timeout baked in need a fresh load.
  useEffect(() => {
    if (run.phase !== "passed" && run.phase !== "clear") return;
    const timer = window.setTimeout(() => window.location.reload(), 2500);
    return () => window.clearTimeout(timer);
  }, [run.phase]);

  const onExpire = useCallback(() => void reset("expired"), [reset]);

  return (
    <section
      aria-labelledby="geometry-title"
      className="mx-auto w-full max-w-xl"
    >
      <header>
        <h2 id="geometry-title" className="text-xl font-semibold">
          Geometry break
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          {counts
            ? "Leaving this tab, a miss or the timer resets the streak."
            : "A few puzzles to pass the time."}
        </p>
      </header>

      {run.phase === "playing" && (
        <>
          <div className="mt-5">
            <Progress streak={run.puzzle.streak} goal={run.puzzle.goal} />
          </div>
          {run.notice && (
            <div aria-live="polite" className="mt-5 text-sm">
              <NoticeBanner notice={run.notice} />
            </div>
          )}
          <div className="mt-5">
            <PuzzleCard
              key={run.round}
              puzzle={run.puzzle}
              pending={pending}
              onAnswer={(guess) => void submit(guess)}
              onExpire={onExpire}
              onSkip={counts ? undefined : () => void reset(null)}
            />
          </div>
        </>
      )}

      {run.phase === "loading" && (
        <div className="mt-5 grid aspect-[4/3] place-items-center rounded-2xl border border-neutral-200 bg-white text-sm text-neutral-500">
          Setting up your first puzzle…
        </div>
      )}

      {run.phase === "stale" && (
        <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-6">
          <p className="leading-relaxed">
            This run was restarted in another tab or window, so it has ended
            here.
          </p>
          <button
            type="button"
            onClick={() => void begin()}
            className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Start over here
          </button>
        </div>
      )}

      {(run.phase === "passed" || run.phase === "clear") && (
        <div
          role="status"
          className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900"
        >
          <p className="text-lg font-semibold">
            {run.phase === "passed"
              ? "Streak complete. Your timeout is lifted."
              : "Your timeout has ended."}
          </p>
          {run.phase === "passed" && (
            <p className="mt-1 text-sm">Last one: {run.solution.working}</p>
          )}
          <p className="mt-2 text-sm">Taking you back…</p>
        </div>
      )}
    </section>
  );
}
