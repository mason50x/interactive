import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A sentence the reader has to see: something failed, or something is about
 * to. `role="alert"` is what has a screen reader say it without being asked.
 *
 * Two tones. `destructive` for an error, drawn in the colour with a faint
 * border and no fill, so it is read as a message and not a wall; `info` for
 * a note that is worth a box but not a colour.
 */
const alertVariants = cva("rounded-xl border p-4 text-sm", {
  variants: {
    tone: {
      destructive: "border-destructive/30 text-destructive",
      info: "border-border bg-surface text-muted-foreground",
    },
  },
  defaultVariants: { tone: "destructive" },
});

function Alert({
  className,
  tone,
  ...props
}: ComponentProps<"p"> & VariantProps<typeof alertVariants>) {
  return (
    <p
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ tone }), className)}
      {...props}
    />
  );
}

/** The one-line version, for an error beneath the field that caused it. */
function FieldError({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn("mt-2 text-[0.8125rem] text-destructive", className)}
      {...props}
    />
  );
}

export { Alert, FieldError, alertVariants };
