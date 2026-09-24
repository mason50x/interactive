"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import { api } from "@convex/_generated/api";
import { useActivities } from "@/components/app/activities-provider";
import { Button } from "@/components/ui/button";
import { Input, InputAddon, InputGroup } from "@/components/ui/input";
import { Avatar } from "@/components/app/user-menu/avatar";
import { adminPageLabel } from "@/lib/admin-page-label";
import { cn } from "@/lib/utils";
import styles from "./admin.module.css";
import { AdminSelect } from "./admin-select";
import { AllowanceReset, UserControls } from "./user-controls";
import { useLiveUsers } from "./use-live-users";

export type DirectoryUser = FunctionReturnType<
  typeof api.timeouts.users
>["page"][number];
export type SiteRole = DirectoryUser["role"];
export const ROLE_LABEL: Record<SiteRole, string> = {
  ceo: "CEO",
  head_moderator: "Head Moderator",
  moderator: "Moderator",
  builder: "Builder",
  member: "Member",
};
// A span over hidden cells creates phantom columns in a fixed-layout table.
// Keep expanded rows aligned with the sm, md, and xl columns above them.
const COLUMN_BREAKPOINTS = [
  "(min-width: 40rem)",
  "(min-width: 48rem)",
  "(min-width: 64rem)",
  "(min-width: 80rem)",
];
function subscribeColumns(onChange: () => void) {
  const queries = COLUMN_BREAKPOINTS.map((query) => window.matchMedia(query));
  queries.forEach((query) => query.addEventListener("change", onChange));
  return () =>
    queries.forEach((query) => query.removeEventListener("change", onChange));
}
function visibleColumns() {
  return (
    2 +
    COLUMN_BREAKPOINTS.filter((query) => window.matchMedia(query).matches)
      .length
  );
}
function serverColumns() {
  return 6;
}

function AccountStatus({ user }: { user: DirectoryUser }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        user.timeout ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          user.timeout
            ? "bg-destructive"
            : user.ceoCleared
              ? "bg-primary"
              : "bg-muted-foreground",
        )}
      />
      {user.timeout ? "Timed out" : user.ceoCleared ? "CEO cleared" : "Allowed"}
    </span>
  );
}

function CurrentPage({
  label,
  path,
  loading,
}: {
  label?: string;
  path?: string;
  loading: boolean;
}) {
  return path && label ? (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 text-xs"
      title={path}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-success"
      />
      <span className="truncate">{label}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {!loading && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
        />
      )}
      {loading ? "Checking…" : "Offline"}
    </span>
  );
}

export function UserDirectory({ role }: { role: "ceo" | "head_moderator" }) {
  const columnCount = useSyncExternalStore(
    subscribeColumns,
    visibleColumns,
    serverColumns,
  );
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.timeouts.users,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 50 },
  );
  const activities = useActivities();
  const activityTitles = useMemo(
    () =>
      new Map(activities.map((activity) => [activity.slug, activity.title])),
    [activities],
  );
  const liveUsers = useLiveUsers();
  const currentPages = useMemo(
    () => new Map(liveUsers?.map((user) => [user.clerkId, user.currentPath])),
    [liveUsers],
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [showBulkReset, setShowBulkReset] = useState(false);
  const term = search.trim().toLowerCase();
  const hasFilter = Boolean(term) || filter !== "all";

  // Keep searching beyond the first page so filters cannot silently miss a user.
  useEffect(() => {
    if (hasFilter && status === "CanLoadMore") loadMore(50);
  }, [hasFilter, status, loadMore]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => setClosing(null), 360);
    return () => window.clearTimeout(timer);
  }, [closing]);

  function toggleUser(clerkId: string) {
    setClosing(selected);
    setSelected(selected === clerkId ? null : clerkId);
  }

  const filtered = results.filter((user) => {
    const matchesSearch = [
      user.label,
      user.username,
      user.email,
      user.clerkId,
    ].some((value) => value?.toLowerCase().includes(term));
    return (
      matchesSearch &&
      (filter === "all" ||
        (filter === "timed_out" ? Boolean(user.timeout) : user.role === filter))
    );
  });
  const searching =
    hasFilter && (status === "CanLoadMore" || status === "LoadingMore");

  return (
    <section aria-label="Users" className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="min-w-0 flex-1 basis-56 sm:max-w-md">
          <InputAddon>
            <MagnifyingGlassIcon />
          </InputAddon>
          <Input
            aria-label="Search users"
            placeholder={
              role === "ceo"
                ? "Search name, handle, or email"
                : "Search name or handle"
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
        <AdminSelect
          aria-label="Filter users"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All users</option>
          <option value="timed_out">Timed out</option>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </AdminSelect>
        {role === "ceo" && (
          <Button
            variant="ghost"
            className="max-w-full text-left whitespace-normal sm:ml-auto"
            aria-expanded={showBulkReset}
            aria-controls="bulk-allowances"
            onClick={() => setShowBulkReset(!showBulkReset)}
          >
            Reset all allowances
            <ChevronDownIcon
              className={cn(
                "size-4 transition-transform",
                showBulkReset && "rotate-180",
              )}
            />
          </Button>
        )}
      </div>
      {role === "ceo" && (
        <div
          id="bulk-allowances"
          className={styles.reveal}
          data-open={showBulkReset}
          aria-hidden={!showBulkReset}
          inert={!showBulkReset}
        >
          <div className={styles.revealContent}>
            <div className="mt-4 border-y border-border py-4">
              <AllowanceReset />
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">
            User directory. View a user to manage their role, timeout, and
            allowances.
          </caption>
          <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium sm:px-5">
                User
              </th>
              <th
                scope="col"
                className="hidden w-36 px-3 py-3 font-medium sm:table-cell"
              >
                Role
              </th>
              <th
                scope="col"
                className="hidden w-44 px-3 py-3 font-medium md:table-cell"
              >
                Current Page
              </th>
              <th
                scope="col"
                className="hidden w-36 px-3 py-3 font-medium lg:table-cell"
              >
                Account Status
              </th>
              <th
                scope="col"
                className="hidden w-32 px-3 py-3 font-medium xl:table-cell"
              >
                Joined
              </th>
              <th scope="col" className="w-10 px-1 py-3 sm:w-20 sm:px-3">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => {
              const expanded = selected === user.clerkId;
              const path = currentPages.get(user.clerkId);
              const pageLabel = path
                ? adminPageLabel(path, activityTitles)
                : undefined;
              return (
                <Fragment key={user.clerkId}>
                  <tr
                    className={cn(
                      "cursor-pointer border-b border-border last:border-0",
                      expanded
                        ? "border-l-2 border-l-foreground bg-muted/25"
                        : "hover:bg-muted/40",
                    )}
                    onClick={() => toggleUser(user.clerkId)}
                  >
                    <td className="px-4 py-3.5 sm:px-5">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`user-${user.clerkId}`}
                        className="flex w-full min-w-0 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Avatar
                          src={user.imageUrl}
                          name={user.label}
                          size={36}
                        />
                        <span className="block min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {user.label}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {user.username
                              ? `@${user.username}`
                              : (user.email ?? user.clerkId)}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 lg:hidden">
                            <span className="text-xs text-muted-foreground sm:hidden">
                              {ROLE_LABEL[user.role]}
                            </span>
                            <span className="md:hidden">
                              <CurrentPage
                                path={path}
                                label={pageLabel}
                                loading={liveUsers === undefined}
                              />
                            </span>
                            <AccountStatus user={user} />
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="hidden px-3 py-3.5 text-muted-foreground sm:table-cell">
                      {ROLE_LABEL[user.role]}
                    </td>
                    <td className="hidden px-3 py-3.5 md:table-cell">
                      <CurrentPage
                        path={path}
                        label={pageLabel}
                        loading={liveUsers === undefined}
                      />
                    </td>
                    <td className="hidden px-3 py-3.5 lg:table-cell">
                      <AccountStatus user={user} />
                    </td>
                    <td className="hidden px-3 py-3.5 text-xs text-muted-foreground xl:table-cell">
                      {new Date(user.joinedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-1 py-3.5 sm:px-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`${expanded ? "Close" : "View"} ${user.label}`}
                        aria-expanded={expanded}
                        aria-controls={`user-${user.clerkId}`}
                      >
                        <span className="hidden sm:inline">
                          {expanded ? "Close" : "View"}
                        </span>
                        <ChevronDownIcon
                          aria-hidden="true"
                          className={cn(
                            "size-4 sm:hidden",
                            !expanded && "-rotate-90",
                          )}
                        />
                      </Button>
                    </td>
                  </tr>
                  {(expanded || closing === user.clerkId) && (
                    <tr className="border-b border-border last:border-0">
                      <td colSpan={columnCount} className="bg-muted/20 p-0">
                        <div
                          id={`user-${user.clerkId}`}
                          className={styles.reveal}
                          data-open={expanded}
                          aria-hidden={!expanded}
                          inert={!expanded}
                        >
                          <div className={styles.revealContent}>
                            <div className="p-4 sm:p-5">
                              <UserControls
                                user={user}
                                isCeo={role === "ceo"}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-5 py-14 text-center text-muted-foreground"
                  role="status"
                >
                  {status === "LoadingFirstPage"
                    ? "Loading users…"
                    : searching
                      ? "Searching users…"
                      : results.length === 0
                        ? "No users yet."
                        : "No users match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(searching || status === "LoadingMore") && (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {searching ? "Searching more users…" : "Loading users…"}
        </p>
      )}
      {status === "CanLoadMore" && !hasFilter && (
        <Button
          className="mt-3"
          variant="outline"
          size="sm"
          onClick={() => loadMore(50)}
        >
          Load more users
        </Button>
      )}
    </section>
  );
}
