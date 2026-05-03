// Run with: npm run migrate
import fs from "fs";
import path from "path";
import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set in .env.local");

const pool = new Pool({ connectionString: url });
const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: appliedRows } = await client.query<{ filename: string }>(
    "SELECT filename FROM _migrations",
  );
  const applied = new Set(appliedRows.map((r) => r.filename));

  const migrationsDir = path.join(process.cwd(), "db", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sqlText = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    await client.query(sqlText);
    await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
    await client.query("COMMIT");
    console.log(`apply ${file}`);
  }

  console.log("Migrations complete.");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  throw err;
} finally {
  client.release();
  await pool.end();
}
