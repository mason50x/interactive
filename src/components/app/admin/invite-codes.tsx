"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState, type FormEvent } from "react";

import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { cn } from "@/lib/utils";
import { AdminSelect } from "./admin-select";

type InviteCode = FunctionReturnType<typeof api.invites.list>[number];

const HOUR = 60 * 60 * 1000;
const EXPIRIES = [
  { value: "never", label: "Never expires" },
  { value: String(24 * HOUR), label: "Expires in 24 hours" },
  { value: String(7 * 24 * HOUR), label: "Expires in 7 days" },
  { value: String(30 * 24 * HOUR), label: "Expires in 30 days" },
] as const;

const STATUS: Record<InviteCode["status"], { label: string; dot: string }> = {
  active: { label: "Active", dot: "bg-success" },
  disabled: { label: "Disabled", dot: "bg-muted-foreground" },
  expired: { label: "Expired", dot: "bg-muted-foreground" },
  used_up: { label: "Used up", dot: "bg-muted-foreground" },
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : fallback;
}

/** A minute is fine-grained enough to flip a code to expired on screen. */
function useMinute() {
  const [now, setNow] = useState(
    () => Math.floor(Date.now() / 60_000) * 60_000,
  );
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Math.floor(Date.now() / 60_000) * 60_000),
      15_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function CreateInvite() {
  const create = useMutation(api.invites.create);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiry, setExpiry] = useState<string>("never");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    try {
      const made = await create({
        code: code.trim() || undefined,
        note: note.trim() || undefined,
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresAt: expiry === "never" ? undefined : Date.now() + Number(expiry),
      });
      setFeedback({ message: `Created ${made}.` });
      setCode("");
      setNote("");
      setMaxUses("");
    } catch (error) {
      setFeedback({
        error: true,
        message: errorMessage(error, "Couldn't create the code."),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border p-4 page-sm:p-5"
    >
      <h2 className="font-medium">New invite code</h2>
      <div className="mt-4 grid gap-3 page-sm:grid-cols-2 page-lg:grid-cols-[9rem_1fr_9rem_auto_auto]">
        <Input
          aria-label="Code"
          placeholder="Random code"
          inputMode="numeric"
          maxLength={6}
          pattern="\d{6}"
          title="Six digits"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        />
        <Input
          aria-label="Note"
          placeholder="Note, e.g. who it's for"
          maxLength={80}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <Input
          aria-label="Maximum uses"
          placeholder="Unlimited uses"
          type="number"
          min={1}
          max={100000}
          step={1}
          value={maxUses}
          onChange={(event) => setMaxUses(event.target.value)}
        />
        <AdminSelect
          aria-label="Expiry"
          value={expiry}
          onChange={(event) => setExpiry(event.target.value)}
        >
          {EXPIRIES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </AdminSelect>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create code"}
        </Button>
      </div>
      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={cn(
            "mt-3 text-sm",
            feedback.error ? "text-destructive" : "text-success",
          )}
        >
          {feedback.message}
        </p>
      )}
    </form>
  );
}

function InviteRow({ invite }: { invite: InviteCode }) {
  const setDisabled = useMutation(api.invites.setDisabled);
  const remove = useMutation(api.invites.remove);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught, "That didn't work. Try again."));
    }
  }

  const status = STATUS[invite.status];
  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3.5 page-sm:px-5">
        <button
          type="button"
          className="rounded-sm font-mono text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Copy code"
          onClick={() => {
            void navigator.clipboard.writeText(invite.code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {invite.code}
        </button>
        <span className="ml-2 text-xs text-muted-foreground" aria-live="polite">
          {copied ? "Copied" : ""}
        </span>
        {invite.note && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {invite.note}
          </span>
        )}
        {error && (
          <span role="alert" className="mt-1 block text-xs text-destructive">
            {error}
          </span>
        )}
      </td>
      <td className="px-3 py-3.5 tabular-nums">
        {invite.uses}
        <span className="text-muted-foreground">
          {" / "}
          {invite.maxUses ?? "∞"}
        </span>
      </td>
      <td className="hidden px-3 py-3.5 text-xs text-muted-foreground page-md:table-cell">
        {invite.expiresAt === undefined
          ? "Never"
          : new Date(invite.expiresAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
      </td>
      <td className="hidden px-3 py-3.5 page-sm:table-cell">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-full", status.dot)}
          />
          {status.label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        {confirming ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => void run(() => remove({ id: invite._id }))}
            >
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void run(() =>
                  setDisabled({ id: invite._id, disabled: !invite.disabled }),
                )
              }
            >
              {invite.disabled ? "Enable" : "Disable"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          </>
        )}
      </td>
    </tr>
  );
}

/** CEO-only: make, pause, and delete the codes the invite gate accepts. */
export function InviteCodes() {
  const now = useMinute();
  const invites = useAuthedQuery(api.invites.list, { now });

  return (
    <section aria-label="Invite codes" className="min-w-0 space-y-5">
      <CreateInvite />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Invite codes, newest first.</caption>
          <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium page-sm:px-5">
                Code
              </th>
              <th scope="col" className="w-24 px-3 py-3 font-medium">
                Uses
              </th>
              <th
                scope="col"
                className="hidden w-40 px-3 py-3 font-medium page-md:table-cell"
              >
                Expires
              </th>
              <th
                scope="col"
                className="hidden w-28 px-3 py-3 font-medium page-sm:table-cell"
              >
                Status
              </th>
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invites?.map((invite) => (
              <InviteRow key={invite._id} invite={invite} />
            ))}
            {invites?.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-14 text-center text-muted-foreground"
                  role="status"
                >
                  No invite codes yet.
                </td>
              </tr>
            )}
            {invites === undefined && (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-14 text-center text-muted-foreground"
                  role="status"
                >
                  Loading codes…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
