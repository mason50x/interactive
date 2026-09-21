"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircleIcon,
  MagnifyingGlassIcon,
  ArrowDownIcon,
} from "@heroicons/react/24/outline";
import { ChevronUpDownIcon } from "@heroicons/react/24/solid";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { useAdminReveals } from "./admin-motion";
import s from "./admin.module.css";

type QuotaKind = "experience" | "bot";
type SiteRole = "ceo" | "head_moderator" | "moderator" | "member";
const ROLE_LABEL: Record<SiteRole, string> = {
  ceo: "CEO",
  head_moderator: "Head Moderator",
  moderator: "Moderator",
  member: "Member",
};
const SITE_ROLES: SiteRole[] = ["ceo", "head_moderator", "moderator", "member"];
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
  const [focusRequest, setFocusRequest] = useState(0);
  const userSelect = useRef<HTMLSelectElement>(null);
  const root = useAdminReveals(access === true);
  const target = users?.find((user) => user.clerkId === selectedUser);
  const targetLabel =
    target?.name ?? target?.username ?? target?.email ?? target?.clerkId;
  const allowanceLabel = quotas
    .map((quota) => QUOTA_LABEL[quota])
    .join(" and ");

  useEffect(() => {
    if (!focusRequest) return;
    const select = userSelect.current;
    select?.focus({ preventScroll: true });
    select?.scrollIntoView({
      block: "center",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [focusRequest]);

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

  if (access !== true)
    return access === undefined ? (
      <p role="status" className={s.muted}>
        Checking CEO access…
      </p>
    ) : null;

  return (
    <div ref={root} className={s.workspace}>
      <section
        id="user_directory"
        aria-labelledby="directory-heading"
        className={s.panel}
      >
        <header className={s.directoryHeader} data-admin-reveal="rise">
          <h2 id="directory-heading" className={s.heading}>
            User directory
          </h2>
          <p className={s.muted}>
            Choose an account for a quota reset or change its role.
          </p>
        </header>
        <div data-admin-reveal="rise" data-delay="80">
          <label className={`${s.field} ${s.search}`}>
            Search users
            <MagnifyingGlassIcon aria-hidden="true" />
            <input
              className={s.control}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, handle, email, or account ID"
            />
          </label>
          <div
            className={s.directoryList}
            role="region"
            aria-label="User directory accounts"
            tabIndex={0}
          >
            {users === undefined ? (
              <p className={s.empty} role="status">
                Loading users…
              </p>
            ) : filtered.length === 0 ? (
              <p className={s.empty} role="status">
                No users found.
              </p>
            ) : (
              filtered.map((user) => {
                const name =
                  user.name ?? user.username ?? user.email ?? user.clerkId;
                const self = user.clerkId === userId;
                const selected =
                  selectedUser === user.clerkId && scope === "user";
                return (
                  <div
                    key={user.clerkId}
                    className={s.directoryRow}
                    data-selected={selected}
                  >
                    <div className={s.identity}>
                      <span className={s.name}>{name}</span>
                      <span className={s.meta}>
                        {user.username
                          ? `@${user.username}`
                          : (user.email ?? user.clerkId)}
                      </span>
                      {selected && (
                        <span className={s.status}>
                          <CheckCircleIcon aria-hidden="true" />
                          Selected for quota reset
                        </span>
                      )}
                      {self && (
                        <p className={s.meta}>
                          You cannot change your own role.
                        </p>
                      )}
                      {savingRole === user.clerkId && (
                        <p role="status" className={s.feedback}>
                          Saving role…
                        </p>
                      )}
                      {roleFeedback?.clerkId === user.clerkId && (
                        <p
                          role={roleFeedback.error ? "alert" : "status"}
                          className={`${s.feedback} ${roleFeedback.error ? s.error : ""}`}
                        >
                          {roleFeedback.message}
                        </p>
                      )}
                    </div>
                    <div className={s.rowControls}>
                      <label className={s.field}>
                        Role
                        <span className={s.selectWrap}>
                          {/* Native selection avoids the existing runtime's portalled-select issue. */}
                          <select
                            className={s.control}
                            aria-label={`Role for ${name}`}
                            value={user.role}
                            disabled={self || savingRole !== null}
                            onChange={(event) =>
                              void changeRole(
                                user.clerkId,
                                user.role,
                                event.target.value,
                                name,
                              )
                            }
                          >
                            {SITE_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABEL[role]}
                              </option>
                            ))}
                          </select>
                          <ChevronUpDownIcon aria-hidden="true" />
                        </span>
                      </label>
                      <button
                        className={s.button}
                        type="button"
                        disabled={busy}
                        aria-pressed={selected}
                        aria-label={`Reset allowances for ${name}`}
                        onClick={() => {
                          setSelectedUser(user.clerkId);
                          setScope("user");
                          clearFeedback();
                          setFocusRequest((value) => value + 1);
                        }}
                      >
                        Reset allowances <ArrowDownIcon aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
      <section
        id="quota_reset"
        aria-labelledby="reset-heading"
        className={s.quota}
        aria-busy={busy}
      >
        <header>
          <h2 id="reset-heading" className={s.heading}>
            Reset allowances
          </h2>
          <p className={s.muted}>Restore selected allowances immediately.</p>
        </header>
        <fieldset disabled={busy}>
          <legend className={s.legend}>Scope</legend>
          <div className={s.scopeGrid}>
            {(["global", "user"] as const).map((value) => (
              <label key={value} className={s.choice}>
                <input
                  className={s.check}
                  type="radio"
                  name="quota-scope"
                  value={value}
                  checked={scope === value}
                  onChange={() => {
                    setScope(value);
                    clearFeedback();
                  }}
                />
                <span>
                  <span className={s.name}>
                    {value === "global" ? "Everyone" : "Specific user"}
                  </span>
                  <span className={s.muted}>
                    {value === "global"
                      ? "Reset selected allowances across all accounts."
                      : "Reset selected allowances for one account."}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {scope === "user" && (
          <label className={s.field}>
            User
            <span className={s.selectWrap}>
              <select
                className={s.control}
                ref={userSelect}
                value={selectedUser}
                disabled={busy}
                onChange={(event) => {
                  setSelectedUser(event.target.value);
                  clearFeedback();
                }}
              >
                <option value="">Select a user</option>
                {(users ?? []).map((user) => (
                  <option key={user.clerkId} value={user.clerkId}>
                    {user.name ?? user.username ?? user.email ?? user.clerkId}
                    {user.username ? ` (@${user.username})` : ""}
                  </option>
                ))}
              </select>
              <ChevronUpDownIcon aria-hidden="true" />
            </span>
          </label>
        )}
        <fieldset disabled={busy}>
          <legend className={s.legend}>Allowances</legend>
          <div className={s.allowances}>
            {(
              [
                ["experience", "Proxy time", "Daily Experience browsing time"],
                ["bot", "Bot usage", "Daily @bot messages"],
              ] as const
            ).map(([value, label, description], index) => (
              <div
                key={value}
                className={s.allowance}
                data-admin-reveal="opacity"
                data-delay={index * 80}
              >
                <div className={s.allowanceTop}>
                  <h3 className={s.subheading}>{label}</h3>
                  <p className={s.muted}>{description}</p>
                  <label className={s.checkLabel}>
                    <input
                      type="checkbox"
                      className={s.check}
                      checked={quotas.includes(value)}
                      onChange={() => toggleQuota(value)}
                    />
                    Include {label}
                  </label>
                </div>
                <p className={s.muted}>
                  {value === "experience"
                    ? quotas.includes(value)
                      ? "Active Experience sessions start a fresh allowance."
                      : "Proxy time will remain unchanged."
                    : quotas.includes(value)
                      ? "Bot usage will reset for the selected accounts."
                      : "Bot usage will remain unchanged."}
                </p>
              </div>
            ))}
          </div>
        </fieldset>
        <div className={s.review}>
          <div>
            <h3 className={s.subheading}>Review reset</h3>
            <p className={s.name}>
              {scope === "global"
                ? "Accounts: Everyone"
                : `Account: ${targetLabel ?? "Select a user"}`}
            </p>
            <p className={s.muted}>
              Allowances: {allowanceLabel || "None selected"}
            </p>
          </div>
          <button
            className={`${s.button} ${s.primary}`}
            type="button"
            disabled={
              busy || quotas.length === 0 || (scope === "user" && !target)
            }
            onClick={() => void submit()}
          >
            {busy ? "Resetting…" : "Reset allowances"}
          </button>
        </div>
        {quotas.length === 0 && (
          <p className={s.feedback}>Choose at least one allowance.</p>
        )}
        {scope === "user" && !target && (
          <p className={s.feedback}>Choose an account.</p>
        )}
        {notice && (
          <p role="status" className={s.status}>
            <CheckCircleIcon aria-hidden="true" />
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className={`${s.feedback} ${s.error}`}>
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
