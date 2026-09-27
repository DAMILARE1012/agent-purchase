"use client";

import { useState, type ChangeEvent } from "react";
import { Alert, Button, Card, ErrorState, Field, Icon, Input, LoadingState, Money, PageHeader, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { DEMO_MODE } from "@/lib/demo";
import type { CheckResult, ReceiptVerification } from "@/types/domain";
import { useVerifyReceiptQuery } from "../api";
import { setFragmentToken, useFragmentToken } from "../hooks/useFragmentToken";
import { decodeQrFromFile } from "../lib/decodeQr";
import { extractToken } from "../lib/token";
import { PurchaseStatusBadge } from "./PurchaseBits";

const MARK: Record<CheckResult, { icon: "check" | "close" | "alert" | "list"; className: string }> = {
  pass: { icon: "check", className: "bg-truth-bg text-truth" },
  fail: { icon: "close", className: "bg-bad-bg text-bad" },
  warn: { icon: "alert", className: "bg-ai-bg text-ai" },
  skipped: { icon: "list", className: "bg-surface-2 text-muted" },
};

/** Public page: anyone holding a purchase receipt can check it. */
export function ReceiptVerifier() {
  const token = useFragmentToken();
  const { data, error, isFetching } = useVerifyReceiptQuery(token ?? "", { skip: !token });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Verify a receipt"
        description="Check that a purchase was authorised by the shopper, allowed by the gate, and paid by the bank. No account needed."
      />
      {!token ? (
        <ReceiptInput />
      ) : isFetching ? (
        <LoadingState label="Checking the receipt…" />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : data ? (
        <Verdict result={data} />
      ) : null}
    </div>
  );
}

function ReceiptInput() {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);

  function check(value: string) {
    const found = extractToken(value);
    if (found) setFragmentToken(found);
    else setProblem("That doesn't contain a receipt. Paste the whole link or the code that starts with MG1.");
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecoding(true);
    setProblem(null);
    try {
      const decoded = await decodeQrFromFile(file);
      if (decoded) check(decoded);
      else setProblem("We couldn't find a QR code in that image. Try a sharper photo, or paste the receipt link.");
    } finally {
      setDecoding(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => { e.preventDefault(); check(text); }}
      >
        <div className="flex-1">
          <Field id="receipt" label="Receipt link or code" error={problem}>
            <Input id="receipt" value={text} onChange={(e) => { setText(e.target.value); setProblem(null); }} placeholder="https://…/verify#MG1…" />
          </Field>
        </div>
        <Button type="submit" disabled={!text.trim()}>Check</Button>
      </form>
      <label
        htmlFor="receipt-image"
        className="flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed border-line-strong px-6 py-6 text-center hover:bg-surface-2"
      >
        {decoding ? <Spinner /> : <Icon name="receipt" className="text-muted" />}
        <span className="font-semibold">{decoding ? "Reading the QR code…" : "Or upload a photo of the receipt's QR code"}</span>
        <input id="receipt-image" type="file" accept="image/*" className="sr-only" onChange={onFile} />
      </label>
      <p className="text-sm text-muted">The QR code is read in your browser. Only the receipt code is sent to be checked.</p>
      {DEMO_MODE && (
        <p className="text-sm text-ink-2">
          Sandbox: see a failure with a{" "}
          <button type="button" className="font-semibold text-crypto hover:underline" onClick={() => setFragmentToken("MG1.cF9mYWtl.not-a-real-signature")}>
            forged receipt
          </button>
          , or open a real one from a purchase page.
        </p>
      )}
    </Card>
  );
}

function Verdict({ result }: { result: ReceiptVerification }) {
  const p = result.purchase;
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-live="polite"
        className={cn("flex items-start gap-4 rounded-xl border-2 p-5", result.valid ? "border-truth bg-truth-bg" : "border-bad bg-bad-bg")}
      >
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-full bg-surface", result.valid ? "text-truth" : "text-bad")}>
          <Icon name={result.valid ? "check" : "close"} className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <p className={cn("font-mono text-xs font-semibold tracking-widest uppercase", result.valid ? "text-truth" : "text-bad")}>
            {result.valid ? "Genuine" : "Not valid"}
          </p>
          <h2 className="font-display text-2xl font-bold">{result.valid ? "This purchase was authorised and paid" : "Don't rely on this receipt"}</h2>
          <p className="text-ink-2">
            {result.valid
              ? "The shopper signed a mandate, the gate allowed this cart, and the bank transfer went through."
              : "It wasn't issued by the platform, or it was changed after it was issued."}
          </p>
        </div>
      </section>

      {p && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-sm text-muted">{p.sellerName}</span>
            <span className="font-semibold">{p.summary}</span>
            <span className="text-sm text-muted">Paid {formatDateTime(p.paidAt)}</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Money amountMinor={p.totalMinor} className="font-display text-3xl font-bold" />
            <PurchaseStatusBadge status={p.status} />
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-semibold">What we checked</h3>
        <ul className="flex flex-col divide-y divide-line">
          {result.checks.map((c) => (
            <li key={c.label} className="flex gap-3 py-2.5">
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", MARK[c.result].className)}>
                <Icon name={MARK[c.result].icon} className="size-3.5" />
              </span>
              <div className="flex flex-col">
                <span className="font-semibold">{c.label}</span>
                <span className="text-sm break-all text-ink-2">{c.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {p?.status === "refunded" && <Alert tone="ai">This purchase has since been refunded.</Alert>}
      <div>
        <Button variant="secondary" onClick={() => setFragmentToken(null)}>Check another receipt</Button>
      </div>
    </div>
  );
}
