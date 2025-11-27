import { describe, test, expect, afterAll, beforeEach } from "bun:test";
import { Database } from "../lib/database";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURES_DIR = join(import.meta.dir, "fixtures", "migrations");

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "db-test-"));
}

function copyMigrations(destDir: string, count?: number): string {
  const migrationsDir = join(destDir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });

  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const filesToCopy = count ? files.slice(0, count) : files;

  for (const file of filesToCopy) {
    copyFileSync(join(FIXTURES_DIR, file), join(migrationsDir, file));
  }

  return migrationsDir;
}

describe("Database", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("initialization", () => {
    test("creates database and runs migrations", async () => {
      const migrationsDir = copyMigrations(tempDir);
      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      await db.initialize();

      // Check that migrations table exists
      const result = await db.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = '__migrations'
        ) as exists
      `);
      expect(result.rows[0].exists).toBe(true);

      await db.close();
    });

    test("is idempotent - can be called multiple times", async () => {
      const migrationsDir = copyMigrations(tempDir);
      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      await db.initialize();
      await db.initialize();
      await db.initialize();

      const history = await db.getMigrationHistory();
      expect(history.length).toBe(3); // Should still only have 3 migrations

      await db.close();
    });
  });

  describe("migrations", () => {
    test("applies all migrations in order", async () => {
      const migrationsDir = copyMigrations(tempDir);
      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      await db.initialize();

      const history = await db.getMigrationHistory();
      expect(history.length).toBe(3);
      expect(history[0].migration_name).toBe("001_initial.sql");
      expect(history[1].migration_name).toBe("002_add_tags.sql");
      expect(history[2].migration_name).toBe("003_add_comments.sql");

      await db.close();
    });

    test("creates tables from migrations", async () => {
      const migrationsDir = copyMigrations(tempDir);
      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      await db.initialize();

      // Check all expected tables exist
      const tables = ["users", "posts", "tags", "post_tags", "comments"];
      for (const tableName of tables) {
        const result = await db.query<{ exists: boolean }>(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = '${tableName}'
          ) as exists
        `);
        expect(result.rows[0].exists).toBe(true);
      }

      await db.close();
    });

    test("only runs pending migrations on subsequent starts", async () => {
      const migrationsDir = copyMigrations(tempDir, 2); // Only first 2 migrations
      const dataDir = join(tempDir, "data");

      // First run - apply first 2 migrations
      const db1 = new Database({ dataDir, migrationsPath: migrationsDir });
      await db1.initialize();

      let history = await db1.getMigrationHistory();
      expect(history.length).toBe(2);

      await db1.close();

      // Add the third migration
      copyFileSync(join(FIXTURES_DIR, "003_add_comments.sql"), join(migrationsDir, "003_add_comments.sql"));

      // Second run - should only apply third migration
      const db2 = new Database({ dataDir, migrationsPath: migrationsDir });
      await db2.initialize();

      history = await db2.getMigrationHistory();
      expect(history.length).toBe(3);
      expect(history[2].migration_name).toBe("003_add_comments.sql");

      await db2.close();
    });

    test("getPendingMigrations returns unapplied migrations", async () => {
      const migrationsDir = copyMigrations(tempDir, 1); // Only first migration
      const dataDir = join(tempDir, "data");

      const db = new Database({ dataDir, migrationsPath: migrationsDir });
      await db.initialize();

      // Add more migrations without running them
      copyFileSync(join(FIXTURES_DIR, "002_add_tags.sql"), join(migrationsDir, "002_add_tags.sql"));
      copyFileSync(join(FIXTURES_DIR, "003_add_comments.sql"), join(migrationsDir, "003_add_comments.sql"));

      const pending = await db.getPendingMigrations();
      expect(pending).toEqual(["002_add_tags.sql", "003_add_comments.sql"]);

      await db.close();
    });

    test("handles empty migrations directory", async () => {
      const migrationsDir = join(tempDir, "empty-migrations");
      mkdirSync(migrationsDir, { recursive: true });

      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      await db.initialize();

      const history = await db.getMigrationHistory();
      expect(history.length).toBe(0);

      await db.close();
    });

    test("ignores files without number prefix", async () => {
      const migrationsDir = join(tempDir, "migrations");
      mkdirSync(migrationsDir, { recursive: true });

      // Create valid migration
      writeFileSync(join(migrationsDir, "001_valid.sql"), "CREATE TABLE test1 (id SERIAL PRIMARY KEY);");

      // Create invalid files (no number prefix)
      writeFileSync(join(migrationsDir, "invalid.sql"), "CREATE TABLE test2 (id SERIAL PRIMARY KEY);");
      writeFileSync(join(migrationsDir, "readme.md"), "# Migrations");

      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      await db.initialize();

      const history = await db.getMigrationHistory();
      expect(history.length).toBe(1);
      expect(history[0].migration_name).toBe("001_valid.sql");

      await db.close();
    });
  });

  describe("query and exec", () => {
    test("can insert and query data", async () => {
      const migrationsDir = copyMigrations(tempDir);
      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      await db.initialize();

      // Insert a user
      await db.query("INSERT INTO users (email, name) VALUES ($1, $2)", ["alice@example.com", "Alice"]);

      // Query the user
      const result = await db.query<{ id: number; email: string; name: string }>("SELECT * FROM users WHERE email = $1", ["alice@example.com"]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe("Alice");
      expect(result.rows[0].email).toBe("alice@example.com");

      await db.close();
    });

    test("exec can run multiple statements", async () => {
      const migrationsDir = copyMigrations(tempDir);
      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      await db.initialize();

      await db.exec(`
        INSERT INTO users (email, name) VALUES ('user1@test.com', 'User 1');
        INSERT INTO users (email, name) VALUES ('user2@test.com', 'User 2');
      `);

      const result = await db.query<{ count: number }>("SELECT COUNT(*) as count FROM users");

      expect(result.rows[0].count).toBe(2);

      await db.close();
    });

    test("auto-initializes on first query", async () => {
      const migrationsDir = copyMigrations(tempDir);
      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      // Don't call initialize() - should auto-initialize
      const result = await db.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'users'
        ) as exists
      `);

      expect(result.rows[0].exists).toBe(true);

      await db.close();
    });
  });

  describe("foreign key constraints", () => {
    test("enforces foreign key constraints", async () => {
      const migrationsDir = copyMigrations(tempDir);
      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      await db.initialize();

      // Try to insert a post with non-existent user_id
      await expect(db.query("INSERT INTO posts (user_id, title) VALUES ($1, $2)", [999, "Test Post"])).rejects.toThrow();

      await db.close();
    });

    test("cascades deletes properly", async () => {
      const migrationsDir = copyMigrations(tempDir);
      const db = new Database({
        dataDir: join(tempDir, "data"),
        migrationsPath: migrationsDir,
      });

      await db.initialize();

      // Create user and post
      await db.query("INSERT INTO users (id, email, name) VALUES ($1, $2, $3)", [1, "test@test.com", "Test User"]);
      await db.query("INSERT INTO posts (user_id, title) VALUES ($1, $2)", [1, "Test Post"]);

      // Verify post exists
      let posts = await db.query<{ id: number }>("SELECT * FROM posts");
      expect(posts.rows.length).toBe(1);

      // Delete user - should cascade to posts
      await db.query("DELETE FROM users WHERE id = $1", [1]);

      // Verify post was deleted
      posts = await db.query<{ id: number }>("SELECT * FROM posts");
      expect(posts.rows.length).toBe(0);

      await db.close();
    });
  });
});
