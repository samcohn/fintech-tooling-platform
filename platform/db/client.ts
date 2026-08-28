import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/internal_tools";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

export const sql = global.__sql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") global.__sql = sql;

export const db = drizzle(sql, { schema });
