import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users, type Role, type User } from "../db/schema";

export type Actor = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/**
 * Auth.js configuration. In production this is an OIDC provider; the
 * demo uses a credentials provider against the seeded user table so the
 * flow works without an IdP. Role is ALWAYS resolved server-side from
 * the users table — never from the client or the token payload.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Demo SSO",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        if (!email) return null;
        const row = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (!row) return null;
        return { id: row.id, email: row.email, name: row.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
};

/**
 * Resolve the acting user, including role, from the database. This is
 * the only place role resolution happens; request input never
 * participates.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const row: User | undefined = await db.query.users.findFirst({
    where: eq(users.id, id),
  });
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new Error("unauthenticated");
  return actor;
}
