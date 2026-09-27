"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/** Modal built on the native <dialog> element (focus trap and Escape for free). */
export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby={titleId}
      className="m-auto w-[min(100%-2rem,28rem)] rounded-lg border border-line bg-surface p-0 text-ink shadow-2xl"
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="font-display text-xl font-semibold">{title}</h2>
            {description && <div className="text-sm text-ink-2">{description}</div>}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
