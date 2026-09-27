import { createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit";

export type ToastTone = "success" | "info" | "error";

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
}

const notificationsSlice = createSlice({
  name: "notifications",
  initialState: { toasts: [] as Toast[] },
  reducers: {
    notify: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts.push(action.payload);
      },
      prepare(message: string, tone: ToastTone = "success") {
        return { payload: { id: nanoid(), message, tone } };
      },
    },
    dismiss(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const { notify, dismiss } = notificationsSlice.actions;
export const notificationsReducer = notificationsSlice.reducer;
