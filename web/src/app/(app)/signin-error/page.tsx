import type { Metadata } from "next";
import { Alert, ButtonLink, buttonClasses } from "@/components/ui";

export const metadata: Metadata = { title: "Sign-in problem" };

const MESSAGES: Record<string, string> = {
  expired: "The sign-in took too long or was opened in another tab. Please try again.",
  token_exchange: "We couldn't complete sign-in with the identity service. Please try again.",
  missing_code: "The sign-in response was incomplete. Please try again.",
};

export default async function SignInErrorPage({ searchParams }: PageProps<"/signin-error">) {
  const { reason } = await searchParams;
  const key = typeof reason === "string" ? reason : "";
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Alert tone="bad" title="Sign-in didn't work">
        {MESSAGES[key] ?? (key ? `The identity service said: ${key}` : "Something went wrong during sign-in.")}
      </Alert>
      <div className="flex gap-2">
        {/* A plain link: /auth/login is a route handler, not a page. */}
        <a href="/auth/login?returnTo=/wallet" className={buttonClasses()}>Try again</a>
        <ButtonLink href="/r" variant="secondary">Verify a receipt instead</ButtonLink>
      </div>
    </div>
  );
}
