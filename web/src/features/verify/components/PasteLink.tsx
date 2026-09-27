"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import { useReceiptScan } from "../hooks/useReceiptScan";
import { extractToken } from "../lib/token";

export function PasteLink() {
  const { run, isLoading } = useReceiptScan();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = extractToken(value);
    if (!token) {
      setError("That doesn't look like a receipt link. It should contain “#RCPT1.”");
      return;
    }
    setError(null);
    run({ token, source: "paste" });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field id="receipt-link" label="Receipt link" hint="Paste the link the sender shared with you." error={error}>
        <Input
          id="receipt-link"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://…/r#RCPT1…"
          aria-invalid={Boolean(error)}
          className="font-mono text-sm"
        />
      </Field>
      <div>
        <Button type="submit" loading={isLoading} disabled={!value.trim()}>Check receipt</Button>
      </div>
    </form>
  );
}
