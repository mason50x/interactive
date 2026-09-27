"use client";

import {
  useContext,
  useLayoutEffect,
  useRef,
  type ComponentProps,
} from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { MinusIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";

/**
 * shadcn's one-time-code field, dressed as `Input`: the same hairline, the
 * same `bg-background` well, and the ring colour on the active slot.
 *
 * The active slot is not drawn by the slot. One box, `FocusBox`, sits over the
 * row and glides to whichever slot is active. Neighbouring slots share a
 * border, so a ring drawn by the slot itself lands on one side of that shared
 * line and not the other, and it would jump rather than travel.
 */
function InputOTP({
  className,
  containerClassName,
  children,
  ...props
}: Extract<ComponentProps<typeof OTPInput>, { render?: undefined }> & {
  containerClassName?: string;
}) {
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "relative flex items-center gap-2 has-disabled:opacity-50",
        containerClassName,
      )}
      spellCheck={false}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    >
      {children}
      <FocusBox invalid={invalid} />
    </OTPInput>
  );
}

/**
 * Measured, not laid out: its box is the active slot's box — or, with a
 * selection, the run of selected slots — widened by the one-pixel border the
 * slot shares with its left neighbour, and its corners are that slot's
 * corners, so it is square in the middle of a group and round at its ends.
 */
function FocusBox({ invalid }: { invalid: boolean }) {
  const context = useContext(OTPInputContext);
  const ref = useRef<HTMLDivElement>(null);
  const active = context.slots.flatMap((slot, index) =>
    slot.isActive ? [index] : [],
  );
  const first = active[0];
  const last = active.at(-1);

  useLayoutEffect(() => {
    const box = ref.current;
    const container = box?.parentElement;
    if (!box || !container) return;

    const place = () => {
      const slots = container.querySelectorAll<HTMLElement>(
        '[data-slot="input-otp-slot"]',
      );
      const start = first === undefined ? undefined : slots[first];
      const end = last === undefined ? undefined : slots[last];
      if (!start || !end) {
        box.dataset.visible = "false";
        return;
      }
      const origin = container.getBoundingClientRect();
      const from = start.getBoundingClientRect();
      const to = end.getBoundingClientRect();
      const startStyle = getComputedStyle(start);
      const endStyle = getComputedStyle(end);
      const sharedEdge = parseFloat(startStyle.borderLeftWidth) === 0 ? 1 : 0;

      // Coming back from hidden, appear in place rather than sliding in from
      // wherever the box was last.
      box.dataset.glide = box.dataset.visible === "true" ? "true" : "false";
      box.style.transform = `translate(${from.left - origin.left - sharedEdge}px, ${from.top - origin.top}px)`;
      box.style.width = `${to.right - from.left + sharedEdge}px`;
      box.style.height = `${from.height}px`;
      box.style.borderTopLeftRadius = startStyle.borderTopLeftRadius;
      box.style.borderBottomLeftRadius = startStyle.borderBottomLeftRadius;
      box.style.borderTopRightRadius = endStyle.borderTopRightRadius;
      box.style.borderBottomRightRadius = endStyle.borderBottomRightRadius;
      box.dataset.visible = "true";
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(container);
    return () => observer.disconnect();
  }, [first, last]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-visible="false"
      data-glide="false"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-10 rounded-lg border-2 opacity-0 transition-opacity duration-150 data-[visible=true]:opacity-100",
        "data-[glide=true]:transition-[transform,width,opacity,border-radius,border-color] data-[glide=true]:duration-200 data-[glide=true]:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        invalid ? "border-destructive" : "border-ring",
      )}
    />
  );
}

function InputOTPGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center", className)}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: ComponentProps<"div"> & { index: number }) {
  const context = useContext(OTPInputContext);
  const { char, hasFakeCaret } = context?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      className={cn(
        "relative flex size-11 items-center justify-center border-y border-r border-border bg-background text-lg font-medium text-foreground tabular-nums transition-colors first:rounded-l-lg first:border-l last:rounded-r-lg aria-invalid:border-destructive",
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-[caret-blink_1s_ease-out_infinite] bg-foreground motion-reduce:animate-none" />
        </div>
      )}
    </div>
  );
}

function InputOTPSeparator(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-separator"
      className="flex items-center text-muted-foreground"
      role="separator"
      {...props}
    >
      <MinusIcon className="size-4" />
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
