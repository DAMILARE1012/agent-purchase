import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { ScanRequest } from "@/types/api";
import { SCAN_CACHE_KEY, useScanReceiptMutation } from "../api";
import { scanCleared, scanStarted } from "../verifySlice";

/**
 * The verify page's single source of truth: submit a receipt, read the
 * verdict, or start over. Every component that calls this shares one scan.
 */
export function useReceiptScan() {
  const dispatch = useAppDispatch();
  const { lastRequest, scenarioId } = useAppSelector((s) => s.verify);
  const [trigger, state] = useScanReceiptMutation({ fixedCacheKey: SCAN_CACHE_KEY });
  const { reset } = state;

  const run = useCallback(
    (request: ScanRequest, scenario: string | null = null) => {
      dispatch(scanStarted({ request, scenarioId: scenario }));
      return trigger(request);
    },
    [dispatch, trigger],
  );

  const clear = useCallback(() => {
    dispatch(scanCleared());
    reset();
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
  }, [dispatch, reset]);

  return {
    run,
    clear,
    result: state.data,
    error: state.error,
    isLoading: state.isLoading,
    isUninitialized: state.isUninitialized,
    lastRequest,
    scenarioId,
  };
}
