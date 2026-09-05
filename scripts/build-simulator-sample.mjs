// Original Pixel Field sample. No upstream program or artwork is included.
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const rom = Buffer.alloc(32768);
rom.set([0xc3, 0x50, 0x01], 0x100);
rom.write("PIXEL FIELD", 0x134, "ascii");
let pc = 0x150;
const labels = new Map(),
  refs = [];
const emit = (...bytes) => {
  rom.set(bytes, pc);
  pc += bytes.length;
};
const label = (name) => labels.set(name, pc);
const jp = (name, op = 0xc3) => {
  emit(op, 0, 0);
  refs.push([pc - 2, name]);
};
const put = (addr, value) => emit(0x3e, value, 0xea, addr & 255, addr >> 8);
emit(0xf3, 0x31, 0xfe, 0xff);
label("wait");
emit(0xf0, 0x44, 0xfe, 144);
jp("wait", 0xda);
put(0xff40, 0);
// Clear background and sprite memory.
emit(0x21, 0x00, 0x80, 0x01, 0x00, 0x20);
label("clear");
emit(0xaf, 0x22, 0x0b, 0x78, 0xb1);
jp("clear", 0xc2);
emit(0x21,0x00,0xfe,0x06,160);
label("clearSprites");emit(0xaf,0x22,0x05);jp("clearSprites",0xc2);
// Tile patterns, including a dot grid and a round cursor.
const tiles = [
  Array(8).fill(0),
  [0, 0, 0, 0, 0, 0, 0, 0x01],
  [0x3c, 0x7e, 0xff, 0xff, 0xff, 0xff, 0x7e, 0x3c],
];
for (let t = 0; t < tiles.length; t++)
  for (let y = 0; y < 8; y++) {
    put(0x8000 + t * 16 + y * 2, tiles[t][y]);
    put(0x8001 + t * 16 + y * 2, tiles[t][y]);
  }
const font = {
  P: [30, 17, 17, 30, 16, 16, 16],
  I: [31, 4, 4, 4, 4, 4, 31],
  X: [17, 17, 10, 4, 10, 17, 17],
  E: [31, 16, 16, 30, 16, 16, 31],
  L: [16, 16, 16, 16, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  D: [30, 17, 17, 17, 17, 17, 30],
  M: [17, 27, 21, 21, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  A: [14, 17, 17, 31, 17, 17, 17],
  C: [14, 17, 16, 16, 16, 17, 14],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
};
const ids = {};
let ti = 3;
for (const [ch, rows] of Object.entries(font)) {
  ids[ch] = ti;
  for (let y = 0; y < 8; y++) {
    const bits = (rows[y] || 0) << 2;
    put(0x8000 + ti * 16 + y * 2, bits);
    put(0x8001 + ti * 16 + y * 2, bits);
  }
  ti++;
}
for (let y = 5; y < 15; y++)
  for (let x = 1; x < 19; x++) put(0x9800 + y * 32 + x, 1);
for (const [text, x, y] of [
  ["PIXEL FIELD", 4, 2],
  ["MOVE", 2, 16],
  ["A COLOR", 11, 16],
])
  [...text].forEach((ch, i) => put(0x9800 + y * 32 + x + i, ids[ch] || 0));
put(0xfe00, 80);
put(0xfe01, 80);
put(0xfe02, 2);
put(0xfe03, 0);
put(0xff47, 0xe4);
put(0xff48, 0xe4);
put(0xff40, 0x93);
label("frame");
emit(0xf0, 0x44, 0xfe, 144);
jp("frame", 0xd2);
label("vblank");
emit(0xf0, 0x44, 0xfe, 144);
jp("vblank", 0xda);
put(0xff00, 0x20);
emit(0xf0, 0x00, 0xf0, 0x00, 0x47);
for (const [bit, addr, delta, name] of [
  [0, 0xfe01, 1, "right"],
  [1, 0xfe01, -1, "left"],
  [2, 0xfe00, -1, "up"],
  [3, 0xfe00, 1, "down"],
]) {
  emit(0xcb, 0x40 + bit * 8);
  jp(name, 0xc2);
  emit(
    0xfa,
    addr & 255,
    addr >> 8,
    delta === 1 ? 0x3c : 0x3d,
    0xea,
    addr & 255,
    addr >> 8,
  );
  label(name);
}
put(0xff00, 0x10);
emit(0xf0, 0, 0xf0, 0, 0xe6, 1);
jp("frame", 0xc2);
emit(0xf0, 0x47, 0x07, 0xe0, 0x47);
jp("frame");
for (const [at, name] of refs) rom.writeUInt16LE(labels.get(name), at);
let checksum = 0;
for (let i = 0x134; i <= 0x14c; i++) checksum = (checksum - rom[i] - 1) & 255;
rom[0x14d] = checksum;
const hash = createHash("sha256").update(rom).digest("hex");
await writeFile(
  new URL(
    "../public/simulator/builtins/pixel-field/program.gb",
    import.meta.url,
  ),
  rom,
);
await writeFile(
  new URL("../convex/simulator/builtins.json", import.meta.url),
  JSON.stringify(
    [
      {
        id: "pixel-field",
        contentHash: hash,
        label: "Pixel Field",
        mode: "mono",
        description:
          "Explore a pocket-sized pixel canvas. Move with the arrows and change its colors with A.",
        path: "/simulator/builtins/pixel-field/program.gb",
      },
    ],
    null,
    2,
  ) + "\n",
);
console.log("Built original Pixel Field sample:", hash);
