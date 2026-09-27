import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ScanRequest } from "@/types/api";

export type InputTab = "upload" | "camera" | "paste";

interface VerifyState {
  /** The last receipt submitted, so it can be re-checked (e.g. after switching user). */
  lastRequest: ScanRequest | null;
  scenarioId: string | null;
  tab: InputTab;
}

const initialState: VerifyState = { lastRequest: null, scenarioId: null, tab: "upload" };

const verifySlice = createSlice({
  name: "verify",
  initialState,
  reducers: {
    scanStarted(state, action: PayloadAction<{ request: ScanRequest; scenarioId: string | null }>) {
      state.lastRequest = action.payload.request;
      state.scenarioId = action.payload.scenarioId;
    },
    scanCleared(state) {
      state.lastRequest = null;
      state.scenarioId = null;
    },
    tabChanged(state, action: PayloadAction<InputTab>) {
      state.tab = action.payload;
    },
  },
});

export const { scanStarted, scanCleared, tabChanged } = verifySlice.actions;
export const verifyReducer = verifySlice.reducer;
