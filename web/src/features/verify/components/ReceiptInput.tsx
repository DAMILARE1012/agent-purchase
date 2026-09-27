"use client";

import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { tabChanged, type InputTab } from "../verifySlice";
import { CameraScanner } from "./CameraScanner";
import { PasteLink } from "./PasteLink";
import { UploadReceipt } from "./UploadReceipt";

const TABS: Array<{ id: InputTab; label: string }> = [
  { id: "upload", label: "Upload screenshot" },
  { id: "camera", label: "Scan with camera" },
  { id: "paste", label: "Paste link" },
];

/** Three ways to hand us a receipt. */
export function ReceiptInput() {
  const dispatch = useAppDispatch();
  const tab = useAppSelector((s) => s.verify.tab);

  return (
    <Card className="flex flex-col gap-5">
      <div role="tablist" aria-label="How to check the receipt" className="flex flex-wrap gap-1 rounded-md bg-surface-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => dispatch(tabChanged(t.id))}
            className={cn(
              "flex-1 rounded px-3 py-1.5 text-sm font-semibold transition-colors",
              tab === t.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "upload" && <UploadReceipt />}
        {tab === "camera" && <CameraScanner />}
        {tab === "paste" && <PasteLink />}
      </div>
    </Card>
  );
}
