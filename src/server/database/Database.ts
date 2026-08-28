/**
 * Lang: pt-BR
 * Possui o pool PostgreSQL compartilhado pelo runtime e falha cedo sem DATABASE_URL.
 * Regras de domínio permanecem nos módulos consumidores.
 *
 * Lang: en-US
 * Owns the PostgreSQL pool shared by the runtime and fails fast without DATABASE_URL.
 * Domain rules remain in consuming modules.
 */
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
}

export const database = new pg.Pool({ connectionString: databaseUrl });
