/** Add back reserved but unused lease time without showing more than the allowance. */
export function availablePlaytimeSeconds(
  status: {
    remainingSeconds: number;
    allowanceSeconds: number;
    leaseUntil: number;
  },
  serverNow: number,
) {
  return Math.max(
    0,
    Math.min(
      status.allowanceSeconds,
      Math.ceil(
        status.remainingSeconds +
          Math.max(0, status.leaseUntil - serverNow) / 1000,
      ),
    ),
  );
}

export type PlaytimeDisplay = {
  remaining: number;
  allowanceSeconds: number;
  resetsAt: number;
};

/** Keep an active countdown from rising while a query catches up to a lease. */
export function stablePlaytimeSeconds(
  raw: number,
  status: { allowanceSeconds: number; resetsAt: number; leaseUntil: number },
  serverNow: number,
  previous: PlaytimeDisplay | null,
) {
  return previous &&
    previous.allowanceSeconds === status.allowanceSeconds &&
    previous.resetsAt === status.resetsAt &&
    status.leaseUntil > serverNow
    ? Math.min(raw, previous.remaining)
    : raw;
}
