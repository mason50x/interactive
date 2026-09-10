"use client";

import { MapPinIcon } from "@heroicons/react/24/solid";
import { useCallback, useEffect, useRef, useState } from "react";
import { WeatherGlyph } from "@/components/app/weather-glyph";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  currentPosition,
  fetchWeather,
  geolocationPermission,
  type Weather,
} from "@/lib/weather";
import { cn } from "@/lib/utils";

/**
 * The weather where you are.
 *
 * The number, where it was taken, and the conditions behind it — no more than
 * that. A weather widget on a page about staying indoors is close enough to a
 * joke on its own without the card also making one.
 *
 * ## The permission is asked for once, by a button
 *
 * `navigator.geolocation` prompts the instant it is called, so calling it on
 * mount would put an operating system dialog in front of someone who came here
 * to open one thing. Instead the card checks whether the browser will answer
 * *without* prompting, and only resolves by itself if it will. Otherwise it
 * shows a button, and the press is the consent.
 *
 * That means the card has four states and all of them are the same size:
 * asking, working, answered, and declined. A card that collapsed when it had
 * nothing to say would take a column out of the row it sits in and move the
 * two cards beside it.
 */

type State =
  | { status: "checking" }
  /** The browser will prompt, so nothing happens until the button is pressed. */
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; weather: Weather }
  /** Refused, unavailable, or the lookup did not answer. */
  | { status: "unavailable"; refused: boolean };

export function WeatherCard() {
  const [state, setState] = useState<State>({ status: "checking" });

  // The card is unmounted by a navigation while a fetch is in flight often
  // enough to matter — it sits on the page people leave to go and open
  // something — and setting state after that is a warning for no benefit.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const coords = await currentPosition();
      const weather = await fetchWeather(coords.latitude, coords.longitude);
      if (!live.current) return;
      setState(
        weather
          ? { status: "ready", weather }
          : { status: "unavailable", refused: false },
      );
    } catch (error) {
      if (!live.current) return;
      // A refusal is the one failure worth wording differently: it is the
      // only one where the reader can do something about it, and the only one
      // that is not a fault.
      const refused =
        typeof GeolocationPositionError !== "undefined" &&
        error instanceof GeolocationPositionError &&
        error.code === error.PERMISSION_DENIED;
      setState({ status: "unavailable", refused });
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const permission = await geolocationPermission();
      if (!live.current) return;

      if (permission === "granted") {
        void load();
        return;
      }
      // `denied` is not shown as an error on arrival. Nobody needs to be told
      // on every page load about a decision they already made.
      setState({ status: "idle" });
    })();
  }, [load]);

  if (state.status === "ready") {
    return <Forecast weather={state.weather} />;
  }

  return (
    <Card className="flex flex-col justify-between gap-5 p-5">
      <div className="flex items-start justify-end gap-3">
        <WeatherGlyph
          kind="cloudy"
          className="size-9 shrink-0 text-border-strong"
        />
      </div>

      <div>
        <p className="text-[0.875rem] text-muted-foreground">
          {state.status === "loading"
            ? "Looking outside…"
            : state.status === "unavailable"
              ? state.refused
                ? "No location, no forecast — which settles it. Nothing out there to report on."
                : "Couldn't reach the forecast. Assume it's grey."
              : "Is it worth going outside today? One way to find out."}
        </p>

        {/* The button survives a failure on purpose: a refusal can be
            reconsidered in the browser's own controls, and a lookup that timed
            out will usually work on the second press. */}
        {state.status !== "checking" && (
          <button
            type="button"
            onClick={() => void load()}
            disabled={state.status === "loading"}
            className={cn(
              "mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[0.8125rem]",
              "bg-surface text-foreground transition-colors hover:bg-surface-muted",
              "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {state.status === "loading" ? (
              <Spinner className="size-3.5" />
            ) : (
              <MapPinIcon className="size-3.5 text-faint" />
            )}
            {state.status === "unavailable" ? "Try again" : "Use my location"}
          </button>
        )}
      </div>
    </Card>
  );
}

function Forecast({ weather }: { weather: Weather }) {
  return (
    // The sun and the lightning are the one warm thing on the card, and the
    // token is the streak's fire rather than a second orange invented for this
    // — see `--fire` in globals.css. A cloud stays the page's own ink.
    //
    // Set as a class rather than inline, because `Card` takes a `className`
    // and not a `style`, and a custom property is a thing Tailwind can carry.
    <Card className="flex flex-col justify-between gap-5 p-5 [--glyph-warm:var(--fire)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1">
            <span className="text-[2.75rem] leading-none font-semibold text-foreground tabular-nums">
              {weather.temperature}
            </span>
            <span className="text-[0.875rem] text-muted-foreground">
              °{weather.unit}
            </span>
          </p>
          <p className="label-small mt-1.5 flex items-center gap-1 text-faint">
            <MapPinIcon className="size-3 shrink-0" />
            <span className="truncate">{weather.city}</span>
          </p>
        </div>

        <WeatherGlyph
          kind={weather.kind}
          isDay={weather.isDay}
          className="size-11 shrink-0 text-muted-foreground"
        />
      </div>

      <div>
        <p className="text-[0.875rem] text-foreground">{weather.description}</p>
        <p className="label-small mt-1 text-faint">
          Feels like {weather.apparent}° · {weather.low}° to {weather.high}°
        </p>
      </div>
    </Card>
  );
}
