import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "San Francisco Market Pulse",
  description:
    "A cinematic view of typical home values and recorded residential transfers across featured San Francisco neighborhoods.",
  openGraph: {
    title: "San Francisco Market Pulse",
    description:
      "Explore typical home values and recorded residential transfers across 18 San Francisco neighborhoods.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "San Francisco Market Pulse",
    description:
      "Explore typical home values and recorded residential transfers across 18 San Francisco neighborhoods.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
