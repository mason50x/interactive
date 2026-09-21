"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function TimeoutConsole() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.timeouts.users,
    {},
    { initialNumItems: 50 },
  );
  const setTimeout = useMutation(api.timeouts.set);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const target = results.find((user) => user.clerkId === selected);
  const duration = Number(minutes);
  const filtered = results.filter((user) =>
    `${user.label} ${user.username ?? ""} ${user.clerkId}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  async function save(enabled: boolean) {
    if (!target?.canManage || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await setTimeout({
        clerkId: target.clerkId,
        enabled,
        ...(enabled ? { reason, durationMinutes: duration } : {}),
      });
      setNotice(
        enabled
          ? `Timeout started for ${target.label}.`
          : `Timeout turned off for ${target.label}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The timeout could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 sm:p-7">
      <h2 className="text-xl font-semibold">User timeouts</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Temporarily pause access for users below your role. Timeouts expire
        automatically and can be turned off early. Only CEOs can change
        CEO-issued timeouts.
      </p>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <Input
            aria-label="Search timeout users"
            placeholder="Search name or handle"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-border">
            {filtered.map((user) => (
              <button
                key={user.clerkId}
                type="button"
                disabled={!user.canManage || busy}
                aria-pressed={selected === user.clerkId}
                onClick={() => {
                  setSelected(user.clerkId);
                  setReason(user.timeout?.reason ?? "");
                  setNotice(null);
                  setError(null);
                }}
                className="block w-full border-b border-border p-3 text-left text-sm last:border-0 hover:bg-muted disabled:opacity-50 aria-pressed:bg-muted"
              >
                <span className="block font-medium">
                  {user.label}
                  {user.username ? ` (@${user.username})` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {user.timeout ? "Timed out" : "No active timeout"}
                  {!user.canManage ? " · Restricted" : ""}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="p-3 text-sm">
                {status === "LoadingFirstPage"
                  ? "Loading users…"
                  : "No matching users loaded."}
              </p>
            )}
          </div>
          {status === "CanLoadMore" && (
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => loadMore(50)}
            >
              Load more users
            </Button>
          )}
          {status === "LoadingMore" && <p role="status">Loading users…</p>}
        </div>
        <div className="space-y-4">
          <p className="font-medium">
            {target ? target.label : "Select a user"}
          </p>
          {target?.timeout && (
            <p className="text-sm">
              Active until {new Date(target.timeout.expiresAt).toLocaleString()}
              . Reason: {target.timeout.reason}
            </p>
          )}
          <label className="block text-sm font-medium">
            Reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              rows={3}
              disabled={busy}
              className="mt-2 block w-full rounded-lg border border-border bg-background p-3 text-foreground"
              placeholder="Explain why access is being paused"
            />
          </label>
          <label className="block text-sm font-medium">
            Duration in minutes (1–43,200)
            <Input
              className="mt-2"
              type="number"
              min={1}
              max={43200}
              step={1}
              value={minutes}
              disabled={busy}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                busy ||
                !target?.canManage ||
                !reason.trim() ||
                !Number.isInteger(duration) ||
                duration < 1 ||
                duration > 43200
              }
              onClick={() => void save(true)}
            >
              {busy
                ? "Saving…"
                : target?.timeout
                  ? "Restart timeout"
                  : "Turn timeout on"}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !target?.canManage || !target.timeout}
              onClick={() => void save(false)}
            >
              Turn timeout off
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
