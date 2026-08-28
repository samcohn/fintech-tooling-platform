import type { Metadata } from "next";
import Link from "next/link";

import { GeistSans } from "geist/font/sans";
import { Newsreader } from "next/font/google";
import "@platform/ui/tokens.css";
import { getActor } from "@platform/auth";
import { SideNav } from "./nav";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Internal tools",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${newsreader.variable}`}
    >
      <body>
        <div className="k-shell">
          <aside className="k-side">
            <SideNav />
            <span className="spacer" />
            <Link href="/platform/requests" className="k-cr-btn">
              Request a change
            </Link>
            <div className="k-who">
              {actor ? (
                <>
                  <strong>{actor.name}</strong>
                  {actor.email} · {actor.role}
                </>
              ) : (
                <Link href="/api/auth/signin">Sign in</Link>
              )}
            </div>
          </aside>
          <div>{children}</div>
        </div>
      </body>
    </html>
  );
}
