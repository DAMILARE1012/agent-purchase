"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { notify } from "@/features/notifications";
import { useAppDispatch } from "@/store/hooks";
import type { Receipt } from "@/types/api";
import { downloadBlob, renderReceiptImage } from "../lib/renderReceiptImage";

const noSubscribe = () => () => {};

export function ShareActions({ receipt }: { receipt: Receipt }) {
  const dispatch = useAppDispatch();
  const [downloading, setDownloading] = useState(false);
  // False on the server, real value in the browser, without a hydration mismatch.
  const canShare = useSyncExternalStore(noSubscribe, () => typeof navigator.share === "function", () => false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(receipt.url);
      dispatch(notify("Receipt link copied."));
    } catch {
      dispatch(notify("Couldn't copy automatically. Select the link and copy it.", "error"));
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Payment receipt", text: "Check this payment live:", url: receipt.url });
    } catch {
      // Cancelled by the user.
    }
  }

  async function download() {
    setDownloading(true);
    try {
      downloadBlob(await renderReceiptImage(receipt), `receipt-${receipt.tx}.png`);
    } catch {
      dispatch(notify("Couldn't create the receipt image.", "error"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={copyLink}>Copy link</Button>
      {canShare && <Button size="sm" variant="secondary" onClick={share}>Share…</Button>}
      <Button size="sm" variant="secondary" onClick={download} loading={downloading}>Download image</Button>
      <a href={receipt.url} className="inline-flex h-8 items-center px-2 text-sm font-semibold text-crypto underline-offset-2 hover:underline">
        Open verify page
      </a>
    </div>
  );
}
