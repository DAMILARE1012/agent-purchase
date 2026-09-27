import { useGetSessionQuery } from "../api";

/** The signed-in user (or a guest), plus convenience flags. */
export function useViewer() {
  const { data, isLoading } = useGetSessionQuery();
  const user = data?.user;
  return {
    user,
    isLoading,
    isSignedIn: Boolean(data?.authenticated),
    /** Keycloak username, e.g. "rita". */
    username: user?.handle.replace(/^@/, "") ?? "",
    hasWallet: Boolean(user?.accountId),
    isAnalyst: user?.role === "analyst",
    isOps: user?.role === "ops",
  };
}
