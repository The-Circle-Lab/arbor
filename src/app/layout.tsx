import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "@/lib/session";
import { InstructorCourseProvider } from "@/lib/instructor-context";
import { UserBar } from "@/components/UserBar";
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
  title: "Arbour",
  description: "Team alignment, made visible.",
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
        <SessionProvider>
          <InstructorCourseProvider>
            <UserBar />
            {children}
          </InstructorCourseProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
