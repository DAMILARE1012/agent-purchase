import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import { Toaster } from "@/features/notifications";
import { StoreProvider } from "@/store/StoreProvider";
import "./globals.css";

const heading = Bricolage_Grotesque({ variable: "--font-heading", subsets: ["latin"], weight: ["600", "700"] });
const body = Source_Sans_3({ variable: "--font-body", subsets: ["latin"] });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Mandate Gate", template: "%s · Mandate Gate" },
  description: "Let AI shop for you, within limits you sign. A gate outside the AI decides what gets paid.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${code.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <StoreProvider>
          {children}
          <Toaster />
        </StoreProvider>
      </body>
    </html>
  );
}
