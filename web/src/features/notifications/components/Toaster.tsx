"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { dismiss, type Toast } from "../notificationsSlice";

const TONE: Record<Toast["tone"], string> = {
  success: "border-truth bg-truth-bg text-ink",
  info: "border-crypto bg-crypto-bg text-ink",
  error: "border-bad bg-bad-bg text-ink",
};

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const timer = setTimeout(() => dispatch(dismiss(toast.id)), 5000);
    return () => clearTimeout(timer);
  }, [dispatch, toast.id]);

  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg", TONE[toast.tone])}>
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => dispatch(dismiss(toast.id))}
        className="text-muted hover:text-ink"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useAppSelector((s) => s.notifications.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto w-full max-w-md">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  );
}
