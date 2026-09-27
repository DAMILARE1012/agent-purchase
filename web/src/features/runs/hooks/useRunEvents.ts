"use client";

import { useEffect, useState } from "react";
import { api } from "@/store/api";
import { useAppDispatch } from "@/store/hooks";
import type { AgentRun } from "@/types/domain";
import { runsApi } from "../api";
import { isActiveRun } from "../lib/labels";

/**
 * Follows a run live over server-sent events (GET /api/v1/runs/:id/events) and
 * writes each update into the RTK Query cache, so every component showing the
 * run re-renders. Returns whether the stream is connected; callers fall back to
 * polling when it isn't (for example, while the mock API serves runs).
 */
export function useRunEvents(runId: string, enabled: boolean): boolean {
  const dispatch = useAppDispatch();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/v1/runs/${encodeURIComponent(runId)}/events`);
    source.addEventListener("open", () => setConnected(true));
    source.addEventListener("run", (event) => {
      const run = JSON.parse((event as MessageEvent<string>).data) as AgentRun;
      dispatch(runsApi.util.upsertQueryData("getRun", runId, run));
      if (!isActiveRun(run)) {
        // The server ends the stream here; close so the browser doesn't reconnect.
        source.close();
        setConnected(false);
        dispatch(api.util.invalidateTags([{ type: "Run", id: "LIST" }, { type: "Mandate", id: run.mandateId }]));
      }
    });
    source.addEventListener("error", () => {
      source.close();
      setConnected(false);
    });
    return () => source.close();
  }, [runId, enabled, dispatch]);

  return connected;
}
