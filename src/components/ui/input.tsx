import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * The one text field.
 *
 * The same shell as `SelectTrigger`: `h-9`, `rounded-lg`, a hairline that
 * becomes the ring colour on focus with a one-pixel ring beside it, so a
 * field and a select in the same column are the same object. `bg-background`
 * rather than the surface it sits on, which is what makes a field read as a
 * well rather than a patch.
 *
 * Inside an `InputGroup` the field gives its chrome up to the group — the
 * group draws the border and takes the focus ring from anything inside it —
 * so an icon or a prefix can sit in the same box as the text.
 */
const fieldVariants = cva(
  "w-full min-w-0 rounded-lg border border-border bg-background text-[0.875rem] text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        default: "h-9 px-3",
        lg: "h-10 px-3.5",
      },
    },
    defaultVariants: { size: "default" },
  },
);

const groupedField =
  "in-data-[slot=input-group]:h-auto in-data-[slot=input-group]:flex-1 in-data-[slot=input-group]:rounded-none in-data-[slot=input-group]:border-0 in-data-[slot=input-group]:bg-transparent in-data-[slot=input-group]:px-0 in-data-[slot=input-group]:py-0 in-data-[slot=input-group]:focus-visible:ring-0";

function Input({
  className,
  size,
  ...props
}: Omit<ComponentProps<"input">, "size"> & VariantProps<typeof fieldVariants>) {
  return (
    <input
      data-slot="input"
      className={cn(fieldVariants({ size }), groupedField, className)}
      {...props}
    />
  );
}

/**
 * The field's box with room for company: an icon, a prefix, a key hint, a
 * button. Focus on anything inside lights the whole box.
 */
function InputGroup({
  className,
  size,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        fieldVariants({ size }),
        "flex items-center gap-2 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

/** A word or glyph beside the text in an `InputGroup`, set in the faint tone. */
function InputAddon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="input-addon"
      className={cn(
        "flex shrink-0 items-center text-[0.875rem] text-faint [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The same field, several lines tall. `resize-none` because the box's height
 * is the layout's decision, not the reader's: a composer grows itself, and a
 * code box is a fixed well.
 */
function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldVariants(),
        "h-auto min-h-24 resize-none py-2.5 leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Input, InputAddon, InputGroup, Textarea, fieldVariants };
