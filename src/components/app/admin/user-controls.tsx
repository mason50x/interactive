"use client";

import { useRef, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { BOT_NAME } from "@/lib/chat";
import { PLAYTIME_SECONDS } from "@config/playtime";
import { cn } from "@/lib/utils";
import styles from "./admin.module.css";
import {
  ROLE_LABEL,
  type DirectoryUser,
  type SiteRole,
} from "./user-directory";
import { AdminSelect } from "./admin-select";

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
        `Reset ${quotas.map((quota) => (quota === "experience" ? "Activity time" : `${BOT_NAME} usage`)).join(" and ")} for ${user?.label ?? "every user"}?`,
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
          : result.pending
            ? "Reset started. Remaining accounts will finish shortly."
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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h3 className="shrink-0 text-sm font-medium">
          {user ? "Reset allowances" : "Reset allowances for everyone"}
        </h3>
        <fieldset disabled={busy} className="flex flex-wrap gap-x-5 gap-y-2">
          <legend className="sr-only">Allowances to reset</legend>
          {(["experience", "bot"] as const).map((quota) => (
            <label
              key={quota}
              className="flex cursor-pointer items-center gap-2 text-sm has-disabled:cursor-not-allowed"
            >
              <input
                type="checkbox"
                className={styles.circleCheckbox}
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
              {quota === "experience" ? "Activity time" : `${BOT_NAME} usage`}
            </label>
          ))}
        </fieldset>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || quotas.length === 0}
          onClick={() => void submit()}
        >
          {busy ? "Resetting…" : user ? "Reset" : "Reset for everyone"}
        </Button>
      </div>
      <FeedbackMessage value={feedback} />
    </div>
  );
}

function ActivityLimitControl({ user }: { user: DirectoryUser }) {
  const setLimit = useMutation(api.adminQuotas.setActivityLimit);
  const [mode, setMode] = useState(
    user.activityLimitMinutes === undefined ? "default" : "custom",
  );
  const [minutes, setMinutes] = useState(
    String(user.activityLimitMinutes ?? PLAYTIME_SECONDS / 60),
  );
  const [savedLimit, setSavedLimit] = useState(user.activityLimitMinutes);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  if (savedLimit !== user.activityLimitMinutes) {
    setSavedLimit(user.activityLimitMinutes);
    setMode(user.activityLimitMinutes === undefined ? "default" : "custom");
    setMinutes(String(user.activityLimitMinutes ?? PLAYTIME_SECONDS / 60));
    setFeedback(null);
  }

  const amount = Number(minutes);
  const valid =
    mode === "default" ||
    (minutes.trim() !== "" &&
      Number.isInteger(amount) &&
      amount >= 20 &&
      amount <= 160);
  const changed =
    mode === "default"
      ? user.activityLimitMinutes !== undefined
      : valid && amount !== user.activityLimitMinutes;

  async function save() {
    if (!valid || !changed || saving.current) return;
    saving.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await setLimit({
        clerkId: user.clerkId,
        ...(mode === "custom" ? { minutes: amount } : {}),
      });
      setFeedback({ message: `Activity time updated for ${user.label}.` });
    } catch {
      setFeedback({
        error: true,
        message: "Activity time could not be changed. Try again.",
      });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">Activity time limit</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Daily base allowance. Chat rewards add time separately.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <AdminSelect
          aria-label={`Activity time limit for ${user.label}`}
          value={mode}
          disabled={busy}
          onChange={(event) => {
            setMode(event.target.value);
            setFeedback(null);
          }}
        >
          <option value="default">
            Default ({PLAYTIME_SECONDS / 60} minutes)
          </option>
          <option value="custom">Custom</option>
        </AdminSelect>
        {mode === "custom" && (
          <label className="flex items-center gap-2 text-sm">
            <Input
              aria-label="Custom minutes"
              className="w-24"
              type="number"
              min={20}
              max={160}
              step={1}
              value={minutes}
              disabled={busy}
              onChange={(event) => {
                setMinutes(event.target.value);
                setFeedback(null);
              }}
            />
            minutes
          </label>
        )}
        <Button
          variant="outline"
          disabled={busy || !valid || !changed}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save limit"}
        </Button>
      </div>
      {mode === "custom" && !valid && (
        <p className="text-xs text-destructive">
          Enter a whole number from 20 to 160.
        </p>
      )}
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
        <AdminSelect
          id={`role-${user.clerkId}`}
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
        </AdminSelect>
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
  const [editing, setEditing] = useState(false);
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
      setEditing(false);
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
              ? "Cleared by a CEO. Protection lasts 2 hours from the clear."
              : "No active timeout."}
        </p>
        {user.timeout && (
          <p className="mt-2 text-sm break-words">{user.timeout.reason}</p>
        )}
      </div>
      {user.canManage ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              aria-expanded={editing}
              aria-controls={`timeout-editor-${user.clerkId}`}
              onClick={() => setEditing((current) => !current)}
            >
              {user.timeout ? "Change timeout" : "Start timeout"}
              <ChevronDownIcon
                aria-hidden="true"
                className={cn(
                  "size-4 transition-transform duration-300",
                  editing && "rotate-180",
                )}
              />
            </Button>
            {user.timeout && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void save(false)}
              >
                End timeout
              </Button>
            )}
          </div>
          <div
            id={`timeout-editor-${user.clerkId}`}
            // Bleed sideways so the fields' focus rings aren't clipped by the
            // reveal's overflow: hidden.
            className={cn(styles.reveal, "-mx-1")}
            data-open={editing}
            aria-hidden={!editing}
            inert={!editing}
          >
            <div className={styles.revealContent}>
              <div className="space-y-3 px-1 pt-3 pb-1">
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
                </label>
                <Button
                  disabled={busy || !valid}
                  onClick={() => void save(true)}
                >
                  {busy
                    ? "Saving…"
                    : user.timeout
                      ? "Restart timeout"
                      : "Apply timeout"}
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
      <FeedbackMessage value={feedback} />
    </div>
  );
}

function TimeoutHistory({ user }: { user: DirectoryUser }) {
  const [open, setOpen] = useState(false);
  const {
    results: entries,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.timeouts.history,
    { clerkId: user.clerkId },
    { initialNumItems: 20 },
  );
  return (
    <section
      aria-label={`Timeout log for ${user.label}`}
      className="border-t border-border pt-5 lg:col-span-2 xl:col-span-3"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-sm text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
        aria-controls={`timeout-log-${user.clerkId}`}
        onClick={() => setOpen((current) => !current)}
      >
        Timeout log{" "}
        <span className="text-xs font-normal text-muted-foreground">
          Last 7 days
        </span>
        <ChevronDownIcon
          className={cn(
            "ml-auto size-4 transition-transform duration-300",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={`timeout-log-${user.clerkId}`}
        className={styles.reveal}
        data-open={open}
        aria-hidden={!open}
        inert={!open}
      >
        <div className={styles.revealContent}>
          {status === "LoadingFirstPage" ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading log…</p>
          ) : entries.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No timeout changes in the last 7 days.
            </p>
          ) : (
            <ol className="mt-3 divide-y divide-border rounded-lg border border-border">
              {entries.map((entry) => (
                <li key={entry.id} className="px-3 py-3 text-sm">
                  <p className="font-medium">
                    {entry.action === "on" ? "Timed out" : "Timeout ended"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    By {entry.actorLabel} ·{" "}
                    {new Date(entry.at).toLocaleString()}
                    {entry.action === "on"
                      ? ` · Until ${new Date(entry.expiresAt).toLocaleString()}`
                      : ""}
                  </p>
                  <p className="mt-1 break-words">Reason: {entry.reason}</p>
                </li>
              ))}
            </ol>
          )}
          {status === "CanLoadMore" && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => loadMore(20)}
            >
              Show older changes
            </Button>
          )}
        </div>
      </div>
    </section>
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
        <h3 className="text-sm font-medium">Account</h3>
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
      {(isCeo || user.role !== "ceo") && (
        <section
          aria-label={`Allowances for ${user.label}`}
          className="min-w-0 border-t border-border pt-5 lg:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6"
        >
          <ActivityLimitControl user={user} />
          {isCeo && (
            <div className="mt-6 border-t border-border pt-5">
              <AllowanceReset user={user} />
            </div>
          )}
        </section>
      )}
      <TimeoutHistory user={user} />
    </div>
  );
}
