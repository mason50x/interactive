"use client";

import { useRef, useState, type DragEvent } from "react";

/**
 * Files dragged over the thread and let go of.
 *
 * A picture can be dropped anywhere on the thread, not only on the box at
 * the bottom of it — the thread is the thing you are adding to — so the
 * handlers go on the whole pane and the files are handed to whoever asked.
 *
 * Whether something is being dragged over is counted rather than toggled,
 * because `dragleave` fires every time the pointer crosses into a child —
 * the overlay would flicker off over every message. Depth goes up on enter
 * and down on leave, and `dragging` is whether it is above zero.
 */
export function useDropFiles({
  enabled,
  onFiles,
}: {
  /** Whether a drop would be taken at all: pictures on, and a live day. */
  enabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  /** Whether a drag is something this would take. */
  function droppable(event: DragEvent) {
    return enabled && event.dataTransfer.types.includes("Files");
  }

  function onDragEnter(event: DragEvent) {
    if (!droppable(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(event: DragEvent) {
    if (!droppable(event)) return;
    // Without this the browser's default is to refuse the drop.
    event.preventDefault();
  }

  function onDragLeave(event: DragEvent) {
    if (!droppable(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent) {
    dragDepth.current = 0;
    setDragging(false);
    if (!droppable(event)) return;
    event.preventDefault();
    onFiles([...event.dataTransfer.files]);
  }

  return {
    dragging,
    handlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
