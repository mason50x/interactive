"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Animal Adventure.
 *
 * Runs on the player origin, sandboxed, with no access to the session. The
 * only thing it hands back to the app is a score, over `postMessage`, and the
 * app is free to disbelieve it — anything computed inside a frame the player
 * controls is a claim, not a fact.
 */

const CELLS = 21;
/** Milliseconds per step at the start, and the floor it accelerates toward. */
const START_INTERVAL = 130;
const MIN_INTERVAL = 70;
const SPEEDUP_PER_FRUIT = 4;
const BEST_SCORE_KEY = "animal-adventure:best";

type Point = { x: number; y: number };

type Game = {
  snake: Point[];
  direction: Point;
  /** Turns land here and are applied one per step, so a fast double-tap
   *  cannot reverse the snake into itself between two frames. */
  turns: Point[];
  fruit: Point;
  interval: number;
};

const DIRECTIONS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

const PALETTE = {
  board: "#111418",
  grid: "#1b2027",
  body: "#4ade80",
  head: "#bbf7d0",
  fruit: "#fbbf24",
};

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Uniform over the cells the snake is not occupying, so the fruit can never
 *  land under the player and the search always terminates. */
function placeFruit(snake: Point[]): Point {
  const free: Point[] = [];
  for (let y = 0; y < CELLS; y++) {
    for (let x = 0; x < CELLS; x++) {
      if (!snake.some((part) => part.x === x && part.y === y)) free.push({ x, y });
    }
  }
  return free[Math.floor(Math.random() * free.length)];
}

function newGame(): Game {
  const middle = Math.floor(CELLS / 2);
  const snake = [
    { x: middle, y: middle },
    { x: middle - 1, y: middle },
    { x: middle - 2, y: middle },
  ];
  return {
    snake,
    direction: { x: 1, y: 0 },
    turns: [],
    fruit: placeFruit(snake),
    interval: START_INTERVAL,
  };
}

/**
 * The best score, as an external store rather than React state.
 *
 * `localStorage` here is the *player* origin's, not the app's — which is the
 * separation working, and the one piece of it a player can actually see. It
 * also throws outright on the opaque origin a fully sandboxed frame gets (the
 * un-isolated fallback mode), so every access is guarded and a frame without
 * storage simply never remembers.
 */
const bestScore = {
  listeners: new Set<() => void>(),

  subscribe(listener: () => void): () => void {
    bestScore.listeners.add(listener);
    return () => bestScore.listeners.delete(listener);
  },

  /** Safe to call during render: it returns a number, so React's snapshot
   *  comparison is by value and cannot loop. */
  read(): number {
    try {
      return Number(window.localStorage.getItem(BEST_SCORE_KEY)) || 0;
    } catch {
      return 0;
    }
  },

  /** Nothing on the server has a best score to report. */
  readOnServer(): number {
    return 0;
  },

  record(score: number): void {
    if (score <= bestScore.read()) return;
    try {
      window.localStorage.setItem(BEST_SCORE_KEY, String(score));
    } catch {
      return;
    }
    for (const listener of bestScore.listeners) listener();
  },
};

export function SnakeGame({ appOrigin }: { appOrigin: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(newGame());
  const [status, setStatus] = useState<"idle" | "running" | "over">("idle");
  const [score, setScore] = useState(0);
  const best = useSyncExternalStore(
    bestScore.subscribe,
    bestScore.read,
    bestScore.readOnServer,
  );

  /** Tells the app a run finished. The app owns the session and the database;
   *  this side owns nothing and is only allowed to make the claim. */
  const reportScore = useCallback(
    (finalScore: number) => {
      if (window.parent === window) return;
      window.parent.postMessage(
        { source: "player", type: "score", slug: "animal-adventure", score: finalScore },
        appOrigin,
      );
    },
    [appOrigin],
  );

  const start = useCallback(() => {
    gameRef.current = newGame();
    setScore(0);
    setStatus("running");
  }, []);

  const steer = useCallback((next: Point) => {
    const game = gameRef.current;
    // Compare against the last queued turn rather than the live direction, or
    // two turns inside one step could still fold the snake back on itself.
    const last = game.turns.at(-1) ?? game.direction;
    if (last.x === -next.x && last.y === -next.y) return;
    if (samePoint(last, next)) return;
    game.turns.push(next);
  }, []);

  // --- input -------------------------------------------------------------

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (status !== "running") start();
        return;
      }

      const direction = DIRECTIONS[event.key] ?? DIRECTIONS[event.key.toLowerCase()];
      if (!direction) return;
      // Arrow keys scroll the frame otherwise, which drags the board around
      // underneath the player mid-run.
      event.preventDefault();
      if (status === "running") steer(direction);
      else start();
    }

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, start, steer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let origin: Point | null = null;

    function onTouchStart(event: TouchEvent) {
      const touch = event.changedTouches[0];
      origin = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchEnd(event: TouchEvent) {
      if (!origin) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      origin = null;

      // A tap, not a swipe: treat it as start/restart.
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
        if (status !== "running") start();
        return;
      }

      const direction =
        Math.abs(dx) > Math.abs(dy)
          ? { x: Math.sign(dx), y: 0 }
          : { x: 0, y: Math.sign(dy) };

      if (status === "running") steer(direction);
      else start();
    }

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [status, start, steer]);

  // --- loop --------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    let previous = performance.now();
    let sinceStep = 0;

    /** One step of the world. Returns false when the run has ended. */
    const step = (): boolean => {
      const game = gameRef.current;
      const turn = game.turns.shift();
      if (turn) game.direction = turn;

      const head = {
        x: game.snake[0].x + game.direction.x,
        y: game.snake[0].y + game.direction.y,
      };

      const offBoard =
        head.x < 0 || head.y < 0 || head.x >= CELLS || head.y >= CELLS;
      // The tail cell is about to be vacated, so moving into it is legal —
      // excluding it here is what stops a full-length snake dying on its own
      // last segment every time it turns.
      const intoSelf = game.snake
        .slice(0, -1)
        .some((part) => samePoint(part, head));
      if (offBoard || intoSelf) return false;

      game.snake.unshift(head);

      if (samePoint(head, game.fruit)) {
        game.fruit = placeFruit(game.snake);
        game.interval = Math.max(MIN_INTERVAL, game.interval - SPEEDUP_PER_FRUIT);
        setScore((current) => current + 10);
      } else {
        game.snake.pop();
      }

      return true;
    };

    const draw = () => {
      const game = gameRef.current;
      // Lay the board out in CSS pixels and let the transform below handle
      // device pixels, so the geometry never has to know about the ratio.
      const size = canvas.clientWidth;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== size * ratio) {
        canvas.width = size * ratio;
        canvas.height = size * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const cell = size / CELLS;

      context.fillStyle = PALETTE.board;
      context.fillRect(0, 0, size, size);

      context.strokeStyle = PALETTE.grid;
      context.lineWidth = 1;
      for (let i = 1; i < CELLS; i++) {
        context.beginPath();
        context.moveTo(Math.round(i * cell) + 0.5, 0);
        context.lineTo(Math.round(i * cell) + 0.5, size);
        context.moveTo(0, Math.round(i * cell) + 0.5);
        context.lineTo(size, Math.round(i * cell) + 0.5);
        context.stroke();
      }

      context.fillStyle = PALETTE.fruit;
      context.beginPath();
      context.arc(
        (game.fruit.x + 0.5) * cell,
        (game.fruit.y + 0.5) * cell,
        cell * 0.32,
        0,
        Math.PI * 2,
      );
      context.fill();

      const inset = cell * 0.1;
      game.snake.forEach((part, index) => {
        context.fillStyle = index === 0 ? PALETTE.head : PALETTE.body;
        context.beginPath();
        context.roundRect(
          part.x * cell + inset,
          part.y * cell + inset,
          cell - inset * 2,
          cell - inset * 2,
          cell * 0.28,
        );
        context.fill();
      });
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const elapsed = now - previous;
      previous = now;

      if (status === "running") {
        sinceStep += elapsed;
        // A backgrounded tab hands back one enormous delta on return. Cap the
        // catch-up so the snake does not teleport across the board.
        if (sinceStep > gameRef.current.interval * 4) {
          sinceStep = gameRef.current.interval;
        }
        while (sinceStep >= gameRef.current.interval) {
          sinceStep -= gameRef.current.interval;
          if (!step()) {
            setStatus("over");
            break;
          }
        }
      }

      draw();
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status]);

  // Runs on the transition into "over" rather than inside `step`, so a score
  // is reported exactly once per run however many steps that frame took. Both
  // calls write to systems outside React — the parent window and the player
  // origin's storage — which is why neither is a `setState`.
  useEffect(() => {
    if (status !== "over") return;
    reportScore(score);
    bestScore.record(score);
  }, [status, score, reportScore]);

  return (
    <div className="flex w-full max-w-[min(78vh,34rem)] flex-col gap-3">
      <div className="flex items-baseline justify-between font-mono text-[0.8125rem] text-white/60">
        <span>
          Score <span className="text-white">{score}</span>
        </span>
        <span>
          Best <span className="text-white">{best}</span>
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/10">
        <canvas
          ref={canvasRef}
          className="block aspect-square w-full touch-none"
          aria-label="Animal Adventure board"
        />

        {status !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#111418]/85 text-center">
            <div>
              <p className="text-lg font-semibold text-white">
                {status === "over" ? "Caught yourself" : "Animal Adventure"}
              </p>
              <p className="mt-1 text-[0.8125rem] text-white/60">
                {status === "over"
                  ? `You scored ${score}.`
                  : "Arrow keys, WASD, or swipe to steer."}
              </p>
            </div>
            <button
              type="button"
              onClick={start}
              className="rounded-full bg-white px-5 py-2 text-[0.9375rem] font-medium text-[#111418] transition-opacity hover:opacity-85"
            >
              {status === "over" ? "Play again" : "Start"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
