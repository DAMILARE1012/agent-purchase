"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Dialog, Field, Textarea } from "@/components/ui";
import { notify } from "@/features/notifications";
import { errorMessage } from "@/lib/api-error";
import { useAppDispatch } from "@/store/hooks";
import { useOpenDisputeMutation } from "../api";

interface DisputeDialogProps {
  open: boolean;
  onClose: () => void;
  tx?: string;
  scanId?: string;
}

export function DisputeDialog({ open, onClose, tx, scanId }: DisputeDialogProps) {
  const dispatch = useAppDispatch();
  const [reason, setReason] = useState("");
  const [openDispute, { isLoading, error, reset }] = useOpenDisputeMutation();

  function close() {
    setReason("");
    reset();
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await openDispute({ tx, scanId, reason });
    if ("data" in result) {
      dispatch(notify("We've opened a case. A member of our team will review it."));
      close();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Report a problem"
      description="Tell us what happened. A person on our risk team reviews every report."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="dispute-reason" label="What went wrong?">
          <Textarea
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: they said they paid $250 but I only received $25."
            maxLength={500}
          />
        </Field>
        {error && <Alert tone="bad" title="Report not sent">{errorMessage(error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" loading={isLoading} disabled={!reason.trim()}>Send report</Button>
        </div>
      </form>
    </Dialog>
  );
}
