// Test-only cartridge: an idle loop, with no game content or public asset.
export function createTestProgram() {
  const bytes = new Uint8Array(32768);
  bytes.set([0xc3, 0x50, 0x01], 0x100);
  bytes.set([0x18, 0xfe], 0x150);
  let sum = 0;
  for (let i = 0x134; i <= 0x14c; i++) sum = (sum - bytes[i] - 1) & 255;
  bytes[0x14d] = sum;
  return bytes;
}
