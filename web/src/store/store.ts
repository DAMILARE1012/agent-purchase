import { configureStore } from "@reduxjs/toolkit";
import { notificationsReducer } from "@/features/notifications/notificationsSlice";
import { verifyReducer } from "@/features/verify/verifySlice";
import { api } from "./api";

export function makeStore() {
  return configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      notifications: notificationsReducer,
      verify: verifyReducer,
    },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
