"use client";

import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  HomeIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useRef, useState, type ReactNode } from "react";
import {
  ExperienceQuotaDonut,
  useExperienceQuota,
} from "@/components/app/experience-quota";
import { ExperienceAppIcon } from "@/components/app/experience-app-icon";
import { useStageFullscreen } from "@/components/app/use-stage-fullscreen";
import { Button } from "@/components/ui/button";
import type { ExperienceApp } from "@/lib/experience";
import { cn } from "@/lib/utils";

export type ExperienceService = ExperienceApp & { src: string | null };
type BrowserTab = { id: number; appId: string | null; run: number };

/** Each tab owns its frame. Switching tabs hides it without reloading it. */
export function ExperienceChrome({
  services,
  initialAppId,
}: {
  services: ExperienceService[];
  initialAppId?: string;
}) {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 0, appId: initialAppId ?? null, run: 0 },
  ]);
  const [activeId, setActiveId] = useState(0);
  const nextId = useRef(1);
  const stage = useRef<HTMLDivElement>(null);
  // One lease for the entire browser, including services in background tabs.
  const quota = useExperienceQuota(
    tabs.some((tab) =>
      services.some((service) => service.id === tab.appId && service.src),
    ),
  );
  const { full, canFull, toggleFull } = useStageFullscreen(stage);
  const active = tabs.find((tab) => tab.id === activeId)!;
  const app = services.find((service) => service.id === active.appId);

  function newTab() {
    const id = nextId.current++;
    setTabs((current) => [...current, { id, appId: null, run: 0 }]);
    setActiveId(id);
  }

  function closeTab(id: number) {
    const index = tabs.findIndex((tab) => tab.id === id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    if (!remaining.length) {
      const freshId = nextId.current++;
      setTabs([{ id: freshId, appId: null, run: 0 }]);
      setActiveId(freshId);
    } else {
      setTabs(remaining);
      if (activeId === id) {
        setActiveId(remaining[Math.min(index, remaining.length - 1)].id);
      }
    }
  }

  function openService(appId: string) {
    setTabs((current) =>
      current.map((tab) => (tab.id === activeId ? { ...tab, appId } : tab)),
    );
  }

  return (
    <div ref={stage} className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <div
          className="flex min-w-0 items-end overflow-x-auto"
          role="tablist"
          aria-label="Experience tabs"
        >
          {tabs.map((tab, index) => {
            const service = services.find((item) => item.id === tab.appId);
            const selected = tab.id === activeId;
            const label = service?.label ?? "Start";
            return (
              <div
                key={tab.id}
                className={cn(
                  "flex h-10 w-56 min-w-28 items-center rounded-t-xl pr-1",
                  selected ? "bg-surface" : "hover:bg-surface/50",
                )}
              >
                <button
                  id={`experience-tab-${tab.id}`}
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`experience-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveId(tab.id)}
                  onKeyDown={(event) => {
                    let target: BrowserTab | undefined;
                    if (event.key === "ArrowRight")
                      target = tabs[(index + 1) % tabs.length];
                    if (event.key === "ArrowLeft")
                      target = tabs[(index - 1 + tabs.length) % tabs.length];
                    if (event.key === "Home") target = tabs[0];
                    if (event.key === "End") target = tabs[tabs.length - 1];
                    if (target) {
                      event.preventDefault();
                      setActiveId(target.id);
                      document
                        .getElementById(`experience-tab-${target.id}`)
                        ?.focus();
                    }
                  }}
                  className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-t-xl px-3 text-sm outline-offset-[-3px] focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {service ? (
                    <ExperienceAppIcon
                      id={service.id}
                      className="size-4 shrink-0"
                    />
                  ) : (
                    <HomeIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{label}</span>
                </button>
                <button
                  onClick={() => closeTab(tab.id)}
                  aria-label={`Close ${label} tab`}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <XMarkIcon className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <ChromeButton label="New tab" onClick={newTab}>
          <PlusIcon className="size-4" />
        </ChromeButton>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
        <ChromeButton
          label="Start page"
          onClick={() => {
            const start = tabs.find((tab) => tab.appId === null);
            if (start) setActiveId(start.id);
            else newTab();
          }}
        >
          <HomeIcon className="size-4" />
        </ChromeButton>
        <ChromeButton
          label="Reload"
          disabled={!app}
          onClick={() =>
            setTabs((current) =>
              current.map((tab) =>
                tab.id === activeId ? { ...tab, run: tab.run + 1 } : tab,
              ),
            )
          }
        >
          <ArrowPathIcon className="size-4" />
        </ChromeButton>
        <div
          className="mx-1 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3 text-sm"
          title={app?.start ?? "Interoogle Start"}
        >
          {app ? (
            <LockClosedIcon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <MagnifyingGlassIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-muted-foreground">
            {app ? new URL(app.start).host : "Interoogle / Start"}
          </span>
        </div>
        <ExperienceQuotaDonut quota={quota} container={stage} />
        {canFull && (
          <ChromeButton
            label={full ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFull}
          >
            {full ? (
              <ArrowsPointingInIcon className="size-4" />
            ) : (
              <ArrowsPointingOutIcon className="size-4" />
            )}
          </ChromeButton>
        )}
      </div>

      <div className="relative min-h-0 flex-1 bg-surface">
        {tabs.map((tab) => {
          const service = services.find((item) => item.id === tab.appId);
          return (
            <div
              key={tab.id}
              id={`experience-panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`experience-tab-${tab.id}`}
              hidden={tab.id !== activeId}
              className="h-full"
            >
              {!service ? (
                <StartPage services={services} onOpen={openService} />
              ) : !service.src ? (
                <div
                  role="status"
                  className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground"
                >
                  This service is currently unavailable. Try another service
                  from a new tab.
                </div>
              ) : quota.allowed ? (
                <iframe
                  key={tab.run}
                  src={service.src}
                  title={`${service.label} — tab ${tab.id + 1}`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  allow="fullscreen; autoplay; encrypted-media"
                  referrerPolicy="no-referrer"
                  className="h-full w-full border-0 bg-white"
                />
              ) : (
                <div
                  role="status"
                  className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground"
                >
                  {quota.error
                    ? "Unable to check your daily time. Retrying…"
                    : quota.remaining === 0
                      ? "Your daily Experience time is used up. Come back after midnight UTC."
                      : !quota.visible
                        ? "Experience is paused while this tab is hidden."
                        : "Checking your daily Experience time…"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StartPage({
  services,
  onOpen,
}: {
  services: ExperienceService[];
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = services.filter((service) =>
    `${service.label} ${service.host}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-5 pt-[clamp(3rem,12vh,8rem)] pb-10">
      <h1
        aria-label="Interoogle"
        className="mb-8 text-[clamp(2.75rem,6vw,4.5rem)] leading-tight font-medium tracking-[-0.055em]"
      >
        {Array.from("Interoogle").map((letter, index) => (
          <span
            key={index}
            style={{
              color: [
                "#4285f4",
                "#ea4335",
                "#fbbc05",
                "#4285f4",
                "#34a853",
                "#ea4335",
              ][index % 6],
            }}
          >
            {letter}
          </span>
        ))}
      </h1>
      <form
        className="mb-8 flex w-full max-w-lg items-center gap-3 rounded-full border border-border bg-background px-5 py-3 shadow-sm focus-within:ring-2 focus-within:ring-ring/30"
        onSubmit={(event) => {
          event.preventDefault();
          if (shown.length === 1) onOpen(shown[0].id);
        }}
        role="search"
      >
        <MagnifyingGlassIcon className="size-5 shrink-0 text-muted-foreground" />
        <input
          aria-label="Find a service"
          placeholder="Find a service"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </form>
      <ul className="flex w-full max-w-xl flex-wrap justify-center gap-x-2 gap-y-3">
        {shown.map((service) => (
          <li key={service.id}>
            <button
              onClick={() => onOpen(service.id)}
              className="flex w-24 flex-col items-center gap-3 rounded-2xl px-2 py-3 text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:w-28"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-muted">
                <ExperienceAppIcon id={service.id} className="size-7" />
              </span>
              <span>{service.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {!shown.length && (
        <p className="text-sm text-muted-foreground">
          No services match “{query}”.
        </p>
      )}
    </div>
  );
}

function ChromeButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      shape="circle"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="shrink-0 text-foreground"
    >
      {children}
    </Button>
  );
}
