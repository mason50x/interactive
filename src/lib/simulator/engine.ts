/**
 * The Game Boy core, wrapped.
 *
 * The runtime under `public/simulator/core/` is a WebAssembly build of an
 * emulator with a C ABI; this class is the whole of what the app knows
 * about it. It loads the module once, feeds it a program and a canvas,
 * pumps frames and audio, maps keys to the joypad, and reads and writes
 * the two blobs progress is made of: the machine state and the cartridge's
 * own RAM. Nothing outside this file calls an exported symbol by name.
 */
import type { Input } from "./types";
import { ENGINE_BUILD, STATE_BYTES } from "./progress";
type FunctionName =
  | "_malloc"
  | "_emulator_new_simple"
  | "_emulator_delete"
  | "_joypad_new"
  | "_joypad_delete"
  | "_emulator_set_default_joypad_callback"
  | "_state_file_data_new"
  | "_ext_ram_file_data_new"
  | "_get_file_data_ptr"
  | "_get_file_data_size"
  | "_file_data_delete"
  | "_emulator_write_state"
  | "_emulator_read_state"
  | "_emulator_write_ext_ram"
  | "_emulator_get_ticks_f64"
  | "_emulator_run_until_f64"
  | "_emulator_was_ext_ram_updated"
  | "_get_frame_buffer_ptr"
  | "_get_audio_buffer_ptr"
  | "_emulator_set_builtin_palette"
  | `_set_joyp_${Input}`;
type Module = { HEAPU8: Uint8Array } & Record<
  FunctionName,
  (...args: number[]) => number
>;
type Factory = (options: {
  locateFile: (path: string) => string;
}) => Promise<Module>;
declare global {
  interface Window {
    Binjgb?: Factory;
  }
}
let loader: Promise<Factory> | undefined;
function loadFactory() {
  return (loader ??= new Promise<Factory>((resolve, reject) => {
    if (window.Binjgb) {
      resolve(window.Binjgb);
      return;
    }
    const script = document.createElement("script");
    script.src = `/simulator/core/${ENGINE_BUILD}/runtime.js`;
    script.onload = () =>
      window.Binjgb
        ? resolve(window.Binjgb)
        : reject(new Error("Simulator could not initialize."));
    script.onerror = () => {
      script.remove();
      loader = undefined;
      reject(new Error("Simulator could not download. Try again."));
    };
    document.head.append(script);
  }));
}
export class SimulatorEngine {
  private e = 0;
  private joy = 0;
  private raf = 0;
  private last = 0;
  private audioAt = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private disposed = false;
  private joySince = 0;
  private keys = new Set<Input>();
  private gain: GainNode;
  private image: ImageData;
  private context: CanvasRenderingContext2D;
  frames = 0;
  batteryDirty = false;
  running = false;
  gamepadEnabled = false;
  private initial: ArrayBuffer | null = null;
  onError: (error: Error) => void = () => {};
  private constructor(
    private m: Module,
    private audio: AudioContext,
    canvas: HTMLCanvasElement,
    bytes: ArrayBuffer,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    this.context = context;
    this.image = context.createImageData(160, 144);
    this.gain = audio.createGain();
    this.gain.connect(audio.destination);
    const p = m._malloc(bytes.byteLength);
    m.HEAPU8.set(new Uint8Array(bytes), p);
    // The native emulator takes ownership of p and frees it on deletion, including init failure.
    this.e = m._emulator_new_simple(
      p,
      bytes.byteLength,
      audio.sampleRate,
      2048,
      2,
    );
    if (!this.e) throw new Error("The simulator cannot run this file.");
    this.joy = m._joypad_new();
    m._emulator_set_default_joypad_callback(this.e, this.joy);
    m._emulator_set_builtin_palette(this.e, 79);
  }
  static async create(
    canvas: HTMLCanvasElement,
    bytes: ArrayBuffer,
    volume: number,
    audio = new AudioContext(),
  ) {
    // Create/resume in the gesture before the first await (required on mobile).
    void audio.resume();
    try {
      const factory = await loadFactory();
      const m = await factory({
        locateFile: () => `/simulator/core/${ENGINE_BUILD}/runtime.wasm`,
      });
      const engine = new SimulatorEngine(m, audio, canvas, bytes);
      engine.setVolume(volume);
      engine.initial = engine.capture().checkpoint;
      return engine;
    } catch (error) {
      void audio.close();
      throw error;
    }
  }
  setVolume(value: number) {
    this.gain.gain.value = value;
  }
  input(key: Input, down: boolean) {
    if (down) this.keys.add(key);
    else this.keys.delete(key);
    this.applyInputs();
  }
  release() {
    this.keys.clear();
    for (const key of [
      "up",
      "down",
      "left",
      "right",
      "A",
      "B",
      "start",
      "select",
    ] as Input[])
      this.m[`_set_joyp_${key}`](this.e, 0);
  }
  private applyInputs() {
    const held = new Set(this.keys);
    if (this.gamepadEnabled) {
      for (const pad of navigator.getGamepads?.() ?? []) {
        if (!pad || pad.mapping !== "standard") continue;
        const bindings: [number, Input][] = [
          [0, "A"],
          [1, "B"],
          [8, "select"],
          [9, "start"],
          [12, "up"],
          [13, "down"],
          [14, "left"],
          [15, "right"],
        ];
        for (const [i, key] of bindings)
          if (pad.buttons[i]?.pressed) held.add(key);
        if (pad.axes[0] < -0.4) held.add("left");
        if (pad.axes[0] > 0.4) held.add("right");
        if (pad.axes[1] < -0.4) held.add("up");
        if (pad.axes[1] > 0.4) held.add("down");
      }
    }
    for (const key of [
      "up",
      "down",
      "left",
      "right",
      "A",
      "B",
      "start",
      "select",
    ] as Input[])
      this.m[`_set_joyp_${key}`](this.e, held.has(key) ? 1 : 0);
  }
  resume() {
    if (this.disposed || this.running) return;
    this.running = true;
    this.last = 0;
    this.audioAt = 0;
    void this.audio.resume();
    this.raf = requestAnimationFrame(this.tick);
  }
  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.release();
    for (const s of this.sources) s.stop();
    this.sources.clear();
    this.audioAt = 0;
    void this.audio.suspend();
  }
  private tick = (ms: number) => {
    if (!this.running) return;
    try {
      this.applyInputs();
      const dt = this.last ? Math.min((ms - this.last) / 1000, 0.05) : 1 / 60;
      this.last = ms;
      const until = this.m._emulator_get_ticks_f64(this.e) + dt * 4194304;
      for (let i = 0; i < 1000; i++) {
        const event = this.m._emulator_run_until_f64(this.e, until);
        if (event & 1) {
          this.frames++;
          this.draw();
        }
        if (event & 2) this.pushAudio();
        if (event & 4) break;
      }
      if (this.m._emulator_was_ext_ram_updated(this.e))
        this.batteryDirty = true;
      // The upstream input callback logs changes; bound its memory without keeping rewind history.
      if (ms - this.joySince > 10000) {
        const old = this.joy;
        this.joy = this.m._joypad_new();
        this.m._emulator_set_default_joypad_callback(this.e, this.joy);
        this.m._joypad_delete(old);
        this.joySince = ms;
      }
      this.raf = requestAnimationFrame(this.tick);
    } catch (error) {
      this.pause();
      this.onError(
        error instanceof Error
          ? error
          : new Error("The simulation stopped unexpectedly."),
      );
    }
  };
  private draw() {
    const p = this.m._get_frame_buffer_ptr(this.e);
    this.image.data.set(this.m.HEAPU8.subarray(p, p + 160 * 144 * 4));
    this.context.putImageData(this.image, 0, 0);
  }
  private pushAudio() {
    if (this.audio.state !== "running") return;
    const now = this.audio.currentTime;
    if (this.audioAt < now || this.audioAt > now + 0.3)
      this.audioAt = now + 0.04;
    const b = this.audio.createBuffer(2, 2048, this.audio.sampleRate),
      p = this.m._get_audio_buffer_ptr(this.e);
    for (let c = 0; c < 2; c++) {
      const data = b.getChannelData(c);
      for (let i = 0; i < 2048; i++)
        data[i] = this.m.HEAPU8[p + i * 2 + c] / 255;
    }
    const s = this.audio.createBufferSource();
    s.buffer = b;
    s.connect(this.gain);
    s.onended = () => {
      this.sources.delete(s);
      s.disconnect();
    };
    this.sources.add(s);
    s.start(this.audioAt);
    this.audioAt += 2048 / this.audio.sampleRate;
  }
  private file(
    kind: "state" | "battery",
    callback: (ptr: number, view: Uint8Array) => ArrayBuffer | void,
  ) {
    const ptr =
      kind === "state"
        ? this.m._state_file_data_new(this.e)
        : this.m._ext_ram_file_data_new(this.e);
    try {
      return callback(
        ptr,
        this.m.HEAPU8.subarray(
          this.m._get_file_data_ptr(ptr),
          this.m._get_file_data_ptr(ptr) + this.m._get_file_data_size(ptr),
        ),
      );
    } finally {
      this.m._file_data_delete(ptr);
    }
  }
  capture() {
    const checkpoint = this.file("state", (p, view) => {
      if (
        view.length !== STATE_BYTES ||
        this.m._emulator_write_state(this.e, p) !== 0
      )
        throw new Error("Progress capture failed.");
      return new Uint8Array(view).buffer;
    })!;
    const battery = this.file("battery", (p, view) => {
      if (this.m._emulator_write_ext_ram(this.e, p) !== 0)
        throw new Error("Battery capture failed.");
      return new Uint8Array(view).buffer;
    })!;
    this.batteryDirty = false;
    return { checkpoint, battery };
  }
  restore(checkpoint: ArrayBuffer) {
    this.file("state", (p, view) => {
      if (checkpoint.byteLength !== view.length)
        throw new Error("Incompatible progress.");
      view.set(new Uint8Array(checkpoint));
      if (this.m._emulator_read_state(this.e, p) !== 0)
        throw new Error("Progress could not be restored.");
    });
    this.last = 0;
    this.audioAt = 0;
    this.release();
  }
  restart() {
    if (this.initial) this.restore(this.initial);
  }
  dispose() {
    if (this.disposed) return;
    this.pause();
    this.m._joypad_delete(this.joy);
    this.m._emulator_delete(this.e);
    this.gain.disconnect();
    void this.audio.close();
    this.disposed = true;
  }
}
