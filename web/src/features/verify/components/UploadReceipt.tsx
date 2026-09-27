"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useReceiptScan } from "../hooks/useReceiptScan";
import { decodeQrFromFile } from "../lib/decodeQr";
import { extractToken } from "../lib/token";

export function UploadReceipt() {
  const { run } = useReceiptScan();
  const [decoding, setDecoding] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setDecoding(true);
    try {
      const text = await decodeQrFromFile(file);
      // A missing QR still goes to the server, which records the scan and answers no_qr.
      await run({ token: text ? extractToken(text) : null, source: "upload" });
    } finally {
      setDecoding(false);
    }
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor="receipt-image"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-crypto bg-crypto-bg" : "border-line-strong hover:bg-surface-2",
        )}
      >
        {decoding ? <Spinner /> : <span aria-hidden="true" className="font-display text-3xl">⬆</span>}
        <span className="font-semibold">{decoding ? "Reading the receipt…" : "Upload a receipt screenshot"}</span>
        <span className="text-sm text-muted">Drop an image here or choose one. PNG or JPG.</span>
        <input
          id="receipt-image"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0])}
        />
      </label>
      <p className="text-sm text-muted">
        We read the QR code in your browser and check the payment on the server. The AI image check compares the
        printed amount with the real one.
      </p>
    </div>
  );
}
