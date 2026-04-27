import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MatthewsGraphqlProvider } from "@/lib/matthews-graphql";
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
  title: "Next.js Reference Implementation",
  description: "Reference Next.js app with Okta auth and GraphQL API access",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MatthewsGraphqlProvider>{children}</MatthewsGraphqlProvider>
      </body>
    </html>
  );
}
