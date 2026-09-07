import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createTestProgram } from "./tests/simulator-fixture.mjs";
const root = new URL("../", import.meta.url);
const wasm = await readFile(
  new URL("public/simulator/core/c60e138/runtime.wasm", root),
);
const loader = await readFile(
  new URL("public/simulator/core/c60e138/runtime.js", root),
  "utf8",
);
const original = Buffer.from(createTestProgram());
async function core(bytes) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    WebAssembly,
    URL,
    TextDecoder,
    TextEncoder,
    setTimeout,
    clearTimeout,
    fetch: async () =>
      new Response(wasm, { headers: { "Content-Type": "application/wasm" } }),
  };
  vm.createContext(sandbox);
  vm.runInContext(loader, sandbox);
  const m = await sandbox.Binjgb({
    locateFile: () => "https://local.test/runtime.wasm",
  });
  const p = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, p);
  const e = m._emulator_new_simple(p, bytes.length, 48000, 2048, 2);
  assert.ok(e);
  const j = m._joypad_new();
  m._emulator_set_default_joypad_callback(e, j);
  return {
    m,
    e,
    dispose() {
      m._joypad_delete(j);
      m._emulator_delete(e);
    },
  };
}
function run({ m, e }, ticks = 4194304) {
  const target = m._emulator_get_ticks_f64(e) + ticks;
  for (let i = 0; i < 10000; i++) {
    if (m._emulator_run_until_f64(e, target) & 4) return;
  }
  throw Error("Engine failed to yield");
}
function state({ m, e }) {
  const f = m._state_file_data_new(e);
  assert.equal(m._emulator_write_state(e, f), 0);
  const size = m._get_file_data_size(f),
    p = m._get_file_data_ptr(f);
  const buffer = Buffer.from(m.HEAPU8.slice(p, p + size));
  m._file_data_delete(f);
  return buffer;
}
function restore({ m, e }, bytes) {
  const f = m._state_file_data_new(e);
  m.HEAPU8.set(bytes, m._get_file_data_ptr(f));
  assert.equal(m._emulator_read_state(e, f), 0);
  m._file_data_delete(f);
}
for (const color of [false, true]) {
  const bytes = Buffer.from(original);
  if (color) {
    bytes[0x143] = 0xc0;
    let h = 0;
    for (let i = 0x134; i <= 0x14c; i++) h = (h - bytes[i] - 1) & 255;
    bytes[0x14d] = h;
  }
  const first = await core(bytes);
  run(first);
  const saved = state(first);
  assert.equal(saved.length, 199608);
  assert.equal(saved.readUInt32LE(0), 1800906722);
  assert.equal(saved.includes(bytes), false);
  const ticks = first.m._emulator_get_ticks_f64(first.e);
  run(first);
  assert.ok(first.m._emulator_get_ticks_f64(first.e) > ticks);
  restore(first, saved);
  assert.equal(first.m._emulator_get_ticks_f64(first.e), ticks);
  const second = await core(bytes);
  restore(second, saved);
  assert.equal(second.m._emulator_get_ticks_f64(second.e), ticks);
  run(second);
  first.dispose();
  second.dispose();
}
// Exercise native battery exports without persisting any program bytes.
const batteryProgram = Buffer.from(original);
batteryProgram[0x147] = 3;
batteryProgram[0x149] = 2;
const b = await core(batteryProgram),
  ptr = b.m._ext_ram_file_data_new(b.e),
  size = b.m._get_file_data_size(ptr);
assert.equal(size, 8192);
b.m.HEAPU8.fill(
  0x5a,
  b.m._get_file_data_ptr(ptr),
  b.m._get_file_data_ptr(ptr) + size,
);
assert.equal(b.m._emulator_read_ext_ram(b.e, ptr), 0);
const batteryState = state(b);
assert.ok(batteryState.includes(Buffer.alloc(8192, 0x5a)));
b.m._file_data_delete(ptr);
b.dispose();
console.log(
  "Simulator engine: mono/color execution, cross-instance restore, battery state, pinned ABI and ROM exclusion passed.",
);
