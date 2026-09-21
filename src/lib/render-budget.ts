type DeviceHints = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean };
};

/** Use a smaller animation budget on small machines without guessing the OS. */
export function hasLimitedRenderBudget(device: DeviceHints): boolean {
  return (
    device.connection?.saveData === true ||
    (typeof device.deviceMemory === "number" &&
      device.deviceMemory > 0 &&
      device.deviceMemory <= 4) ||
    (typeof device.hardwareConcurrency === "number" &&
      device.hardwareConcurrency > 0 &&
      device.hardwareConcurrency <= 4)
  );
}

/** Embedded apps and players get the frame budget, including on fast machines. */
export function isPlayerRoute(pathname: string): boolean {
  return /^\/(activities|entertainment|learning-simulator|experience)\/[^/]+/.test(
    pathname,
  );
}
