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
        <div className="k-shell">
          <aside className="k-side">
            <Link href="/" className="k-wordmark">
              Internal Tools
            </Link>
            <div className="k-side-section">
              <p className="k-side-label">Operations</p>
              <Link href="/refunds" className="k-side-link">
                Refund queue
              </Link>
              <Link href="/refunds/approvals" className="k-side-link">
                Approvals
              </Link>
            </div>
            <div className="k-side-section">
              <p className="k-side-label">Platform</p>
              <Link href="/admin/change-request" className="k-side-link">
                Request a change
              </Link>
            </div>
            <span className="spacer" />
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
