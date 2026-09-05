import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const wasm = await readFile(
  new URL("public/simulator/core/c60e138/runtime.wasm", root),
);
const loader = await readFile(
  new URL("public/simulator/core/c60e138/runtime.js", root),
  "utf8",
);
const original = await readFile(
  new URL("public/simulator/builtins/pixel-field/program.gb", root),
);
const manifest = JSON.parse(
  await readFile(new URL("convex/simulator/builtins.json", root), "utf8"),
);
assert.equal(
  createHash("sha256").update(original).digest("hex"),
  manifest[0].contentHash,
);
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

const inputTest=await core(original);
inputTest.m._emulator_set_builtin_palette(inputTest.e,79);run(inputTest);
function reachVblank(c){for(let i=0;i<160&&c.m._emulator_read_mem(c.e,0xff44)<144;i++)run(c,456);}
reachVblank(inputTest);
const startX=inputTest.m._emulator_read_mem(inputTest.e,0xfe01);
inputTest.m._set_joyp_right(inputTest.e,1);run(inputTest,419430);
inputTest.m._set_joyp_right(inputTest.e,0);run(inputTest,419430);
reachVblank(inputTest);
const movedX=inputTest.m._emulator_read_mem(inputTest.e,0xfe01);
assert.ok(movedX>startX,'Directional input moves the sample');
const inputSave=state(inputTest);const resumed=await core(original);resumed.m._emulator_set_builtin_palette(resumed.e,79);restore(resumed,inputSave);run(resumed);
reachVblank(resumed);
assert.equal(resumed.m._emulator_read_mem(resumed.e,0xfe01),movedX,'Restored position stays stable without input');
const frameHash=c=>{const p=c.m._get_frame_buffer_ptr(c.e);return createHash('sha256').update(c.m.HEAPU8.subarray(p,p+160*144*4)).digest('hex');};
assert.equal(frameHash(resumed),frameHash(inputTest),'Rendered progress survives cross-instance restore');
inputTest.dispose();resumed.dispose();
console.log('Directional input and rendered save restoration passed.');
