import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";
import type { ApiError } from "@/types/api";

function isApiError(data: unknown): data is ApiError {
  return typeof data === "object" && data !== null && "message" in data && "error" in data;
}

/** Turns an RTK Query error into a sentence we can show to the user. */
export function errorMessage(error: FetchBaseQueryError | SerializedError | undefined): string | null {
  if (!error) return null;
  if ("status" in error) {
    if (isApiError(error.data)) return error.data.message;
    if (error.status === "FETCH_ERROR") return "We couldn't reach the server. Check your connection and try again.";
    return "Something went wrong. Please try again.";
  }
  return error.message ?? "Something went wrong. Please try again.";
}

export function errorCode(error: FetchBaseQueryError | SerializedError | undefined): string | null {
  if (error && "status" in error && isApiError(error.data)) return error.data.error;
  return null;
}
