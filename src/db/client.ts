import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Config } from "../config.js";
import * as schema from "./schema.js";

export const createDatabase = (config: Config) => {
  const client = postgres(config.DATABASE_URL, { max: 10, prepare: false });
  return { db: drizzle(client, { schema }), close: () => client.end() };
};

export type Database = ReturnType<typeof createDatabase>["db"];
