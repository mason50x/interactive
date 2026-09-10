"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { Input } from "@/lib/simulator/types";
import { cn } from "@/lib/utils";
import styles from "./game-boy.module.css";

/**
 * The Game Boy itself: the shell drawn as SVG, the screen the caller fills,
 * and real buttons laid over the artwork where the drawn ones are.
 *
 * Every press, from wherever it comes — a key, a pointer on a drawn button,
 * a screen reader's click — is filed by its source in `held`, so a key and
 * a finger on the same button are two holds and the button stays down until
 * both let go. Pressing is only allowed while `enabled`; a release is always
 * allowed, and everything is released when the window loses focus or the
 * tab is hidden, so a key held across a tab switch is not held forever.
 *
 * The words printed on the shell — the silkscreen labels, the OFF · ON by
 * the switch, VOL. by the wheel — are the device's own, set in the case the
 * hardware prints them; they are artwork, not UI type. They are still set at
 * the type's natural spacing, as everything on the site is.
 */

const keys: Record<string, Input> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyX: "A",
  KeyZ: "B",
  Enter: "start",
  ShiftRight: "select",
};
// SVG artwork and HTML hit targets share these device-space measurements.
const deviceWidth = 400;
const deviceHeight = 660;
const actionButtons = { B: { x: 271, y: 457 }, A: { x: 331, y: 427 } };
const actionRadius = 25;
const screen = { x: 93, y: 113, width: 224, height: 201.6 };
const position = (
  x: number,
  y: number,
  width: number,
  height: number,
): CSSProperties => ({
  left: `${(x / deviceWidth) * 100}%`,
  top: `${(y / deviceHeight) * 100}%`,
  width: `${(width / deviceWidth) * 100}%`,
  height: `${(height / deviceHeight) * 100}%`,
});
const controls: { key: Input; label: string; shortcut: string }[] = [
  { key: "up", label: "Up", shortcut: "ArrowUp" },
  { key: "down", label: "Down", shortcut: "ArrowDown" },
  { key: "left", label: "Left", shortcut: "ArrowLeft" },
  { key: "right", label: "Right", shortcut: "ArrowRight" },
  { key: "B", label: "B", shortcut: "Z" },
  { key: "A", label: "A", shortcut: "X" },
  { key: "select", label: "Select", shortcut: "Shift" },
  { key: "start", label: "Start", shortcut: "Enter" },
];

export function GameBoy({
  children,
  enabled,
  powered,
  input,
  focus,
  power,
  powerDisabled,
  volume,
  setVolume,
}: {
  children: ReactNode;
  enabled: boolean;
  powered: boolean;
  input: (key: Input, down: boolean) => void;
  focus: (active: boolean) => void;
  power: () => void;
  powerDisabled: boolean;
  volume: number;
  setVolume: (value: number) => void;
}) {
  const id = useId();
  const held = useRef(new Map<string, Input>());
  const [pressed, setPressed] = useState<Set<Input>>(new Set());
  function change(source: string, key: Input, down: boolean) {
    if (down && !enabled) return;
    if (down) held.current.set(source, key);
    else held.current.delete(source);
    const next = new Set(held.current.values());
    input(key, next.has(key));
    setPressed(next);
  }
  function release() {
    for (const key of new Set(held.current.values())) input(key, false);
    held.current.clear();
    setPressed(new Set());
  }
  const releaseFromEffect = useEffectEvent(release);
  useEffect(() => {
    const clear = () => releaseFromEffect();
    const hidden = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!enabled)
      queueMicrotask(() => {
        if (!cancelled) releaseFromEffect();
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return (
    <div
      className={styles.device}
      role="group"
      aria-label="Game Boy controls"
      onFocus={() => focus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          focus(false);
          release();
        }
      }}
      onKeyDown={(e) => {
        if (
          e.metaKey ||
          e.ctrlKey ||
          e.altKey ||
          e.target instanceof HTMLInputElement
        )
          return;
        const key = keys[e.code];
        // Enter activates the focused hardware button; on the screen it is Start.
        if (e.code === "Enter" && e.target instanceof HTMLButtonElement) return;
        if (key) {
          e.preventDefault();
          if (!e.repeat) change(`key:${e.code}`, key, true);
        }
      }}
      onKeyUp={(e) => {
        const key = keys[e.code];
        if (key && held.current.has(`key:${e.code}`)) {
          e.preventDefault();
          change(`key:${e.code}`, key, false);
        }
      }}
    >
      <svg
        className={styles.shell}
        viewBox="0 0 400 660"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={`${id}-body`}
            x1="20"
            y1="20"
            x2="380"
            y2="650"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#e4e2dc" />
            <stop offset=".45" stopColor="#d4d2cc" />
            <stop offset="1" stopColor="#b6b5b0" />
          </linearGradient>
          <linearGradient
            id={`${id}-bezel`}
            x1="30"
            y1="65"
            x2="360"
            y2="330"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#85858d" />
            <stop offset="1" stopColor="#66666e" />
          </linearGradient>
          <linearGradient id={`${id}-pad`} x2="1" y2="1">
            <stop stopColor="#393a3d" />
            <stop offset="1" stopColor="#17181a" />
          </linearGradient>
        </defs>
        <path
          d="M30 12H370Q393 12 393 36V578Q393 650 320 654H30Q8 654 8 629V37Q8 12 30 12Z"
          fill="#999995"
        />
        <path
          d="M30 5H368Q390 5 390 30V572Q390 642 319 646H30Q5 646 5 622V31Q5 5 30 5Z"
          fill={`url(#${id}-body)`}
          stroke="#adada8"
          strokeWidth="2"
        />
        <path
          d="M10 41H386M38 7V40M360 7V40"
          stroke="#aaa9a5"
          strokeWidth="3"
        />
        <path d="M11 44H385" stroke="#f1eee7" strokeOpacity=".7" />
        <path
          d="M44 64H350Q365 64 365 79V289Q365 328 328 328H44Q28 328 28 312V80Q28 64 44 64Z"
          fill={`url(#${id}-bezel)`}
          stroke="#5d5d63"
          strokeWidth="2"
        />
        <path d="M41 83H103M311 83H352" stroke="#762749" strokeWidth="3" />
        <path d="M41 90H103M311 90H352" stroke="#303660" strokeWidth="3" />
        <text
          x="111"
          y="91"
          fill="#d8d7dc"
          fontFamily="Arial, sans-serif"
          fontSize="9"
        >
          DOT MATRIX WITH STEREO SOUND
        </text>
        <rect
          x={screen.x - 5}
          y={screen.y - 5}
          width={screen.width + 10}
          height={screen.height + 10}
          rx="2"
          fill="#454837"
        />
        <circle cx="51" cy="163" r="5" fill={powered ? "#f65343" : "#582a2c"} />
        {powered && <circle cx="50" cy="162" r="2" fill="#ffb7a1" />}
        <text
          x="35"
          y="183"
          fill="#dedde0"
          fontFamily="Arial, sans-serif"
          fontSize="7"
        >
          BATTERY
        </text>
        <text
          x="29"
          y="359"
          fill="#30345c"
          fontFamily="Arial, sans-serif"
          fontWeight="700"
          fontSize="16"
        >
          Nintendo
        </text>
        <text
          x="105"
          y="360"
          fill="#30345c"
          fontFamily="Arial, sans-serif"
          fontStyle="italic"
          fontSize="27"
        >
          GAME BOY
        </text>
        <text
          x="247"
          y="350"
          fill="#30345c"
          fontFamily="Arial, sans-serif"
          fontSize="8"
        >
          ™
        </text>
        <circle cx="92" cy="452" r="62" fill="#bcbcb7" fillOpacity=".45" />
        <path
          d="M71 399H113V431H145V473H113V505H71V473H39V431H71Z"
          fill="#92928e"
        />
        <path
          d="M74 402H110V434H142V470H110V502H74V470H42V434H74Z"
          fill={`url(#${id}-pad)`}
          stroke="#111214"
          strokeWidth="2"
        />
        <circle
          cx="92"
          cy="452"
          r="13"
          fill="#242527"
          stroke="#3e3f40"
          strokeWidth="2"
        />
        <path
          d="M83 424H101M83 418H101M83 412H101M51 443V461M57 443V461M63 443V461M123 443V461M129 443V461M135 443V461M83 480H101M83 486H101M83 492H101"
          stroke="#48494a"
          strokeWidth="2"
        />
        <path
          d={`M${actionButtons.B.x} ${actionButtons.B.y}L${actionButtons.A.x} ${actionButtons.A.y}`}
          stroke="#d5d2cc"
          strokeWidth="70"
          strokeLinecap="round"
        />
        <path
          d={`M${actionButtons.B.x} ${actionButtons.B.y}L${actionButtons.A.x} ${actionButtons.A.y}`}
          stroke="#c0bdbb"
          strokeWidth="67"
          strokeLinecap="round"
        />
        <g
          fill="#30345c"
          fontFamily="Arial, sans-serif"
          fontWeight="700"
          fontSize="16"
          textAnchor="middle"
        >
          {Object.entries(actionButtons).map(([name, { x, y }]) => (
            <text
              key={name}
              x={x + 13}
              y={y + 46}
              transform={`rotate(-26 ${x + 13} ${y + 46})`}
            >
              {name}
            </text>
          ))}
        </g>
        <g
          fill="#30345c"
          fontFamily="Arial, sans-serif"
          fontWeight="700"
          fontSize="10"
          textAnchor="middle"
        >
          <text x="158" y="560" transform="rotate(-26 158 560)">
            SELECT
          </text>
          <text x="225" y="560" transform="rotate(-26 225 560)">
            START
          </text>
        </g>
        <g transform="rotate(-28 302 579)" strokeLinecap="round">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i}>
              <path
                d={`M${257 + i * 18} 552v54`}
                stroke="#e6e3dc"
                strokeWidth="9"
              />
              <path
                d={`M${255 + i * 18} 550v54`}
                stroke="#858580"
                strokeWidth="7"
              />
              <path
                d={`M${256 + i * 18} 552v49`}
                stroke="#626360"
                strokeWidth="3"
              />
            </g>
          ))}
        </g>
        <text
          x="154"
          y="627"
          fill="#93938d"
          fontFamily="Arial, sans-serif"
          fontSize="9"
        >
          PHONES
        </text>
        <path d="M180 634v9m5-9v9m5-9v9" stroke="#92938c" strokeWidth="2" />
      </svg>
      <button
        className={styles.power}
        onClick={power}
        disabled={powerDisabled}
        aria-label={powered ? "Pause game" : "Power on or resume game"}
        aria-pressed={powered}
        title="Power · pause / resume"
      >
        <span data-on={powered} />
        {/* Silkscreen beside the switch, as printed on the device. */}
        <span>OFF · ON</span>
      </button>
      <div
        className={styles.screen}
        style={position(screen.x, screen.y, screen.width, screen.height)}
      >
        {children}
      </div>
      {controls.map(({ key, label, shortcut }) => (
        <button
          key={key}
          type="button"
          className={cn(styles.hardware, styles[key])}
          style={
            key === "A" || key === "B"
              ? position(
                  actionButtons[key].x - actionRadius,
                  actionButtons[key].y - actionRadius,
                  actionRadius * 2,
                  actionRadius * 2,
                )
              : undefined
          }
          aria-label={label}
          aria-keyshortcuts={shortcut}
          aria-pressed={pressed.has(key)}
          title={`${label} · ${shortcut}`}
          disabled={!enabled}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.focus({ preventScroll: true });
            e.currentTarget.setPointerCapture(e.pointerId);
            change(`pointer:${e.pointerId}`, key, true);
          }}
          onPointerUp={(e) => change(`pointer:${e.pointerId}`, key, false)}
          onPointerCancel={(e) => change(`pointer:${e.pointerId}`, key, false)}
          onLostPointerCapture={(e) =>
            change(`pointer:${e.pointerId}`, key, false)
          }
          onKeyDown={(e) => {
            if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
              e.preventDefault();
              e.stopPropagation();
              change(`button:${key}`, key, true);
            }
          }}
          onKeyUp={(e) => {
            if (e.code === "Space" || e.code === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              change(`button:${key}`, key, false);
            }
          }}
          onClick={(e) => {
            if (e.detail === 0 && !held.current.has(`button:${key}`)) {
              change(`assistive:${key}`, key, true);
              window.setTimeout(
                () => change(`assistive:${key}`, key, false),
                80,
              );
            }
          }}
        />
      ))}
      <label className={styles.volume} title="Volume">
        {/* Silkscreen beside the wheel, as printed on the device. */}
        <span>VOL.</span>
        <input
          aria-label="Volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
