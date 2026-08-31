/**
 * The weather where the visitor actually is.
 *
 * ## Why the browser and not the edge
 *
 * Vercel resolves the client IP against a geo database and hands the answer
 * over as request headers, which costs nothing and needs no permission. It is
 * also wrong often enough to matter: an IP places you at your carrier's
 * gateway or your VPN's exit, which can be a different city and occasionally a
 * different country. A weather card that confidently reports somewhere you are
 * not is worse than one that has to ask, so this asks.
 *
 * The ask is deliberately not on page load. `navigator.geolocation` prompts
 * the moment it is called, and a permission dialog aimed at someone who came
 * here to open one thing is exactly the wrong first impression — so the card
 * offers a button, and only a press calls it. Once granted, the browser
 * remembers, and every later visit resolves without a prompt.
 *
 * ## Two calls, no keys
 *
 * Open-Meteo gives the forecast and BigDataCloud reverse-geocodes the
 * coordinates into a place name. Both are free, keyless, and CORS-enabled, so
 * both are called straight from the browser — which also means the
 * coordinates never reach this app's server, and there is nothing here that
 * could log them.
 *
 * Answers are cached in `localStorage` against rounded coordinates, so moving
 * between pages inside the app does not re-fetch, and a card that has been
 * seen once paints from cache before the network is touched.
 */

/** Coarse enough that ordinary movement around a city is one cache entry, and
 *  fine enough that it is still your city. Roughly a kilometre. */
const COORD_PRECISION = 2;

/** Weather changes slowly and the card is glanceable, not operational. */
const MAX_AGE_MS = 15 * 60_000;

/** A forecast that has not arrived in this long is not worth waiting for. */
const TIMEOUT_MS = 6_000;

const CACHE_KEY = "50x:weather";

export type WeatherKind =
  | "clear"
  | "partly"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm";

export type Weather = {
  /** Where this is the weather for, as the reverse lookup named it. */
  city: string;
  /** Already rounded, in `unit`. */
  temperature: number;
  /** What it feels like, which is the number people actually dress by. */
  apparent: number;
  high: number;
  low: number;
  unit: "C" | "F";
  kind: WeatherKind;
  /** A short human phrase for the code — "Light rain", "Overcast". */
  description: string;
  /** Drives the glyph, which has a night cut for the two clear-ish kinds. */
  isDay: boolean;
};

/**
 * The three countries that still read temperature in Fahrenheit.
 *
 * A unit is not a preference the app collects, and taking it from the same
 * lookup that already named the city is both free and right nearly always.
 * Everywhere else gets Celsius, including the several countries that use
 * Fahrenheit alongside it — Celsius is the one they will not misread.
 */
const FAHRENHEIT_COUNTRIES = new Set(["US", "LR", "MM"]);

/** WMO code to the glyph it draws and the words under it. */
const CODES: Record<number, { kind: WeatherKind; description: string }> = {
  0: { kind: "clear", description: "Clear" },
  1: { kind: "clear", description: "Mostly clear" },
  2: { kind: "partly", description: "Partly cloudy" },
  3: { kind: "cloudy", description: "Overcast" },
  45: { kind: "fog", description: "Fog" },
  48: { kind: "fog", description: "Freezing fog" },
  51: { kind: "drizzle", description: "Light drizzle" },
  53: { kind: "drizzle", description: "Drizzle" },
  55: { kind: "drizzle", description: "Heavy drizzle" },
  56: { kind: "drizzle", description: "Freezing drizzle" },
  57: { kind: "drizzle", description: "Freezing drizzle" },
  61: { kind: "rain", description: "Light rain" },
  63: { kind: "rain", description: "Rain" },
  65: { kind: "rain", description: "Heavy rain" },
  66: { kind: "rain", description: "Freezing rain" },
  67: { kind: "rain", description: "Freezing rain" },
  71: { kind: "snow", description: "Light snow" },
  73: { kind: "snow", description: "Snow" },
  75: { kind: "snow", description: "Heavy snow" },
  77: { kind: "snow", description: "Snow grains" },
  80: { kind: "rain", description: "Light showers" },
  81: { kind: "rain", description: "Showers" },
  82: { kind: "rain", description: "Heavy showers" },
  85: { kind: "snow", description: "Snow showers" },
  86: { kind: "snow", description: "Snow showers" },
  95: { kind: "storm", description: "Thunderstorm" },
  96: { kind: "storm", description: "Thunderstorm" },
  99: { kind: "storm", description: "Thunderstorm, hail" },
};

/** Anything not in the table is still weather, and overcast is the safest
 *  thing to draw for a code we have not seen. */
const UNKNOWN = { kind: "cloudy" as const, description: "Cloudy" };

/**
 * The browser's own answer to where you are.
 *
 * Prompts on the first call and resolves silently on every later one, which is
 * why the caller only reaches this from a button press or from a permission
 * already known to be granted.
 *
 * `enableHighAccuracy` is off deliberately. It wakes the GPS to place you
 * within metres, and this is picking a city — the coarse fix is faster, costs
 * no battery, and gets rounded to a kilometre a moment later anyway.
 */
export function currentPosition(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("No geolocation in this browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      reject,
      {
        enableHighAccuracy: false,
        timeout: TIMEOUT_MS,
        // A fix from the last quarter hour is the same city as a fresh one.
        maximumAge: MAX_AGE_MS,
      },
    );
  });
}

/**
 * Whether the browser will answer without prompting.
 *
 * `null` when the Permissions API cannot say — Safari has no `geolocation`
 * entry for it — which the caller treats as "ask first", the same as an
 * outright `prompt`. Getting this wrong in that direction costs a button
 * press; getting it wrong the other way fires a dialog nobody asked for.
 */
export async function geolocationPermission(): Promise<
  PermissionState | null
> {
  if (typeof navigator === "undefined" || !navigator.permissions) return null;
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return null;
  }
}

type Place = { city: string; country: string };

/**
 * Coordinates to a place name.
 *
 * BigDataCloud's client endpoint, which is free, keyless, and meant to be
 * called from a browser. It is the one thing on this card that is not
 * Open-Meteo, because Open-Meteo's geocoder only searches forwards — name to
 * coordinates — and this needs the other direction.
 *
 * A failure is not fatal: the forecast is the content and the place name is
 * the label on it, so a lookup that does not answer leaves the card saying
 * "Your location" rather than nothing at all.
 */
async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<Place> {
  const url = new URL(
    "https://api.bigdatacloud.net/data/reverse-geocode-client",
  );
  url.searchParams.set("latitude", `${latitude}`);
  url.searchParams.set("longitude", `${longitude}`);
  url.searchParams.set("localityLanguage", "en");

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { city: "Your location", country: "" };

    const data = (await response.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryCode?: string;
    };

    // `city` is empty for a lot of the world, where the useful name is the
    // locality; the region is the last resort before giving up on a name.
    const name =
      data.city || data.locality || data.principalSubdivision || "";

    return {
      city: name || "Your location",
      country: (data.countryCode ?? "").toUpperCase(),
    };
  } catch {
    return { city: "Your location", country: "" };
  }
}

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    is_day?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
};

/**
 * The forecast for a point, or `null` for every way it can fail.
 *
 * There is one caller and it is a card that is decoration on a page about
 * something else, so a timeout, a rate limit, a shape change upstream and a
 * network error all mean the same thing here: draw the card without a number
 * in it. Nothing is retried and nothing is logged loudly, because there is no
 * action anyone would take on the report.
 */
export async function fetchWeather(
  latitude: number,
  longitude: number,
): Promise<Weather | null> {
  // Rounded before either call, so the pair is cached against one key and
  // neither service is told more about where you are than it needs.
  const lat = Number(latitude.toFixed(COORD_PRECISION));
  const lon = Number(longitude.toFixed(COORD_PRECISION));

  const cached = readCache(lat, lon);
  if (cached) return cached;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", `${lat}`);
  url.searchParams.set("longitude", `${lon}`);
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,is_day,weather_code",
  );
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  // Together rather than in series: the name and the numbers are independent,
  // and the card needs both before it can draw.
  const [place, response] = await Promise.all([
    reverseGeocode(lat, lon),
    fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null),
  ]);

  if (!response?.ok) return null;

  const unit: "C" | "F" = FAHRENHEIT_COUNTRIES.has(place.country) ? "F" : "C";

  try {
    const data = (await response.json()) as OpenMeteoResponse;
    const current = data.current;
    if (!current || typeof current.temperature_2m !== "number") return null;

    const code = CODES[current.weather_code ?? -1] ?? UNKNOWN;
    const high = data.daily?.temperature_2m_max?.[0];
    const low = data.daily?.temperature_2m_min?.[0];

    // Open-Meteo answers in Celsius and the conversion is one function, so
    // the unit is applied here rather than asked for — that way a cached
    // entry does not have to be refetched if the unit ever changes.
    const convert = (value: number) =>
      Math.round(unit === "F" ? value * 1.8 + 32 : value);

    const weather: Weather = {
      city: place.city,
      temperature: convert(current.temperature_2m),
      apparent: convert(current.apparent_temperature ?? current.temperature_2m),
      high: convert(high ?? current.temperature_2m),
      low: convert(low ?? current.temperature_2m),
      unit,
      kind: code.kind,
      description: code.description,
      // Open-Meteo sends 1/0 rather than a boolean. Absent is treated as day,
      // which is the cut of the glyph that reads on both themes.
      isDay: current.is_day !== 0,
    };

    writeCache(lat, lon, weather);
    return weather;
  } catch {
    return null;
  }
}

type Cached = { at: number; lat: number; lon: number; weather: Weather };

/**
 * The last answer, if it is recent and for the same place.
 *
 * `localStorage` and not memory, because the point is the *second* page load:
 * navigating inside the app remounts the card, and without this every one of
 * those is two network calls to draw a number that has not changed.
 *
 * Every access is guarded. Storage throws outright in a handful of real
 * situations — a browser set to block site data, Safari's private mode — and a
 * weather card is not worth taking a page down over.
 */
function readCache(lat: number, lon: number): Weather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as Cached;
    if (cached.lat !== lat || cached.lon !== lon) return null;
    if (Date.now() - cached.at > MAX_AGE_MS) return null;

    return cached.weather;
  } catch {
    return null;
  }
}

function writeCache(lat: number, lon: number, weather: Weather): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), lat, lon, weather } satisfies Cached),
    );
  } catch {
    // Full, blocked, or unavailable. The card works without a cache.
  }
}

