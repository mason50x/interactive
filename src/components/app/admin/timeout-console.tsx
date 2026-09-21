"use client";

import { useRef, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  CheckCircleIcon,
  ClockIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  ArrowDownIcon,
} from "@heroicons/react/24/outline";
import s from "./admin.module.css";

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
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const target = results.find((user) => user.clerkId === selected);
  const duration = Number(minutes);
  const validDuration =
    Number.isInteger(duration) && duration >= 1 && duration <= 43200;
  const validReason = reason.trim().length > 0 && reason.trim().length <= 1000;
  const filtered = results.filter((user) =>
    `${user.label} ${user.username ?? ""} ${user.clerkId}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  async function save(enabled: boolean) {
    if (
      !target?.canManage ||
      saving.current ||
      (enabled && (!validDuration || !validReason)) ||
      (!enabled && !target.timeout)
    )
      return;
    saving.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await setTimeout({
        clerkId: target.clerkId,
        enabled,
        ...(enabled
          ? { reason: reason.trim(), durationMinutes: duration }
          : {}),
      });
      setNotice(
        enabled
          ? `Timeout started for ${target.label}.`
          : `Timeout ended for ${target.label}.`,
      );
    } catch {
      setError("The timeout could not be changed. Try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      id="user_timeouts"
      aria-labelledby="timeout-heading"
      className={s.timeoutGrid}
    >
      <div className={`${s.panel} ${s.userPanel}`}>
        <h2 id="timeout-heading" className={s.heading}>
          User timeouts
        </h2>
        <p className={s.muted}>
          Temporarily pause access for users below your role.
        </p>
        <label className={`${s.field} ${s.search}`}>
          Search users
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            className={s.control}
            type="search"
            placeholder="Name, handle, or account ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div
          className={s.list}
          role="region"
          aria-label="Timeout users"
          tabIndex={0}
        >
          {filtered.map((user) => (
            <button
              key={user.clerkId}
              type="button"
              disabled={busy}
              aria-pressed={selected === user.clerkId}
              className={s.userRow}
              onClick={() => {
                setSelected(user.clerkId);
                setReason(user.timeout?.reason ?? "");
                setNotice(null);
                setError(null);
              }}
            >
              <span className={s.identity}>
                <span className={s.name}>{user.label}</span>
                <span className={s.meta}>
                  {user.username ? `@${user.username}` : user.clerkId}
                </span>
                <span className={s.status}>
                  {user.ceoCleared
                    ? "Cleared by CEO"
                    : user.timeout
                      ? "Timed out"
                      : "No active timeout"}
                  {!user.canManage ? " · Restricted" : ""}
                </span>
              </span>
              {selected === user.clerkId ? (
                <CheckCircleIcon aria-hidden="true" />
              ) : !user.canManage ? (
                <LockClosedIcon aria-hidden="true" />
              ) : null}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className={s.empty} role="status">
              {status === "LoadingFirstPage"
                ? "Loading users…"
                : "No matching users loaded."}
            </p>
          )}
        </div>
        <div className={s.listActions}>
          {status === "CanLoadMore" && (
            <button
              className={s.button}
              type="button"
              disabled={busy}
              onClick={() => loadMore(50)}
            >
              Load more users
            </button>
          )}
          {target && (
            <a
              className={s.link}
              href="#timeout-controls"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById("timeout-controls")?.focus();
              }}
            >
              Timeout controls{" "}
              <ArrowDownIcon width={16} height={16} aria-hidden="true" />
            </a>
          )}
        </div>
        {status === "LoadingMore" && (
          <p className={s.feedback} role="status">
            Loading users…
          </p>
        )}
      </div>
      <div
        className={`${s.panel} ${s.detailPanel} ${s.stack}`}
        id="timeout-controls"
        tabIndex={-1}
      >
        <div
          className={`${s.detail} ${target ? s.detailEnter : ""}`}
          key={selected}
        >
          <p className={s.muted}>Selected account</p>
          <h3 className={s.subheading}>
            {target ? target.label : "Select a user"}
          </h3>
          <div role="status" aria-live="polite" className={s.feedback}>
            {target ? (
              <>
                <span className="sr-only">Selected {target.label}. </span>
                <span className={s.meta}>
                  {target.username ? `@${target.username}` : target.clerkId}
                </span>
                <span className={s.status}>
                  <ClockIcon aria-hidden="true" />
                  {target.ceoCleared
                    ? "Cleared by CEO"
                    : target.timeout
                      ? "Timed out"
                      : "No active timeout"}
                </span>
              </>
            ) : (
              <p className={s.muted}>
                Choose an account to review its timeout.
              </p>
            )}
          </div>
          {target?.timeout && (
            <div className={`${s.feedback} ${s.numerals}`}>
              <p>
                Active until{" "}
                {new Date(target.timeout.expiresAt).toLocaleString()}.
              </p>
              <p className={s.muted}>Reason: {target.timeout.reason}</p>
            </div>
          )}
        </div>
        <label className={s.field}>
          Reason
          <textarea
            className={s.control}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            rows={5}
            disabled={busy || !target?.canManage}
            placeholder="Explain why access is being paused"
            aria-describedby="timeout-reason-help"
          />
          <span id="timeout-reason-help" className={s.meta}>
            Required to start a timeout. Up to 1,000 characters.
          </span>
        </label>
      </div>
      <div className={`${s.panel} ${s.durationPanel} ${s.stack}`}>
        <label className={s.field}>
          Duration in minutes
          <input
            className={`${s.control} ${s.numerals}`}
            type="number"
            min={1}
            max={43200}
            step={1}
            value={minutes}
            disabled={busy || !target?.canManage}
            onChange={(event) => setMinutes(event.target.value)}
            aria-invalid={!validDuration}
            aria-describedby="timeout-duration-help"
          />
        </label>
        <p id="timeout-duration-help" className={s.muted}>
          Enter a whole number from 1 to 43,200.
        </p>
        <p className={s.muted}>
          Timeouts expire automatically and can be ended early.
        </p>
      </div>
      <div
        className={`${s.panel} ${s.actionPanel} ${s.stack}`}
        aria-busy={busy}
      >
        <h3 className={s.subheading}>Manage timeout</h3>
        <div className={s.actions}>
          <button
            className={`${s.button} ${s.primary}`}
            type="button"
            disabled={
              busy || !target?.canManage || !validReason || !validDuration
            }
            onClick={() => void save(true)}
          >
            {busy
              ? "Saving…"
              : target?.timeout
                ? "Restart timeout"
                : "Start timeout"}
          </button>
          <button
            className={s.button}
            type="button"
            disabled={busy || !target?.canManage || !target.timeout}
            onClick={() => void save(false)}
          >
            End timeout
          </button>
        </div>
        {!target ? (
          <p className={s.muted}>Select an account to manage its timeout.</p>
        ) : !target.canManage ? (
          <p className={s.status}>
            <LockClosedIcon aria-hidden="true" />
            You cannot manage this account’s timeout.
          </p>
        ) : null}
        <p className={s.muted}>
          Only CEOs can change CEO-issued timeouts or restart a timeout cleared
          by a CEO.
        </p>
        {error && (
          <p role="alert" className={`${s.feedback} ${s.error}`}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className={s.status}>
            <CheckCircleIcon aria-hidden="true" />
            {notice}
          </p>
        )}
      </div>
    </section>
  );
}
