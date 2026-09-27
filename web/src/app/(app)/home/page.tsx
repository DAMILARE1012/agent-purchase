import type { Metadata } from "next";
import { RoleHomeRedirect } from "@/features/session";

export const metadata: Metadata = { title: "Signing in" };

/** Sign-in lands here, then each role goes to its own workspace. */
export default function HomePage() {
  return <RoleHomeRedirect />;
}
