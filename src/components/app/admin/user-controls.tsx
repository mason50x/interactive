"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { BOT_NAME } from "@/lib/chat";
import {
  ROLE_LABEL,
  SELECT_CLASS,
  type DirectoryUser,
  type SiteRole,
} from "./user-directory";

type Feedback = { message: string; error?: boolean } | null;
function FeedbackMessage({ value }: { value: Feedback }) {
  return (
    value && (
      <p
        role={value.error ? "alert" : "status"}
        className={
          value.error ? "text-sm text-destructive" : "text-sm text-success"
        }
      >
        {value.message}
      </p>
    )
  );
}

export function AllowanceReset({ user }: { user?: DirectoryUser }) {
  const reset = useMutation(api.adminQuotas.reset);
  const [quotas, setQuotas] = useState<("experience" | "bot")[]>([
    "experience",
    "bot",
  ]);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit() {
    if (saving.current || quotas.length === 0) return;
    if (
      !window.confirm(
        `Reset ${quotas.map((quota) => (quota === "experience" ? "Proxy time" : `${BOT_NAME} usage`)).join(" and ")} for ${user?.label ?? "every user"}?`,
      )
    )
      return;
    saving.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await reset({
        ...(user ? { clerkId: user.clerkId } : {}),
        quotas,
      });
      setFeedback({
        message: user
          ? `Allowances reset for ${user.label}.`
          : `Allowances reset for ${result.usersReset} accounts.`,
      });
    } catch {
      setFeedback({ error: true, message: "The reset failed. Try again." });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">
          {user ? "Daily allowances" : "Reset allowances for everyone"}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {user
            ? "Restore this user’s daily allowance immediately."
            : "This applies to every account. Active Experience sessions receive a fresh allowance."}
        </p>
      </div>
      <fieldset disabled={busy} className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="sr-only">Allowances to reset</legend>
        {(["experience", "bot"] as const).map((quota) => (
          <label key={quota} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={quotas.includes(quota)}
              onChange={() => {
                setFeedback(null);
                setQuotas((current) =>
                  current.includes(quota)
                    ? current.filter((value) => value !== quota)
                    : [...current, quota],
                );
              }}
            />
            {quota === "experience" ? "Proxy time" : `${BOT_NAME} usage`}
          </label>
        ))}
      </fieldset>
      <Button
        variant="outline"
        disabled={busy || quotas.length === 0}
        onClick={() => void submit()}
      >
        {busy ? "Resetting…" : user ? "Reset allowances" : "Reset for everyone"}
      </Button>
      <FeedbackMessage value={feedback} />
    </div>
  );
}

function RoleControl({ user }: { user: DirectoryUser }) {
  const setRole = useMutation(api.adminQuotas.setRole);
  const [draft, setDraft] = useState<SiteRole>(user.role);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [savedRole, setSavedRole] = useState(user.role);

  if (savedRole !== user.role) {
    setSavedRole(user.role);
    setDraft(user.role);
    setFeedback(null);
  }

  async function save() {
    if (!user.canChangeRole || draft === user.role || saving.current) return;
    saving.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await setRole({ clerkId: user.clerkId, role: draft });
      setFeedback({ message: `Role updated to ${ROLE_LABEL[draft]}.` });
    } catch {
      setFeedback({
        error: true,
        message: "The role could not be changed. Try again.",
      });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label
        className="block text-xs font-medium"
        htmlFor={`role-${user.clerkId}`}
      >
        Role
      </label>
      <div className="flex flex-wrap gap-2">
        <select
          id={`role-${user.clerkId}`}
          className={SELECT_CLASS}
          value={draft}
          disabled={!user.canChangeRole || busy}
          onChange={(event) => {
            setDraft(event.target.value as SiteRole);
            setFeedback(null);
          }}
        >
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {user.canChangeRole && (
          <Button
            className="h-9"
            variant="outline"
            disabled={busy || draft === user.role}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save role"}
          </Button>
        )}
      </div>
      {!user.canChangeRole && (
        <p className="text-xs text-muted-foreground">
          You cannot change your own role.
        </p>
      )}
      <FeedbackMessage value={feedback} />
    </div>
  );
}

function TimeoutControl({ user }: { user: DirectoryUser }) {
  const setTimeout = useMutation(api.timeouts.set);
  const [reason, setReason] = useState(user.timeout?.reason ?? "");
  const [minutes, setMinutes] = useState("60");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const revision = JSON.stringify(user.timeout);
  const [savedRevision, setSavedRevision] = useState(revision);

  // Another manager may change this timeout while the account is open.
  if (savedRevision !== revision) {
    setSavedRevision(revision);
    setReason(user.timeout?.reason ?? "");
    setFeedback(null);
  }

  const duration = Number(minutes);
  const valid =
    reason.trim().length > 0 &&
    reason.trim().length <= 1000 &&
    Number.isInteger(duration) &&
    duration >= 1 &&
    duration <= 43200;

  async function save(enabled: boolean) {
    if (
      !user.canManage ||
      saving.current ||
      (enabled && !valid) ||
      (!enabled && !user.timeout)
    )
      return;
    saving.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await setTimeout({
        clerkId: user.clerkId,
        enabled,
        ...(enabled
          ? { reason: reason.trim(), durationMinutes: duration }
          : {}),
      });
      setFeedback({
        message: enabled
          ? `Timeout started for ${user.label}.`
          : `Timeout ended for ${user.label}.`,
      });
    } catch {
      setFeedback({
        error: true,
        message: "The timeout could not be changed. Try again.",
      });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">Timeout</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {user.timeout
            ? `Access paused until ${new Date(user.timeout.expiresAt).toLocaleString()}.`
            : user.ceoCleared
              ? "Cleared by a CEO until midnight UTC."
              : "No active timeout."}
        </p>
        {user.timeout && (
          <p className="mt-2 text-sm break-words">{user.timeout.reason}</p>
        )}
      </div>
      {user.canManage ? (
        <>
          <label className="block text-xs font-medium">
            Reason
            <Textarea
              className="mt-1.5 min-h-20"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              rows={2}
              disabled={busy}
              placeholder="Why is access being paused?"
            />
          </label>
          <label className="block text-xs font-medium">
            Duration in minutes
            <Input
              className="mt-1.5"
              type="number"
              min={1}
              max={43200}
              step={1}
              value={minutes}
              disabled={busy}
              onChange={(event) => setMinutes(event.target.value)}
            />
            <span className="mt-1 block font-normal text-muted-foreground">
              1 minute to 30 days. Ends automatically.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !valid} onClick={() => void save(true)}>
              {busy
                ? "Saving…"
                : user.timeout
                  ? "Restart timeout"
                  : "Start timeout"}
            </Button>
            {user.timeout && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void save(false)}
              >
                End timeout
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {user.ceoCleared
            ? "Only a CEO can start another timeout today."
            : "You can only manage timeouts for users below your role. CEO-issued timeouts can only be changed by a CEO."}
        </p>
      )}
      <FeedbackMessage value={feedback} />
    </div>
  );
}

export function UserControls({
  user,
  isCeo,
}: {
  user: DirectoryUser;
  isCeo: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
      <section
        aria-label={`Account details for ${user.label}`}
        className="min-w-0 space-y-4"
      >
        <h3 className="font-medium">Account details</h3>
        <dl className="space-y-3 text-xs">
          {user.email && (
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="mt-1 break-all">{user.email}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">User ID</dt>
            <dd className="mt-1 font-mono break-all">{user.clerkId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Joined</dt>
            <dd className="mt-1">
              {new Date(user.joinedAt).toLocaleDateString(undefined, {
                dateStyle: "long",
              })}
            </dd>
          </div>
        </dl>
        {isCeo ? (
          <RoleControl user={user} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {ROLE_LABEL[user.role]} · Only CEOs can change roles.
          </p>
        )}
      </section>
      <section
        aria-label={`Timeout for ${user.label}`}
        className="min-w-0 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
      >
        <TimeoutControl user={user} />
      </section>
      {isCeo && (
        <section
          aria-label={`Allowances for ${user.label}`}
          className="min-w-0 border-t border-border pt-5 lg:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6"
        >
          <AllowanceReset user={user} />
        </section>
      )}
    </div>
  );
}
