/**
 * A tab's shape while its rows are on their way: the title line, then a
 * card of three rows with a control on the right. The frame around it — the
 * search box and the tabs — is the layout's and stays put, so switching tabs
 * moves only the column that is actually changing. Usually unseen: tabs are
 * warmed ahead of the click (see `SettingsShell`), and this is the beat in
 * between when one is not.
 */
export default function SettingsSectionLoading() {
  return (
    <div
      role="status"
      aria-label="Loading settings"
      className="flex flex-col motion-safe:animate-pulse"
    >
      <div aria-hidden className="mb-6 h-7 w-40 rounded-md bg-foreground/5" />
      <div
        aria-hidden
        className="divide-y divide-border border-y border-border"
      >
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="flex items-center justify-between gap-6 py-4"
          >
            <div className="flex flex-col gap-2">
              <div className="h-3.5 w-36 rounded bg-foreground/5" />
              <div className="h-3 w-56 max-w-[60vw] rounded bg-foreground/5" />
            </div>
            <div className="h-6 w-11 shrink-0 rounded-full bg-foreground/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
