"use client";

import { useEffect, useState } from "react";
import { qrSvg } from "../lib/qr";

export function ReceiptQr({ value, size = 184 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    qrSvg(value).then((s) => !cancelled && setSvg(s));
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label="Receipt QR code. Scan it to check this payment."
      style={{ width: size, height: size }}
      className="shrink-0 rounded-md bg-white p-1.5 [&>svg]:size-full"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
