import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ABES Engineering College - Academic Scheduling Portal",
  description: "Automated timetabling, workload configurations, and scheduling constraint engine.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Sleek top banner for ABES Engineering College */}
        <div className="w-full bg-gradient-to-r from-slate-950 via-indigo-950/30 to-slate-950 border-b border-white/5 py-1.5 text-center text-[10px] font-medium tracking-[0.25em] text-indigo-300/80 uppercase select-none">
          ABES Engineering College
        </div>
        {children}
      </body>
    </html>
  );
}
