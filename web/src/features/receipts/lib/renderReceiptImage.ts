import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Receipt } from "@/types/api";
import { qrCanvas } from "./qr";

const WIDTH = 720;
const HEIGHT = 1060;
const INK = "#161a26";
const MUTED = "#5e6577";

/**
 * Draws the shareable receipt image: printed details plus the signed QR.
 * The printed amount is what receipt vision reads to catch edited images.
 */
export async function renderReceiptImage(receipt: Receipt): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = MUTED;
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillText("SCAN-TO-CONFIRM · PAYMENT RECEIPT", 60, 90);

  ctx.fillStyle = INK;
  ctx.font = "700 72px system-ui, sans-serif";
  ctx.fillText(formatMoney(receipt.printed.amountMinor, receipt.printed.currency), 60, 190);

  const rows: Array<[string, string]> = [
    ["From", receipt.printed.payerMasked],
    ["To", receipt.printed.payeeMasked],
    ["Date", formatDateTime(receipt.printed.createdAt)],
    ["Receipt ID", receipt.tx],
  ];
  rows.forEach(([label, value], i) => {
    const y = 280 + i * 64;
    ctx.fillStyle = MUTED;
    ctx.font = "400 24px system-ui, sans-serif";
    ctx.fillText(label, 60, y);
    ctx.fillStyle = INK;
    ctx.font = label === "Receipt ID" ? "600 24px ui-monospace, monospace" : "600 26px system-ui, sans-serif";
    ctx.fillText(value, 240, y);
  });

  const qrSize = 380;
  const qr = await qrCanvas(receipt.url, qrSize);
  ctx.drawImage(qr, (WIDTH - qrSize) / 2, 560);

  ctx.fillStyle = MUTED;
  ctx.font = "400 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Scan with any phone camera to check this payment live.", WIDTH / 2, 990);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create image"))), "image/png"),
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
