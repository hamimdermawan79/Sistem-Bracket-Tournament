import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VrtXLab Tour Org - Bracket",
    template: "VrtXLab Tour Org - %s",
  },
  description: "Bagan turnamen PES / eFootball 128 besar. Live bracket, jadwal pertandingan, dan hasil.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
