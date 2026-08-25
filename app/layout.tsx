import type { Metadata } from "next";
import Link from "next/link";
import "@kernel/ui/tokens.css";
import { getActor } from "@kernel/auth";

export const metadata: Metadata = {
  title: "Internal Tools",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  return (
    <html lang="en">
      <body>
        <nav className="k-nav">
          <strong>Internal Tools</strong>
          <Link href="/refunds">Refunds</Link>
          <Link href="/refunds/approvals">Approvals</Link>
          <Link href="/admin/change-request">Change request</Link>
          <span className="spacer" />
          {actor ? (
            <span className="who">
              {actor.email} · {actor.role}
            </span>
          ) : (
            <Link href="/api/auth/signin">Sign in</Link>
          )}
        </nav>
        {children}
      </body>
    </html>
  );
}
