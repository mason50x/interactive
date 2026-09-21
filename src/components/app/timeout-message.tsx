export function TimeoutMessage({
  rayId,
  reason,
  expiresAt,
}: {
  rayId: string;
  reason: string;
  expiresAt: number;
}) {
  return (
    <div
      role="alert"
      className="fixed inset-0 z-[100] flex min-h-svh items-center justify-center overflow-y-auto bg-white p-8 text-black"
    >
      <div className="w-full max-w-xl">
        <h1 className="text-3xl font-semibold">You&apos;ve been timed out</h1>
        <p className="mt-5 leading-relaxed">
          Your access has been temporarily paused. Contact an admin for help or
          to discuss this timeout.
        </p>
        <p className="mt-5 break-words whitespace-pre-wrap">
          <strong>Reason:</strong> {reason}
        </p>
        <p className="mt-3">
          Ends:{" "}
          <time dateTime={new Date(expiresAt).toISOString()}>
            {new Date(expiresAt).toUTCString()}
          </time>
        </p>
        <p className="mt-6 text-sm text-neutral-600">
          Ray ID: <code className="break-all select-all">{rayId}</code>
        </p>
      </div>
    </div>
  );
}
