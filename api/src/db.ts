
import "dotenv/config";
import { Pool, PoolClient } from "pg";

// Validate PostgreSQL configuration
const requiredEnv = ["DATABASE_URL"];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Create a single PostgreSQL connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle unexpected pool errors
pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

// Execute database operations within a tenant transaction
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!tenantId || !tenantId.trim()) {
    throw new Error("Tenant ID is required");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Set tenant ID for the current transaction
    await client.query(
      "SELECT set_config('app.tenant_id', $1, true)",
      [tenantId]
    );

    const result = await fn(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Transaction rollback failed:", rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}

// Test PostgreSQL connection
export async function testDatabaseConnection(): Promise<void> {
  const result = await pool.query("SELECT NOW()");

  console.log("PostgreSQL connected successfully:", result.rows[0].now);
}
