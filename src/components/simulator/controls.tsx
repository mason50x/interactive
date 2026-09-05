import type { Input } from "@/lib/simulator/types";
import { Button } from "@/components/ui/button";
export function TouchControls({
  input,
  disabled,
}: {
  input: (key: Input, down: boolean) => void;
  disabled: boolean;
}) {
  const key = (name: Input, label: string, className = "") => (
    <Button
      key={name}
      variant="outline"
      className={`h-12 min-w-12 touch-none select-none ${className}`}
      disabled={disabled}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        input(name, true);
      }}
      onPointerUp={() => input(name, false)}
      onPointerCancel={() => input(name, false)}
      onLostPointerCapture={() => input(name, false)}
    >
      {label}
    </Button>
  );
  return (
    <div className="mx-auto flex w-full max-w-md items-center justify-between gap-5 py-5">
      <div className="grid grid-cols-3 gap-1">
        {key("up", "↑", "col-start-2")}
        {key("left", "←", "row-start-2")}
        {key("down", "↓", "row-start-2")}
        {key("right", "→", "row-start-2")}
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-2">
          {key("B", "B")}
          {key("A", "A")}
        </div>
        <div className="flex gap-2">
          {key("select", "Select", "h-8 text-xs")}
          {key("start", "Start", "h-8 text-xs")}
        </div>
      </div>
    </div>
  );
}
