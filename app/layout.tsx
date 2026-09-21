import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Source Serif 4 for display type — the successor of the Source Serif Pro
// that iitpkd.ac.in sets its headings in — with its optical-size axis, so
// large headings get the display cut, and italics for the accent words.
// Plus Jakarta Sans for body and UI. next/font self-hosts both, so no request
// reaches Google from the visitor's browser.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "IIT Palakkad Guest House",
    template: "%s · IIT Palakkad Guest House",
  },
  description:
    "Rooms and meals at the IIT Palakkad guest houses, with online booking and approval for the institute community.",
  icons: {
    icon: "/iitpkd-logo.png",
    shortcut: "/iitpkd-logo.png",
    apple: "/iitpkd-logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${sourceSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
