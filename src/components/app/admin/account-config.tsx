"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

import { api } from "@convex/_generated/api";
import {
  RestrictionScreen,
  type Restriction,
} from "@/components/app/restriction-screen";
import { Button } from "@/components/ui/button";
import { Input, InputAddon, InputGroup, Textarea } from "@/components/ui/input";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { cn } from "@/lib/utils";
import styles from "./admin.module.css";
import { AdminSelect } from "./admin-select";

type Restricted = FunctionReturnType<typeof api.restrictions.list>[number];
type Account = { clerkId: string; username?: string; name?: string };
type Fields = {
  title: string;
  heading: string;
  message: string;
  footer: string;
};
type Feedback = { message: string; error?: boolean } | null;

/** Starting points for the error screen; every field stays editable. */
const PRESETS: { label: string; fields: Fields }[] = [
  {
    label: "503 Service Unavailable",
    fields: {
      title: "503 Service Unavailable",
      heading: "Service Unavailable",
      message:
        "The server is temporarily unable to service your request due to maintenance downtime or capacity problems. Please try again later.",
      footer: "",
    },
  },
  {
    label: "500 Internal Server Error",
    fields: {
      title: "500 Internal Server Error",
      heading: "Internal Server Error",
      message:
        "The server encountered an internal error or misconfiguration and was unable to complete your request.\n\nPlease contact the server administrator to inform them of the time this error occurred, and the actions you performed just before this error.\n\nMore information about this error may be available in the server error log.",
      footer: "",
    },
  },
  {
    label: "403 Forbidden",
    fields: {
      title: "403 Forbidden",
      heading: "Forbidden",
      message: "You don't have permission to access this resource.",
      footer: "",
    },
  },
  {
    label: "404 Not Found",
    fields: {
      title: "404 Not Found",
      heading: "Not Found",
      message: "The requested URL was not found on this server.",
      footer: "",
    },
  },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : fallback;
}

function accountLabel(account: Account) {
  return account.username
    ? `@${account.username}`
    : (account.name ?? account.clerkId);
}

type Candidate = FunctionReturnType<typeof api.restrictions.accounts>[number];

/**
 * Every non-CEO account with a checkbox. "Select all" follows the filter, so
 * narrowing the list first and then selecting all picks just what's shown.
 */
function AccountChecklist({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const accounts = useAuthedQuery(api.restrictions.accounts, {});
  const [text, setText] = useState("");
  const term = useDeferredValue(text.trim().replace(/^@/, "").toLowerCase());
  const shown = useMemo(
    () =>
      (accounts ?? []).filter(
        (account) =>
          !term ||
          account.username?.toLowerCase().includes(term) ||
          account.name?.toLowerCase().includes(term),
      ),
    [accounts, term],
  );
  const allShown =
    shown.length > 0 && shown.every((account) => selected.has(account.clerkId));
  const someShown = shown.some((account) => selected.has(account.clerkId));

  function toggle(account: Candidate) {
    const next = new Set(selected);
    if (next.has(account.clerkId)) next.delete(account.clerkId);
    else next.add(account.clerkId);
    onChange(next);
  }

  function toggleShown() {
    const next = new Set(selected);
    for (const account of shown)
      if (allShown) next.delete(account.clerkId);
      else next.add(account.clerkId);
    onChange(next);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border p-2">
        <InputGroup>
          <InputAddon>
            <MagnifyingGlassIcon />
          </InputAddon>
          <Input
            aria-label="Filter accounts"
            placeholder="Filter by username or name"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </InputGroup>
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-3 py-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2.5 font-medium">
          <input
            type="checkbox"
            className={styles.circleCheckbox}
            checked={allShown}
            disabled={shown.length === 0}
            ref={(input) => {
              if (input) input.indeterminate = someShown && !allShown;
            }}
            onChange={toggleShown}
          />
          {term ? `Select all ${shown.length} shown` : "Select all accounts"}
        </label>
        <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          {selected.size} selected
          {selected.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onChange(new Set())}
            >
              Clear
            </Button>
          )}
        </span>
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {shown.map((account) => (
          <li key={account.clerkId}>
            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted">
              <input
                type="checkbox"
                className={styles.circleCheckbox}
                checked={selected.has(account.clerkId)}
                onChange={() => toggle(account)}
              />
              <span className="min-w-0 truncate">
                {accountLabel(account)}
                {account.name && account.username && (
                  <span className="ml-2 text-muted-foreground">
                    {account.name}
                  </span>
                )}
              </span>
              {account.restricted && (
                <span className="ml-auto shrink-0 text-xs text-destructive">
                  Restricted
                </span>
              )}
            </label>
          </li>
        ))}
        {accounts !== undefined && shown.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            {term ? "No matching accounts." : "No accounts to restrict."}
          </li>
        )}
        {accounts === undefined && (
          <li
            className="px-3 py-6 text-center text-sm text-muted-foreground"
            role="status"
          >
            Loading accounts…
          </li>
        )}
      </ul>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">
        {label}
        {hint && (
          <span className="ml-2 font-normal text-muted-foreground">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function RestrictForm({
  editing,
  onDone,
}: {
  editing: Restricted | null;
  onDone: () => void;
}) {
  const set = useMutation(api.restrictions.set);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(editing ? [editing.clerkId] : []),
  );
  const [kind, setKind] = useState<Restriction["kind"]>(
    editing?.kind ?? "banned",
  );
  const [fields, setFields] = useState<Fields>(
    editing?.kind === "error"
      ? {
          title: editing.title ?? "",
          heading: editing.heading ?? "",
          message: editing.message ?? "",
          footer: editing.footer ?? "",
        }
      : PRESETS[0].fields,
  );
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const restriction: Restriction =
    kind === "banned"
      ? { kind }
      : { kind, ...fields, title: fields.title || undefined };
  const valid =
    selected.size > 0 && (kind === "banned" || fields.heading.trim() !== "");
  const who =
    selected.size === 1 && editing?.clerkId && selected.has(editing.clerkId)
      ? accountLabel(editing)
      : `${selected.size} ${selected.size === 1 ? "account" : "accounts"}`;

  function update(field: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    if (
      !window.confirm(
        `Restrict ${who}? They'll be locked out of the site until you lift it.`,
      )
    )
      return;
    setPending(true);
    setFeedback(null);
    try {
      const count = await set({
        clerkIds: [...selected],
        screen:
          kind === "banned"
            ? { kind }
            : {
                kind,
                title: fields.title,
                heading: fields.heading,
                message: fields.message,
                footer: fields.footer,
              },
      });
      setFeedback({
        message: `${count} ${count === 1 ? "account is" : "accounts are"} restricted.`,
      });
      setSelected(new Set());
      onDone();
    } catch (error) {
      setFeedback({
        error: true,
        message: errorMessage(error, "Couldn't restrict the account."),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">
          {editing ? "Edit restriction" : "Restrict accounts"}
        </h2>
        {editing && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        A full-screen page they can’t close. Every request their account makes
        is refused until it’s lifted.
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">
              Accounts
              <span className="ml-2 font-normal text-muted-foreground">
                CEOs can’t be restricted
              </span>
            </span>
            <AccountChecklist selected={selected} onChange={setSelected} />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Screen</span>
            <div className="flex flex-wrap gap-2">
              <AdminSelect
                aria-label="Screen"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as Restriction["kind"])
                }
              >
                <option value="banned">Banned</option>
                <option value="error">Error screen</option>
              </AdminSelect>
              {kind === "error" && (
                <AdminSelect
                  aria-label="Start from a preset"
                  value=""
                  onChange={(event) => {
                    const preset = PRESETS[Number(event.target.value)];
                    if (preset) setFields(preset.fields);
                  }}
                >
                  <option value="" disabled>
                    Start from a preset
                  </option>
                  {PRESETS.map((preset, index) => (
                    <option key={preset.label} value={index}>
                      {preset.label}
                    </option>
                  ))}
                </AdminSelect>
              )}
            </div>
          </div>
          {kind === "error" && (
            <>
              <Field label="Heading">
                <Input
                  required
                  maxLength={200}
                  value={fields.heading}
                  onChange={(event) => update("heading", event.target.value)}
                />
              </Field>
              <Field
                label="Description"
                hint="Blank lines start a new paragraph"
              >
                <Textarea
                  maxLength={4000}
                  className="min-h-32"
                  value={fields.message}
                  onChange={(event) => update("message", event.target.value)}
                />
              </Field>
              <Field label="Footer" hint="Optional, under a rule">
                <Input
                  maxLength={300}
                  placeholder="Apache/2.4.58 (Ubuntu) Server at example.com Port 443"
                  value={fields.footer}
                  onChange={(event) => update("footer", event.target.value)}
                />
              </Field>
              <Field label="Tab title" hint="Defaults to the heading">
                <Input
                  maxLength={120}
                  placeholder={fields.heading}
                  value={fields.title}
                  onChange={(event) => update("title", event.target.value)}
                />
              </Field>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <span className="text-sm font-medium">Preview</span>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="truncate">
                {kind === "banned"
                  ? "Banned"
                  : fields.title || fields.heading || "Untitled"}
              </span>
            </div>
            <div className="h-72 overflow-auto bg-white">
              <RestrictionScreen restriction={restriction} preview />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="destructive"
          disabled={!valid || pending}
        >
          {pending
            ? "Saving…"
            : selected.size > 1
              ? `Restrict ${selected.size} accounts`
              : editing
                ? "Save changes"
                : "Restrict account"}
        </Button>
        {feedback && (
          <p
            role={feedback.error ? "alert" : "status"}
            className={cn(
              "text-sm",
              feedback.error ? "text-destructive" : "text-success",
            )}
          >
            {feedback.message}
          </p>
        )}
      </div>
    </form>
  );
}

function RestrictedRow({
  row,
  onEdit,
}: {
  row: Restricted;
  onEdit: () => void;
}) {
  const lift = useMutation(api.restrictions.lift);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3.5 sm:px-5">
        {accountLabel(row)}
        {row.name && row.username && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {row.name}
          </span>
        )}
        {error && (
          <span role="alert" className="mt-1 block text-xs text-destructive">
            {error}
          </span>
        )}
      </td>
      <td className="px-3 py-3.5">
        {row.kind === "banned" ? (
          "Banned"
        ) : (
          <>
            Error screen
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {row.heading}
            </span>
          </>
        )}
      </td>
      <td className="hidden px-3 py-3.5 text-xs text-muted-foreground md:table-cell">
        {new Date(row.updatedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        {confirming ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                setError(null);
                lift({ clerkIds: [row.clerkId] }).catch((caught: unknown) =>
                  setError(
                    errorMessage(caught, "Couldn't lift it. Try again."),
                  ),
                );
              }}
            >
              Lift
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
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(true)}
            >
              Lift
            </Button>
          </>
        )}
      </td>
    </tr>
  );
}

/** CEO-only: ban accounts or put them behind a custom error page. */
export function AccountConfig() {
  const restricted = useAuthedQuery(api.restrictions.list, {});
  const [editing, setEditing] = useState<Restricted | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const lift = useMutation(api.restrictions.lift);
  const [liftError, setLiftError] = useState<string | null>(null);

  function liftAll() {
    if (!restricted?.length) return;
    if (
      !window.confirm(
        `Lift the restriction on all ${restricted.length} accounts?`,
      )
    )
      return;
    setLiftError(null);
    lift({ clerkIds: restricted.map((row) => row.clerkId) }).catch(
      (caught: unknown) =>
        setLiftError(errorMessage(caught, "Couldn't lift them. Try again.")),
    );
  }

  return (
    <section ref={sectionRef} aria-label="Config" className="min-w-0 space-y-5">
      <RestrictForm
        key={editing?.clerkId ?? "new"}
        editing={editing}
        onDone={() => setEditing(null)}
      />
      {restricted !== undefined && restricted.length > 1 && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {liftError && (
            <p role="alert" className="text-sm text-destructive">
              {liftError}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={liftAll}>
            Lift all {restricted.length}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Restricted accounts, most recently changed first.
          </caption>
          <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium sm:px-5">
                Account
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Screen
              </th>
              <th
                scope="col"
                className="hidden w-40 px-3 py-3 font-medium md:table-cell"
              >
                Updated
              </th>
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {restricted?.map((row) => (
              <RestrictedRow
                key={row.clerkId}
                row={row}
                onEdit={() => {
                  setEditing(row);
                  sectionRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
              />
            ))}
            {restricted?.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-14 text-center text-muted-foreground"
                  role="status"
                >
                  No restricted accounts.
                </td>
              </tr>
            )}
            {restricted === undefined && (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-14 text-center text-muted-foreground"
                  role="status"
                >
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
