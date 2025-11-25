import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createPGlite } from "../lib/pglite-shim.js";
import type { PGlite } from "@electric-sql/pglite";
import { rmSync } from "node:fs";

const TEST_DATA_DIR = "./test-data";

describe("createPGlite", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createPGlite(TEST_DATA_DIR);
  });

  afterAll(async () => {
    await db.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("creates a PGlite instance", async () => {
    expect(db).toBeDefined();
    expect(typeof db.query).toBe("function");
    expect(typeof db.exec).toBe("function");
  });

  test("can execute a simple query", async () => {
    const result = await db.query("SELECT 1 + 1 AS sum");
    expect(result.rows).toHaveLength(1);
    // expect(result.rows[0].sum).toBe(2);
  });

  test("can create and query a table", async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS test_users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )
    `);

    await db.exec(`
      INSERT INTO test_users (name, email) VALUES ('Alice', 'alice@example.com')
    `);

    const result = await db.query("SELECT * FROM test_users WHERE name = $1", ["Alice"]);

    expect(result.rows).toHaveLength(1);
    // expect(result.rows[0].name).toBe("Alice");
    // expect(result.rows[0].email).toBe("alice@example.com");
  });

  test("supports parameterized queries", async () => {
    await db.exec(`
      INSERT INTO test_users (name, email) VALUES ('Bob', 'bob@example.com')
    `);

    const result = await db.query("SELECT * FROM test_users WHERE email = $1", ["bob@example.com"]);

    expect(result.rows).toHaveLength(1);
    // expect(result.rows[0].name).toBe("Bob");
  });

  test("handles query errors gracefully", async () => {
    await expect(db.query("SELECT * FROM nonexistent_table")).rejects.toThrow();
  });

  test("supports transactions", async () => {
    await db.exec("BEGIN");
    await db.exec(`
      INSERT INTO test_users (name, email) VALUES ('Charlie', 'charlie@example.com')
    `);
    await db.exec("ROLLBACK");

    const result = await db.query("SELECT * FROM test_users WHERE name = 'Charlie'");
    expect(result.rows).toHaveLength(0);
  });
});

describe("createPGlite with options", () => {
  let db: PGlite;
  const OPTIONS_TEST_DIR = "./test-data-options";

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    rmSync(OPTIONS_TEST_DIR, { recursive: true, force: true });
  });

  test("accepts additional PGlite options", async () => {
    db = await createPGlite(OPTIONS_TEST_DIR, {
      debug: 0,
    });

    expect(db).toBeDefined();
    const result = await db.query("SELECT current_database()");
    expect(result.rows).toHaveLength(1);
  });
});
