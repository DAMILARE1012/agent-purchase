import { buttonClasses } from "@/components/ui";

/** A plain form POST, so the server can clear the httpOnly session cookie and redirect to Keycloak. */
export function SignOutButton({ label = "Sign out", variant = "secondary" }: { label?: string; variant?: "secondary" | "ghost" | "primary" }) {
  return (
    <form method="post" action="/auth/logout">
      <button type="submit" className={buttonClasses(variant, "sm")}>{label}</button>
    </form>
  );
}
