"use client";

import { Popover } from "@base-ui/react/popover";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Monogram } from "./monogram";
import { OptionTiles } from "./option-tiles";
import { AVATAR_EMOJI, AVATAR_HUES, MAX_INITIALS } from "@/lib/chat";
import { cn } from "@/lib/utils";

export type Face = { emoji?: string; initials?: string; hue?: number };

/** Shared picker. Account pictures are direct Clerk URLs; groups use emoji or text. */
export function FaceEditor({ name, label, face, imageUrl, account, onChange, children }: {
  name: string;
  label: string;
  face: Face;
  imageUrl?: string;
  account?: { selected: boolean; onSelect: () => void };
  onChange: (face: Face) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [letters, setLetters] = useState(face.initials ?? "");
  const [customMode, setCustomMode] = useState<"emoji" | "text">(face.initials ? "text" : "emoji");
  const mode = account?.selected ? "account" : customMode;
  return (
    <Popover.Root open={open} onOpenChange={next => { if (next) setLetters(face.initials ?? ""); setOpen(next); }}>
      <div className="flex items-center gap-3">
        <Popover.Trigger aria-label={`Edit ${label}`} className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Monogram handle={name} imageUrl={imageUrl} emoji={face.emoji} initials={face.initials} hue={face.hue} className="size-12 text-lg" />
        </Popover.Trigger>
        {children}
      </div>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={8} className="z-50">
          <Popover.Popup className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl">
            <Popover.Title className="mb-2 text-sm font-semibold">Picture</Popover.Title>
            <OptionTiles value={mode} onPick={(next: "account" | "emoji" | "text") => {
              if (next === "account") account?.onSelect();
              else {
                setCustomMode(next);
                if (next === "text") setLetters(face.initials ?? name.slice(0, 1).replace(/[^a-z0-9]/gi, ""));
                onChange({ hue: face.hue, ...(next === "text" ? { initials: face.initials ?? name.slice(0, 1).replace(/[^a-z0-9]/gi, "") } : { emoji: face.emoji ?? AVATAR_EMOJI[0] }) });
              }
            }} className={cn("grid gap-1", account ? "grid-cols-3" : "grid-cols-2")} options={[
              ...(account ? [{ value: "account" as const, label: "Account" }] : []),
              { value: "emoji" as const, label: "Emoji" },
              { value: "text" as const, label: "Text" },
            ]} />
            {mode === "account" ? <p className="my-3 text-xs text-muted-foreground">Uses your account profile picture. Change it in account settings.</p> : mode === "emoji" ? (
              <div className="my-3 grid grid-cols-8 gap-1">
                {AVATAR_EMOJI.map(emoji => <button key={emoji} type="button" aria-label={emoji} aria-pressed={face.emoji === emoji} onClick={() => onChange({ hue: face.hue, emoji })} className={cn("rounded-lg p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", face.emoji === emoji && "bg-primary/15")}>{emoji}</button>)}
              </div>
            ) : <input aria-label="Text on the picture" value={letters} maxLength={MAX_INITIALS} onChange={event => { const initials = event.target.value.replace(/[^a-z0-9]/gi, ""); setLetters(initials); onChange({ hue: face.hue, initials }); }} className="my-3 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />}
            {mode !== "account" && <div className="my-3 flex flex-wrap gap-1.5" aria-label="Background colour">
              {AVATAR_HUES.map(hue => <button key={hue} type="button" aria-label={`Colour ${hue}`} aria-pressed={face.hue === hue} onClick={() => onChange({ ...face, hue })} style={{ "--monogram-hue": hue } as CSSProperties} className={cn("monogram size-6 rounded-full border-2 focus-visible:ring-2 focus-visible:ring-ring", face.hue === hue ? "border-primary" : "border-transparent")} />)}
            </div>}
            <div className="flex justify-between"><Button variant="ghost" size="sm" onClick={() => account ? account.onSelect() : onChange({})}>Reset</Button><Button size="sm" onClick={() => setOpen(false)}>Done</Button></div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
