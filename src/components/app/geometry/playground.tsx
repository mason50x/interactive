"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import {
  FigureFrame,
  GENERATORS,
  makeProblem,
  type Problem,
} from "@/components/app/geometry/problems";

type Status = "open" | "wrong" | "right" | "revealed";

function ProblemCard({
  problem,
  onSolved,
  onGiveUp,
  onNext,
}: {
  problem: Problem;
  onSolved: (firstTry: boolean) => void;
  onGiveUp: () => void;
  onNext: () => void;
}) {
  const inputId = useId();
  const [guess, setGuess] = useState("");
  const [status, setStatus] = useState<Status>("open");
  const [misses, setMisses] = useState(0);
  const [hinted, setHinted] = useState(false);
  const done = status === "right" || status === "revealed";

  const check = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (done) return onNext();
    const value = Number(guess.replace(/[^\d.\-]/g, ""));
    if (guess.trim() === "" || Number.isNaN(value)) return;
    if (Math.abs(value - problem.answer) <= (problem.tolerance ?? 0.01)) {
      setStatus("right");
      onSolved(misses === 0 && !hinted);
    } else {
      setStatus("wrong");
      setMisses((count) => count + 1);
    }
  };

  const value = Number.isInteger(problem.answer)
    ? String(problem.answer)
    : problem.answer.toFixed(1);
  const answer = !problem.unit
    ? value
    : problem.unit === "units²"
      ? `${value} ${problem.unit}`
      : `${value}${problem.unit}`;

  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100">
        <FigureFrame description={problem.description}>
          {problem.figure}
        </FigureFrame>
      </div>
      <div className="p-5 sm:p-6">
        <p className="text-sm font-medium text-blue-600">{problem.topic}</p>
        <p className="mt-1.5 leading-relaxed">{problem.prompt}</p>

        <form onSubmit={check} className="mt-4 flex items-stretch gap-2">
          <label htmlFor={inputId} className="sr-only">
            Your answer
          </label>
          <div className="flex min-w-0 flex-1 items-center rounded-lg border border-neutral-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
            <input
              id={inputId}
              value={guess}
              onChange={(event) => {
                setGuess(event.target.value);
                if (status === "wrong") setStatus("open");
              }}
              readOnly={done}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Your answer"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 tabular-nums outline-none placeholder:text-neutral-400"
            />
            {problem.unit && (
              <span className="pr-3 text-neutral-500">{problem.unit}</span>
            )}
          </div>
          <button
            type="submit"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            {done ? "Next" : "Check"}
          </button>
        </form>

        <div aria-live="polite" className="text-sm">
          {status === "wrong" && (
            <p className="mt-3 text-rose-600">Not quite. Give it another go.</p>
          )}
          {status === "right" && (
            <p className="mt-3 text-emerald-700">
              <span className="font-medium">Correct!</span> {problem.solution}
            </p>
          )}
          {status === "revealed" && (
            <p className="mt-3 text-neutral-700">
              <span className="font-medium">The answer is {answer}.</span>{" "}
              {problem.solution}
            </p>
          )}
          {hinted && !done && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              {problem.hint}
            </p>
          )}
        </div>

        {!done && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-neutral-500">
            {!hinted && (
              <button
                type="button"
                onClick={() => setHinted(true)}
                className="underline-offset-4 hover:text-black hover:underline"
              >
                Hint
              </button>
            )}
            {misses > 0 && (
              <button
                type="button"
                onClick={() => {
                  setStatus("revealed");
                  onGiveUp();
                }}
                className="underline-offset-4 hover:text-black hover:underline"
              >
                Show answer
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              className="underline-offset-4 hover:text-black hover:underline"
            >
              Skip
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Something to do while a timeout runs out: an endless deck of geometry
 * puzzles, each drawn to scale. Nothing here is saved or reported.
 */
export function GeometryPlayground() {
  // A fixed first problem keeps the server render and hydration in step;
  // everything after it is random.
  const [round, setRound] = useState({ kind: 0, seed: 1, count: 0 });
  const [solved, setSolved] = useState(0);
  const [streak, setStreak] = useState(0);
  const problem = useMemo(
    () => makeProblem(round.kind, round.seed),
    [round.kind, round.seed],
  );

  const next = () =>
    setRound((current) => ({
      kind:
        (current.kind +
          1 +
          Math.floor(Math.random() * (GENERATORS.length - 1))) %
        GENERATORS.length,
      seed: Math.floor(Math.random() * 2 ** 31),
      count: current.count + 1,
    }));

  return (
    <section
      aria-labelledby="geometry-title"
      className="mx-auto w-full max-w-xl"
    >
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2 id="geometry-title" className="text-xl font-semibold">
            Geometry break
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            A few puzzles to pass the time.
          </p>
        </div>
        <dl className="flex shrink-0 gap-4 text-right text-sm">
          <div>
            <dt className="text-neutral-500">Solved</dt>
            <dd className="font-semibold tabular-nums">{solved}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Streak</dt>
            <dd className="font-semibold tabular-nums">
              {streak}
              {streak >= 3 && <span aria-hidden="true"> 🔥</span>}
            </dd>
          </div>
        </dl>
      </header>
      <div className="mt-5">
        <ProblemCard
          key={round.count}
          problem={problem}
          onSolved={(firstTry) => {
            setSolved((count) => count + 1);
            setStreak((count) => (firstTry ? count + 1 : 0));
          }}
          onGiveUp={() => setStreak(0)}
          onNext={next}
        />
      </div>
    </section>
  );
}
