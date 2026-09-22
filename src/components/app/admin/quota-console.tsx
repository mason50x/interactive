"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import { ChevronUpDownIcon } from "@heroicons/react/24/solid";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, InputAddon, InputGroup } from "@/components/ui/input";

type QuotaKind = "experience" | "bot";
type SiteRole = "ceo" | "head_moderator" | "moderator" | "builder" | "member";
const ROLE_LABEL: Record<SiteRole, string> = {
  ceo: "CEO",
  head_moderator: "Head Moderator",
  moderator: "Moderator",
  builder: "Builder",
  member: "Member",
};
const SITE_ROLES: SiteRole[] = ["ceo", "head_moderator", "moderator", "builder", "member"];
const QUOTA_LABEL: Record<QuotaKind, string> = {
  experience: "Proxy time",
  bot: "Bot usage",
};

export function QuotaConsole() {
  const { userId } = useAuth();
  const access = useQuery(api.adminQuotas.access, {});
  const users = useQuery(api.adminQuotas.users, access === true ? {} : "skip");
  const reset = useMutation(api.adminQuotas.reset);
  const setRole = useMutation(api.adminQuotas.setRole);
  const [scope, setScope] = useState<"global" | "user">("global");
  const [selectedUser, setSelectedUser] = useState("");
  const [search, setSearch] = useState("");
  const [quotas, setQuotas] = useState<QuotaKind[]>(["experience", "bot"]);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const roleSaving = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [roleFeedback, setRoleFeedback] = useState<{
    clerkId: string;
    message: string;
    error: boolean;
  } | null>(null);
  const target = users?.find((user) => user.clerkId === selectedUser);
  const targetLabel =
    target?.name ?? target?.username ?? target?.email ?? target?.clerkId;
  const allowanceLabel = quotas
    .map((quota) => QUOTA_LABEL[quota])
    .join(" and ");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (users ?? []).filter(
      (user) =>
        !term ||
        [user.name, user.username, user.email, user.clerkId].some((value) =>
          value?.toLowerCase().includes(term),
        ),
    );
  }, [search, users]);

  function clearFeedback() {
    setNotice(null);
    setError(null);
  }
  function toggleQuota(quota: QuotaKind) {
    clearFeedback();
    setQuotas((current) =>
      current.includes(quota)
        ? current.filter((item) => item !== quota)
        : [...current, quota],
    );
  }
  async function submit() {
    if (
      submitting.current ||
      quotas.length === 0 ||
      (scope === "user" && !target)
    )
      return;
    if (
      !window.confirm(
        `Reset ${allowanceLabel} for ${scope === "global" ? "every user" : targetLabel}?`,
      )
    )
      return;
    submitting.current = true;
    setBusy(true);
    clearFeedback();
    try {
      const result = await reset({
        ...(scope === "user" ? { clerkId: selectedUser } : {}),
        quotas,
      });
      setNotice(
        `Allowances reset for ${result.usersReset} ${result.usersReset === 1 ? "account" : "accounts"}.`,
      );
    } catch {
      setError("The reset failed. Try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function changeRole(
    clerkId: string,
    current: SiteRole,
    next: string,
    name: string,
  ) {
    if (
      next !== "ceo" &&
      next !== "head_moderator" &&
      next !== "moderator" &&
      next !== "builder" &&
      next !== "member"
    )
      return;
    if (next === current || roleSaving.current || clerkId === userId) return;
    roleSaving.current = true;
    setRoleFeedback(null);
    setSavingRole(clerkId);
    try {
      await setRole({ clerkId, role: next });
      setRoleFeedback({
        clerkId,
        message: `Role updated for ${name}.`,
        error: false,
      });
    } catch {
      setRoleFeedback({
        clerkId,
        message: "The role could not be changed. Try again.",
        error: true,
      });
    } finally {
      roleSaving.current = false;
      setSavingRole(null);
    }
  }

  if (access === undefined) {
    return <p className="text-sm text-muted-foreground">Checking access…</p>;
  }

  if (!access) {
    return (
      <Card className="p-6 sm:p-7">
        <h2 className="text-xl font-semibold text-foreground">
          Access restricted
        </h2>
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
          <h2 className="text-xl font-semibold text-foreground">
            Reset allowances
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Restore quota immediately. Active Experience sessions will start a
            fresh allowance.
          </p>
        </div>

        <fieldset disabled={busy} className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-foreground">
            Scope
          </legend>
          {(["global", "user"] as const).map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 has-checked:border-primary has-checked:bg-primary/[0.04]"
            >
              <input
                type="radio"
                name="scope"
                value={value}
                checked={scope === value}
                onChange={() => {
                  setScope(value);
                  clearFeedback();
                }}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block font-medium text-foreground">
                  {value === "global" ? "Everyone" : "Specific user"}
                </span>
                <span className="text-sm text-muted-foreground">
                  {value === "global"
                    ? "Reset selected quotas across all accounts."
                    : "Choose one account from the directory."}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {scope === "user" && (
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-semibold text-foreground">
              User
            </span>
            <select
              disabled={busy}
              value={selectedUser}
              onChange={(event) => {
                setSelectedUser(event.target.value);
                clearFeedback();
              }}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Select a user…</option>
              {(users ?? []).map((user) => (
                <option key={user.clerkId} value={user.clerkId}>
                  {user.name ?? user.username ?? user.email ?? user.clerkId}
                  {user.username ? ` (@${user.username})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset disabled={busy} className="mt-6 space-y-3">
          <legend className="mb-2 text-sm font-semibold text-foreground">
            Quotas
          </legend>
          {(
            [
              ["experience", "Proxy time", "Daily Experience browsing time"],
              ["bot", "Bot usage", "Daily @bot messages"],
            ] as const
          ).map(([value, label, description]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4 has-checked:border-primary has-checked:bg-primary/[0.04]"
            >
              <input
                type="checkbox"
                checked={quotas.includes(value)}
                onChange={() => toggleQuota(value)}
                className="size-4 accent-primary"
              />
              <span>
                <span className="block font-medium text-foreground">
                  {label}
                </span>
                <span className="text-sm text-muted-foreground">
                  {description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={
              busy || quotas.length === 0 || (scope === "user" && !target)
            }
            onClick={submit}
          >
            {busy ? "Resetting…" : "Reset quotas now"}
          </Button>
          {notice && (
            <p
              role="status"
              className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircleIcon className="size-4" />
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold text-foreground">User directory</h2>
          <InputGroup className="mt-3">
            <InputAddon>
              <MagnifyingGlassIcon />
            </InputAddon>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, handle, or email"
              aria-label="Search users"
            />
          </InputGroup>
        </div>
        <div className="max-h-[32rem] overflow-y-auto">
          {users === undefined ? (
            <p className="p-5 text-sm text-muted-foreground">Loading users…</p>
          ) : filtered.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No users found.</p>
          ) : (
            filtered.map((user) => {
              const displayName =
                user.name ?? user.username ?? user.email ?? "Unnamed user";
              const isSelf = userId !== null && user.clerkId === userId;
              return (
                <div
                  key={user.clerkId}
                  className="flex w-full items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-0 hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setSelectedUser(user.clerkId);
                        setScope("user");
                        clearFeedback();
                      }}
                      aria-pressed={
                        selectedUser === user.clerkId && scope === "user"
                      }
                      className="block w-full min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <span className="block truncate text-sm font-medium text-foreground">
                        {displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {user.username
                          ? `@${user.username}`
                          : (user.email ?? user.clerkId)}
                      </span>
                    </button>
                    {savingRole === user.clerkId && (
                      <p
                        role="status"
                        className="text-xs text-muted-foreground"
                      >
                        Saving role…
                      </p>
                    )}
                    {roleFeedback?.clerkId === user.clerkId && (
                      <p
                        role={roleFeedback.error ? "alert" : "status"}
                        className={
                          roleFeedback.error
                            ? "text-xs text-destructive"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {roleFeedback.message}
                      </p>
                    )}
                  </div>
                  {/*
                  A native select, not the app's Base UI Select: its portalled
                  popup never mounts in this runtime (verified in isolation,
                  including raw primitives with no app code), while the
                  OS-level list always opens. Same footprint and tokens as
                  the shared trigger.
                */}
                  <span className="relative inline-flex h-8 w-[10rem] shrink-0 items-center">
                    <select
                      aria-label={`Role for ${displayName}`}
                      title={
                        isSelf ? "You cannot change your own role." : undefined
                      }
                      value={user.role}
                      disabled={isSelf || savingRole !== null}
                      onChange={(event) =>
                        void changeRole(
                          user.clerkId,
                          user.role,
                          event.target.value,
                          displayName,
                        )
                      }
                      className="h-full w-full cursor-pointer appearance-none rounded-lg border border-border bg-background pr-7 pl-2.5 text-xs text-foreground transition-colors outline-none select-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {SITE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                    <ChevronUpDownIcon className="pointer-events-none absolute right-2 size-4 shrink-0 text-faint" />
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
