/**
 * The remote sound catalogue, shared by the Convex module
 * (`convex/remoteSound.ts`), the admin picker and the client listener. The
 * client cannot import from `convex/` without dragging the server runtime into
 * the browser bundle, so the list lives here.
 *
 * Every sound is drawn by the browser from oscillators and noise — see
 * `src/lib/sound-effects.ts` — so there is no media to license and nothing to
 * download. The ids are what the ping row stores; the labels are what the
 * picker shows.
 */

export const SOUND_GROUPS = [
  {
    label: "Classics",
    sounds: [
      { id: "beep", label: "Beep" },
      { id: "ding", label: "Ding" },
      { id: "doorbell", label: "Doorbell" },
      { id: "buzzer", label: "Buzzer" },
      { id: "alarm", label: "Alarm" },
      { id: "error", label: "Error" },
      { id: "honk", label: "Car horn" },
      { id: "airhorn", label: "Air horn" },
      { id: "siren", label: "Siren" },
    ],
  },
  {
    label: "Farts and burps",
    sounds: [
      { id: "fart", label: "Fart" },
      { id: "fart-long", label: "Long fart" },
      { id: "fart-squeaky", label: "Squeaky fart" },
      { id: "fart-wet", label: "Wet fart" },
      { id: "fart-machine-gun", label: "Machine-gun fart" },
      { id: "burp", label: "Burp" },
    ],
  },
  {
    label: "Booms",
    sounds: [
      { id: "boom", label: "Boom" },
      { id: "explosion", label: "Explosion" },
      { id: "bomb-drop", label: "Bomb drop" },
      { id: "thunder", label: "Thunder" },
      { id: "gong", label: "Gong" },
      { id: "drum-roll", label: "Drum roll" },
      { id: "rimshot", label: "Ba-dum-tss" },
    ],
  },
  {
    label: "Cartoon",
    sounds: [
      { id: "boing", label: "Boing" },
      { id: "slide-up", label: "Slide whistle up" },
      { id: "slide-down", label: "Slide whistle down" },
      { id: "sad-trombone", label: "Sad trombone" },
      { id: "quack", label: "Quack" },
      { id: "bubble", label: "Bubble pop" },
      { id: "whistle", label: "Whistle" },
      { id: "wolf-whistle", label: "Wolf whistle" },
      { id: "record-scratch", label: "Record scratch" },
      { id: "glass", label: "Glass break" },
      { id: "cash", label: "Cha-ching" },
    ],
  },
  {
    label: "Arcade",
    sounds: [
      { id: "laser", label: "Laser" },
      { id: "coin", label: "Coin" },
      { id: "power-up", label: "Power up" },
      { id: "tada", label: "Ta-da" },
      { id: "fanfare", label: "Fanfare" },
      { id: "ufo", label: "UFO" },
    ],
  },
  {
    label: "Annoying",
    sounds: [
      { id: "cricket", label: "Crickets" },
      { id: "mosquito", label: "Mosquito" },
      { id: "heartbeat", label: "Heartbeat" },
      { id: "spooky", label: "Spooky" },
    ],
  },
] as const;

export type SoundId = (typeof SOUND_GROUPS)[number]["sounds"][number]["id"];

export const SOUND_IDS: readonly SoundId[] = SOUND_GROUPS.flatMap((group) =>
  group.sounds.map((sound) => sound.id),
);

export function isSoundId(value: string): value is SoundId {
  return (SOUND_IDS as readonly string[]).includes(value);
}

export function soundLabel(id: string): string {
  for (const group of SOUND_GROUPS)
    for (const sound of group.sounds) if (sound.id === id) return sound.label;
  return "Beep";
}

/** What a ping with no sound written — one from before the picker — plays. */
export const DEFAULT_SOUND: SoundId = "beep";

/**
 * The volume, as a percentage of the sound's natural level. 100 is the sound
 * as designed. Above that it is boosted before a soft limiter, which is
 * louder and a little distorted — for a device someone has turned down low.
 */
export const VOLUME_MIN = 50;
export const VOLUME_DEFAULT = 100;
export const VOLUME_MAX = 200;
export const VOLUME_STEP = 10;

export function isVolume(value: number): boolean {
  return Number.isInteger(value) && value >= VOLUME_MIN && value <= VOLUME_MAX;
}

/**
 * How old a ping can be and still be played by a tab that has only just
 * subscribed. A tab opened a minute after the button was pressed should not
 * play on arrival; one that was mid-load when it was pressed should.
 */
export const REMOTE_SOUND_FRESH_MS = 15_000;
