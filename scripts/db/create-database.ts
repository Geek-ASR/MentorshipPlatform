import postgres from "postgres";
import { loadLocalEnv, requireEnv } from "../lib/load-env";

/** Local development helper: creates the database named in DATABASE_URL if it does not exist. */
loadLocalEnv();
const target = new URL(requireEnv("DATABASE_URL"));
const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ""));
if (!/^[a-z0-9_]+$/.test(databaseName)) {
  console.error(`Refusing to create database with unexpected name "${databaseName}".`);
  process.exit(1);
}

const adminUrl = new URL(target);
adminUrl.pathname = "/postgres";
const sql = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
try {
  const existing = await sql`select 1 from pg_database where datname = ${databaseName}`;
  if (existing.length === 0) {
    await sql.unsafe(`CREATE DATABASE "${databaseName}"`);
    console.log(`Created database ${databaseName}.`);
  } else {
    console.log(`Database ${databaseName} already exists.`);
  }
} finally {
  await sql.end();
}
