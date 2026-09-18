"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircleIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, InputAddon, InputGroup } from "@/components/ui/input";

type QuotaKind = "experience" | "bot";

export function QuotaConsole() {
  const access = useQuery(api.adminQuotas.access, {});
  const users = useQuery(api.adminQuotas.users, access === true ? {} : "skip");
  const reset = useMutation(api.adminQuotas.reset);
  const [scope, setScope] = useState<"global" | "user">("global");
  const [selectedUser, setSelectedUser] = useState("");
  const [search, setSearch] = useState("");
  const [quotas, setQuotas] = useState<QuotaKind[]>(["experience", "bot"]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users ?? [];
    return (users ?? []).filter((user) =>
      [user.name, user.username, user.email, user.clerkId].some((value) =>
        value?.toLowerCase().includes(term),
      ),
    );
  }, [search, users]);

  function toggleQuota(quota: QuotaKind) {
    setNotice(null);
    setQuotas((current) =>
      current.includes(quota)
        ? current.filter((item) => item !== quota)
        : [...current, quota],
    );
  }

  async function submit() {
    if (quotas.length === 0 || (scope === "user" && !selectedUser)) return;
    const target = users?.find((user) => user.clerkId === selectedUser);
    const targetLabel =
      scope === "global"
        ? "every user"
        : target?.name ?? target?.username ?? target?.email ?? "this user";
    if (
      !window.confirm(
        `Reset ${quotas.length === 2 ? "all quotas" : quotas[0]} for ${targetLabel}?`,
      )
    )
      return;

    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const result = await reset({
        ...(scope === "user" ? { clerkId: selectedUser } : {}),
        quotas,
      });
      setNotice(
        `Quotas reset for ${result.usersReset} ${result.usersReset === 1 ? "user" : "users"}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The reset failed.");
    } finally {
      setBusy(false);
    }
  }

  if (access === undefined) {
    return <p className="text-sm text-muted-foreground">Checking access…</p>;
  }

  if (!access) {
    return (
      <Card className="p-6 sm:p-7">
        <h2 className="text-xl font-semibold text-foreground">Access restricted</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This page is available only to the CEO role.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
      <Card className="p-6 sm:p-7">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground">Reset allowances</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Restore quota immediately. Active Experience sessions will start a fresh allowance.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-foreground">Scope</legend>
          {(["global", "user"] as const).map((value) => (
            <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 has-checked:border-primary has-checked:bg-primary/[0.04]">
              <input
                type="radio"
                name="scope"
                value={value}
                checked={scope === value}
                onChange={() => { setScope(value); setNotice(null); }}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block font-medium text-foreground">{value === "global" ? "Everyone" : "Specific user"}</span>
                <span className="text-sm text-muted-foreground">{value === "global" ? "Reset selected quotas across all accounts." : "Choose one account from the directory."}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {scope === "user" && (
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-semibold text-foreground">User</span>
            <select
              value={selectedUser}
              onChange={(event) => { setSelectedUser(event.target.value); setNotice(null); }}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Select a user…</option>
              {(users ?? []).map((user) => (
                <option key={user.clerkId} value={user.clerkId}>
                  {user.name ?? user.username ?? user.email ?? user.clerkId}{user.username ? ` (@${user.username})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="mt-6 space-y-3">
          <legend className="mb-2 text-sm font-semibold text-foreground">Quotas</legend>
          {([
            ["experience", "Proxy time", "Daily Experience browsing time"],
            ["bot", "Bot usage", "Daily @bot messages"],
          ] as const).map(([value, label, description]) => (
            <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4 has-checked:border-primary has-checked:bg-primary/[0.04]">
              <input type="checkbox" checked={quotas.includes(value)} onChange={() => toggleQuota(value)} className="size-4 accent-primary" />
              <span><span className="block font-medium text-foreground">{label}</span><span className="text-sm text-muted-foreground">{description}</span></span>
            </label>
          ))}
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={busy || quotas.length === 0 || (scope === "user" && !selectedUser)} onClick={submit}>
            {busy ? "Resetting…" : "Reset quotas now"}
          </Button>
          {notice && <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircleIcon className="size-4" />{notice}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold text-foreground">User directory</h2>
          <InputGroup className="mt-3">
            <InputAddon><MagnifyingGlassIcon /></InputAddon>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, handle, or email" aria-label="Search users" />
          </InputGroup>
        </div>
        <div className="max-h-[32rem] overflow-y-auto">
          {users === undefined ? (
            <p className="p-5 text-sm text-muted-foreground">Loading users…</p>
          ) : filtered.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No users found.</p>
          ) : filtered.map((user) => (
            <button
              key={user.clerkId}
              type="button"
              onClick={() => { setSelectedUser(user.clerkId); setScope("user"); setNotice(null); }}
              className="flex w-full items-center justify-between gap-4 border-b border-border px-5 py-3 text-left last:border-0 hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{user.name ?? user.username ?? user.email ?? "Unnamed user"}</span>
                <span className="block truncate text-xs text-muted-foreground">{user.username ? `@${user.username}` : user.email ?? user.clerkId}</span>
              </span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[0.6875rem] font-semibold text-muted-foreground">{user.role === "ceo" ? "CEO" : user.role}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
