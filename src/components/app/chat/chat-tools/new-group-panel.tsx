"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { groupNameError } from "@/lib/chat";
import { api } from "@convex/_generated/api";

/** A name and a button. Everything else about a group is set from inside it. */
export function NewGroupPanel({
  open,
  onCreated,
}: {
  open: boolean;
  onCreated: (conversationId: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createGroup = useMutation(api.chat.conversations.createGroup);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const wanted = title.trim();
    if (wanted === "" || busy) return;

    setBusy(true);
    setError(null);
    const result = await createGroup({ title: wanted, joinPolicy: "invite" });
    setBusy(false);

    if (result.ok) {
      setTitle("");
      onCreated(result.conversationId);
      return;
    }
    setError(groupNameError(result.reason));
  }

  return (
    <form onSubmit={submit} className="pt-3">
      <div className="flex gap-2">
        <Input
          ref={field}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
          placeholder="What is it called"
          maxLength={40}
          autoComplete="off"
          aria-label="Group name"
          className="flex-1"
        />
        <Button
          type="submit"
          size="lg"
          disabled={busy || title.trim() === ""}
          className="shadow-none hover:shadow-none"
        >
          {busy ? "…" : "Create"}
        </Button>
      </div>

      {/* Only when something is wrong. The line that used to live here
          explained a group's invite policy to somebody who had not made one
          yet, and the panel is a field and a button. Styled like the people
          panel's notice, because it is the same kind of thing. */}
      {error === null ? null : <FieldError role="status">{error}</FieldError>}
    </form>
  );
}
