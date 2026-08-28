import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/internal_tools";

async function main() {
  const sql = postgres(url, { max: 1 });
  const dir = join(process.cwd(), "platform", "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    process.stdout.write(`applying ${file}... `);
    await sql.unsafe(readFileSync(join(dir, file), "utf8"));
    console.log("ok");
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
