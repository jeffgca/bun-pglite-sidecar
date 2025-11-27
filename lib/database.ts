import { createPGlite } from "./pglite-shim.js";
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface DatabaseConfig {
  dataDir: string;
  migrationsPath: string;
}

interface MigrationRecord {
  id: number;
  migration_name: string;
  applied_at: Date;
}

const MIGRATIONS_TABLE = "__migrations";

export class Database {
  private db: PGlite | null = null;
  private initialized = false;
  private readonly config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.db = await createPGlite(this.config.dataDir);
    await this.runMigrations();
    this.initialized = true;
  }

  private async ensureMigrationsTable(): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id SERIAL PRIMARY KEY,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private async getAppliedMigrations(): Promise<Set<string>> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const result = await this.db.query<MigrationRecord>(`SELECT migration_name FROM ${MIGRATIONS_TABLE} ORDER BY id`);

    return new Set(result.rows.map((row) => row.migration_name));
  }

  private getMigrationFiles(): string[] {
    const { migrationsPath } = this.config;

    if (!existsSync(migrationsPath)) {
      console.log(`Migrations directory not found: ${migrationsPath}`);
      return [];
    }

    const files = readdirSync(migrationsPath)
      .filter((file) => file.endsWith(".sql"))
      .filter((file) => /^\d+[_-]/.test(file)) // Must start with number prefix
      .sort((a, b) => {
        // Sort by numeric prefix
        const numA = parseInt(a.match(/^(\d+)/)?.[1] ?? "0", 10);
        const numB = parseInt(b.match(/^(\d+)/)?.[1] ?? "0", 10);
        return numA - numB;
      });

    return files;
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    await this.ensureMigrationsTable();

    const appliedMigrations = await this.getAppliedMigrations();
    const migrationFiles = this.getMigrationFiles();

    const pendingMigrations = migrationFiles.filter((file) => !appliedMigrations.has(file));

    if (pendingMigrations.length === 0) {
      console.log("No pending migrations");
      return;
    }

    console.log(`Running ${pendingMigrations.length} pending migration(s)...`);

    for (const migrationFile of pendingMigrations) {
      await this.applyMigration(migrationFile);
    }

    console.log("All migrations applied successfully");
  }

  private async applyMigration(migrationFile: string): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const { migrationsPath } = this.config;
    const filePath = join(migrationsPath, migrationFile);

    if (!existsSync(filePath)) {
      throw new Error(`Migration file not found: ${filePath}`);
    }

    const sql = readFileSync(filePath, "utf-8");

    console.log(`Applying migration: ${migrationFile}`);

    await this.db.exec("BEGIN");
    try {
      await this.db.exec(sql);

      await this.db.query(`INSERT INTO ${MIGRATIONS_TABLE} (migration_name) VALUES ($1)`, [migrationFile]);

      await this.db.exec("COMMIT");
      console.log(`  ✓ ${migrationFile}`);
    } catch (error) {
      await this.db.exec("ROLLBACK");
      console.error(`  ✗ ${migrationFile} failed`);
      throw error;
    }
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    await this.ensureInitialized();
    return this.db!.query<T>(sql, params);
  }

  async exec(sql: string): Promise<void> {
    await this.ensureInitialized();
    await this.db!.exec(sql);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  get instance(): PGlite {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  /**
   * Get list of applied migrations
   */
  async getMigrationHistory(): Promise<MigrationRecord[]> {
    await this.ensureInitialized();
    const result = await this.db!.query<MigrationRecord>(`SELECT * FROM ${MIGRATIONS_TABLE} ORDER BY id`);
    return result.rows;
  }

  /**
   * Get list of pending migrations that haven't been applied yet
   */
  async getPendingMigrations(): Promise<string[]> {
    await this.ensureInitialized();
    const applied = await this.getAppliedMigrations();
    const files = this.getMigrationFiles();
    return files.filter((file) => !applied.has(file));
  }
}

// Singleton factory for convenience
let defaultInstance: Database | null = null;

export async function getDatabase(config: DatabaseConfig): Promise<Database> {
  if (!defaultInstance) {
    defaultInstance = new Database(config);
    await defaultInstance.initialize();
  }
  return defaultInstance;
}
