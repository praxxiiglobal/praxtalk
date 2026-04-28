import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PraxTalk — Conversations that close themselves",
  description:
    "PraxTalk is the AI-native customer messaging platform. One inbox for live chat, email, WhatsApp, voice and in-app — with Atlas, an autonomous agent that resolves conversations end to end.",
  metadataBase: new URL("https://www.praxtalk.com"),
  openGraph: {
    title: "PraxTalk — Conversations that close themselves",
    description:
      "AI-native customer messaging. Six agents. One inbox. Zero hand-offs.",
    url: "https://www.praxtalk.com",
    siteName: "PraxTalk",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PraxTalk — Conversations that close themselves",
    description:
      "AI-native customer messaging. One inbox for chat, email, WhatsApp, voice and in-app — Atlas resolves the rest.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} antialiased`}
    >
      <body className="paper-grain min-h-screen bg-paper text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
