"use client";

import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ChartBarIcon } from "@heroicons/react/24/solid";
import { Button } from "@/components/ui/button";
import type { ChatPollDraft } from "@/lib/chat-drafts";

export function pollDraftError(poll: ChatPollDraft | null): string | null {
  if (poll === null) return null;
  const options = poll.options.map((option) => option.trim());
  if (options.some((option) => option === ""))
    return "Fill in every poll option.";
  if (
    new Set(options.map((option) => option.toLocaleLowerCase())).size !==
    options.length
  ) {
    return "Give each poll option a different answer.";
  }
  return null;
}

export function PollComposer({
  value,
  onChange,
  onCancel,
  disabled = false,
}: {
  value: ChatPollDraft;
  onChange: (value: ChatPollDraft) => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="mx-3 mt-3 space-y-2 rounded-2xl border border-border bg-background/60 p-3"
    >
      <legend className="sr-only">Poll options</legend>
      <div className="flex items-center gap-2">
        <ChartBarIcon className="size-4 text-foreground" />
        <span className="flex-1 text-sm font-semibold">Create a poll</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Remove poll"
          onClick={onCancel}
        >
          <XMarkIcon />
        </Button>
      </div>
      {value.options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`poll-option-${index}`}>
            Option {index + 1}
          </label>
          <input
            id={`poll-option-${index}`}
            value={option}
            maxLength={80}
            placeholder={`Option ${index + 1}`}
            onChange={(event) =>
              onChange({
                options: value.options.map((current, item) =>
                  item === index ? event.target.value : current,
                ),
              })
            }
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
          {value.options.length > 2 ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove option ${index + 1}`}
              onClick={() =>
                onChange({
                  options: value.options.filter((_, item) => item !== index),
                })
              }
            >
              <XMarkIcon />
            </Button>
          ) : null}
        </div>
      ))}
      {value.options.length < 6 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ options: [...value.options, ""] })}
        >
          <PlusIcon />
          Add option
        </Button>
      ) : null}
    </fieldset>
  );
}
