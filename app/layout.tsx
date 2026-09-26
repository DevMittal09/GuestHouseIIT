import type { Metadata } from "next";
import { Geist_Mono, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Source Serif for headings, as on iitpkd.ac.in (which uses Source Serif Pro,
// the predecessor of Source Serif 4), and Source Sans 3 for body and UI.
// Source Serif 4 is loaded with its optical-size axis, so display-size
// headings get the display cut and small ones the text cut. next/font
// self-hosts both, so no request reaches Google from the visitor's browser.
const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
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
      className={`${sourceSans.variable} ${sourceSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
