"use client";

import { Field, Select } from "@/components/ui";
import { useGetBanksQuery } from "../api";

interface BankSelectProps {
  id?: string;
  value: string;
  onChange: (bankCode: string) => void;
  error?: string | null;
  label?: string;
  /** Only banks other than this platform (e.g. for simulating an incoming transfer). */
  externalOnly?: boolean;
}

export function BankSelect({ id = "bank", value, onChange, error, label = "Bank", externalOnly = false }: BankSelectProps) {
  const { data: banks = [], isLoading } = useGetBanksQuery();
  const platform = banks.filter((b) => b.isPlatform);
  const others = banks.filter((b) => !b.isPlatform);

  return (
    <Field id={id} label={label} error={error}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading} aria-invalid={Boolean(error)}>
        <option value="">{isLoading ? "Loading banks…" : "Choose a bank"}</option>
        {!externalOnly && platform.length > 0 && (
          <optgroup label="On this platform">
            {platform.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </optgroup>
        )}
        <optgroup label="Other banks">
          {others.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </optgroup>
      </Select>
    </Field>
  );
}
