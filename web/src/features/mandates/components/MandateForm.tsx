"use client";

import type { ReactNode } from "react";
import { Badge, Field, Input, MoneyInput, Select } from "@/components/ui";
import type { MandateLimits, MandateMode } from "@/types/domain";
import { fromLocalInput, toLocalInput, type LimitErrors } from "../lib/form";
import { POLICY_LABEL } from "../lib/limits";

interface MandateFormProps {
  limits: MandateLimits;
  mode: MandateMode;
  defaulted: Array<keyof MandateLimits>;
  errors: LimitErrors;
  onChange: (limits: MandateLimits) => void;
  /** The shopper's words behind each drafted value. */
  evidence?: Partial<Record<keyof MandateLimits, string>>;
}

/** Every limit Qwen drafted, editable. Fields it couldn't pin down are marked. */
export function MandateForm({ limits: l, mode, defaulted, errors, onChange, evidence = {} }: MandateFormProps) {
  const set = <K extends keyof MandateLimits>(key: K, value: MandateLimits[K]) => onChange({ ...l, [key]: value });
  const label = (text: string, field: keyof MandateLimits): ReactNode => (
    <span className="flex flex-wrap items-center gap-2">
      {text}
      {defaulted.includes(field) && <Badge tone="ai">Strictest default</Badge>}
      {evidence[field] && <span className="text-xs font-normal text-muted">from “{evidence[field]}”</span>}
    </span>
  );
  const describe = (id: string) => (errors[id as keyof MandateLimits] ? `${id}-error` : undefined);

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 font-display text-lg font-semibold">What to buy</legend>
        <Field id="item" label={label("Item", "item")} error={errors.item}>
          <Input id="item" value={l.item} onChange={(e) => set("item", e.target.value)} aria-invalid={!!errors.item} aria-describedby={describe("item")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="brand" label={label("Brand", "brand")} hint="Leave empty for any brand">
            <Input id="brand" value={l.brand ?? ""} onChange={(e) => set("brand", e.target.value.trim() ? e.target.value : null)} />
          </Field>
          <Field id="model" label={label("Model", "model")} hint="Must match exactly">
            <Input id="model" value={l.model ?? ""} onChange={(e) => set("model", e.target.value.trim() ? e.target.value.toUpperCase() : null)} />
          </Field>
          <Field id="quantity" label={label("Quantity", "quantity")} error={errors.quantity}>
            <Input id="quantity" type="number" min={1} value={l.quantity} onChange={(e) => set("quantity", Number(e.target.value))} aria-invalid={!!errors.quantity} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 font-display text-lg font-semibold">Money</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="maxTotalMinor" label={label(mode === "not_present" ? "Maximum per purchase" : "Maximum total", "maxTotalMinor")} hint="Including delivery" error={errors.maxTotalMinor}>
            <MoneyInput id="maxTotalMinor" valueMinor={l.maxTotalMinor || null} onChangeMinor={(v) => set("maxTotalMinor", v ?? 0)} aria-invalid={!!errors.maxTotalMinor} aria-describedby={describe("maxTotalMinor")} />
          </Field>
          <Field id="maxPerItemMinor" label="Maximum per item" hint="Optional" error={errors.maxPerItemMinor}>
            <MoneyInput id="maxPerItemMinor" valueMinor={l.maxPerItemMinor} onChangeMinor={(v) => set("maxPerItemMinor", v)} aria-invalid={!!errors.maxPerItemMinor} />
          </Field>
        </div>
        {mode === "not_present" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="periodCapMinor" label={label("Spending cap", "periodCapMinor")} error={errors.periodCapMinor}>
              <MoneyInput id="periodCapMinor" valueMinor={l.periodCapMinor} onChangeMinor={(v) => set("periodCapMinor", v)} aria-invalid={!!errors.periodCapMinor} />
            </Field>
            <Field id="period" label={label("Per", "period")}>
              <Select id="period" value={l.period ?? "week"} onChange={(e) => set("period", e.target.value as MandateLimits["period"])}>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </Select>
            </Field>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 font-display text-lg font-semibold">Sellers and delivery</legend>
        <Field id="sellerPolicy" label={label("Sellers", "sellerPolicy")} hint="Verified sellers have a checked legal name and bank account.">
          <Select id="sellerPolicy" value={l.sellerPolicy} onChange={(e) => set("sellerPolicy", e.target.value as MandateLimits["sellerPolicy"])}>
            <option value="verified_only">{POLICY_LABEL.verified_only}</option>
            <option value="verified_and_known">{POLICY_LABEL.verified_and_known}</option>
            {l.sellerPolicy === "listed" && <option value="listed">{POLICY_LABEL.listed}</option>}
          </Select>
        </Field>
        <Field id="deliveryCity" label={label("Deliver to", "deliveryCity")} hint="City; sellers quote delivery by city" error={errors.deliveryCity}>
          <Input id="deliveryCity" value={l.deliveryCity ?? ""} onChange={(e) => set("deliveryCity", e.target.value)} aria-invalid={!!errors.deliveryCity} className="sm:max-w-72" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="deliverBy" label={label("Deliver by", "deliverBy")} hint="Leave empty to accept any date" error={errors.deliverBy}>
            <Input id="deliverBy" type="datetime-local" value={toLocalInput(l.deliverBy)} onChange={(e) => set("deliverBy", fromLocalInput(e.target.value))} aria-invalid={!!errors.deliverBy} />
          </Field>
          <Field id="expiresAt" label={label("Mandate expires", "expiresAt")} error={errors.expiresAt}>
            <Input id="expiresAt" type="datetime-local" value={toLocalInput(l.expiresAt)} onChange={(e) => set("expiresAt", fromLocalInput(e.target.value) ?? l.expiresAt)} aria-invalid={!!errors.expiresAt} />
          </Field>
        </div>
        <Field id="maxUses" label={label("Number of purchases", "maxUses")} hint={mode === "present" ? "Once is safest for a one-off purchase" : undefined} error={errors.maxUses}>
          <Input id="maxUses" type="number" min={1} max={50} value={l.maxUses} onChange={(e) => set("maxUses", Number(e.target.value))} aria-invalid={!!errors.maxUses} className="sm:max-w-40" />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-3 font-display text-lg font-semibold">What the seller may see</legend>
        {([["name", "Your name"], ["phone", "Your phone number"], ["address", "Your delivery address"]] as const).map(([key, text]) => (
          <label key={key} className="flex items-center gap-3 text-ink">
            <input
              type="checkbox"
              className="size-4 accent-[var(--crypto)]"
              checked={l.shareDelivery[key]}
              onChange={(e) => set("shareDelivery", { ...l.shareDelivery, [key]: e.target.checked })}
            />
            {text}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
