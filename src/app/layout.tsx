import type { Metadata, Viewport } from "next";
import { ViewTransition } from "react";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { LmsProvider } from "@/lib/lms-store";
import { RegisterSW } from "@/components/RegisterSW";
import { ErrorReporter } from "@/components/ErrorReporter";
import { TextSizeInit } from "@/components/Brand";
import { PlatformBanner } from "@/components/Platform";
import { SlideIndicator } from "@/components/SlideIndicator";
import { REAL_AUTH } from "@/lib/auth-mode";
import { FIRST_DATA } from "@/lib/first-data";
import { THEME_INIT } from "@/lib/theme";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassBARI — Run your online batches in one app",
  description: "Classes, fees, exams and parent updates for teachers and coaching centres in Bangladesh.",
  // Absolute URLs for the social preview image; set NEXT_PUBLIC_SITE_URL in production.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"), // || not ??: an empty line in .env.local means "not set"
  // iPhone "Add to Home Screen": full screen, with the icon of the app's subdomain (src/app/apple-touch-icon).
  appleWebApp: { capable: true, title: "ClassBARI", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon" },
};

export const viewport: Viewport = {
  themeColor: "#006a60",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {REAL_AUTH && <script dangerouslySetInnerHTML={{ __html: FIRST_DATA }} />}
      </head>
      <body suppressHydrationWarning>
        <LanguageProvider>
          <PlatformBanner />
          <LmsProvider>
            {/* iOS-style slide between pages (styles: .ios-page in globals.css); browsers without support just switch. */}
            <ViewTransition default="ios-page">{children}</ViewTransition>
          </LmsProvider>
          <RegisterSW />
          <ErrorReporter />
          <TextSizeInit />
          <SlideIndicator />
        </LanguageProvider>
      </body>
    </html>
  );
}
