/**
 * Lang: pt-BR
 * Tooling administrativo para criar/evoluir o schema mínimo e aplicar seeds locais.
 * Não participa do boot normal nem possui conexões do runtime.
 *
 * Lang: en-US
 * Administrative tooling that creates/evolves the minimal schema and applies local seeds.
 * It does not participate in normal boot or own runtime connections.
 */
import process from "node:process";
import argon2 from "argon2";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required to set up PostgreSQL.");
}

const database = new pg.Pool({ connectionString: databaseUrl });

try {
	// Lang: pt-BR
	// As tabelas e ALTER idempotente mantêm instalações novas e bancos anteriores compatíveis com o schema atual.
	// Lang: en-US
	// The tables and idempotent ALTER keep fresh installations and older databases compatible with the current schema.
	await database.query(`
		CREATE TABLE IF NOT EXISTS accounts (
			id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			display_name TEXT NOT NULL
		)
	`);

	await database.query(`
		CREATE TABLE IF NOT EXISTS game_servers (
			id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			capacity INTEGER NOT NULL DEFAULT 100
		)
	`);

	await database.query(`
		ALTER TABLE accounts
		ADD COLUMN IF NOT EXISTS zoom DOUBLE PRECISION NOT NULL DEFAULT 1
	`);
	// Lang: pt-BR
	// DOUBLE PRECISION preserva contas existentes e representa quarters exatamente sem truncamento de INTEGER.
	// Lang: en-US
	// DOUBLE PRECISION preserves existing accounts and represents quarters exactly without INTEGER truncation.
	await database.query(`
		ALTER TABLE accounts
		ALTER COLUMN zoom TYPE DOUBLE PRECISION USING zoom::double precision
	`);
	await database.query("UPDATE accounts SET zoom = 1 WHERE zoom <= 0");
	await database.query(`
		DO $$
		BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_zoom_positive') THEN
				ALTER TABLE accounts ADD CONSTRAINT accounts_zoom_positive CHECK (zoom > 0);
			END IF;
		END
		$$
	`);

	await database.query(`
		ALTER TABLE game_servers
		ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 100
	`);

	// Lang: pt-BR
	// Normaliza bancos existentes antes de instalar a invariante persistente de capacity positiva.
	// Lang: en-US
	// Normalizes existing databases before installing the persistent positive-capacity invariant.
	await database.query("UPDATE game_servers SET capacity = 100 WHERE capacity <= 0");
	await database.query(`
		DO $$
		BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_servers_capacity_positive') THEN
				ALTER TABLE game_servers
				ADD CONSTRAINT game_servers_capacity_positive CHECK (capacity > 0);
			END IF;
		END
		$$
	`);

	await database.query(`
		CREATE TABLE IF NOT EXISTS auth_sessions (
			id UUID PRIMARY KEY,
			account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			expires_at TIMESTAMPTZ NOT NULL
		)
	`);

	// Lang: pt-BR
	// A deduplicação precede o índice único para que bancos existentes possam adotar a invariante com segurança.
	// Lang: en-US
	// Deduplication precedes the unique index so existing databases can safely adopt the invariant.
	await database.query(`
		DELETE FROM auth_sessions
		WHERE id IN (
			SELECT id FROM (
				SELECT id, ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY created_at DESC) AS position
				FROM auth_sessions
			) sessions
			WHERE position > 1
		)
	`);

	await database.query(`
		CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_one_per_account
		ON auth_sessions (account_id)
	`);

	// Lang: pt-BR
	// Seeds idempotentes fornecem contas e channels reproduzíveis para o ambiente atual.
	// Lang: en-US
	// Idempotent seeds provide reproducible accounts and channels for the current environment.
	const accounts = [
		{ username: "adminn", password: "adminn", displayName: "Admin" },
		{ username: "admin2", password: "admin2", displayName: "Admin 2" },
	];

	for (const account of accounts) {
		const passwordHash = await argon2.hash(account.password);
		await database.query(
			`INSERT INTO accounts (username, password_hash, display_name)
			VALUES ($1, $2, $3)
			ON CONFLICT (username) DO UPDATE SET
				password_hash = EXCLUDED.password_hash,
				display_name = EXCLUDED.display_name`,
			[account.username, passwordHash, account.displayName],
		);
	}

	for (const serverName of ["Theryn", "Gotlin"]) {
		await database.query(
			`INSERT INTO game_servers (name, capacity) VALUES ($1, $2)
			ON CONFLICT (name) DO UPDATE SET capacity = EXCLUDED.capacity`,
			[serverName, 100],
		);
	}

	const accountCheck = await database.query(
		"SELECT COUNT(*)::integer AS count, BOOL_AND(password_hash LIKE '$argon2%') AS argon2 FROM accounts",
	);

	const serverCheck = await database.query("SELECT COUNT(*)::integer AS count FROM game_servers");
	const accountSummary = accountCheck.rows[0];
	const serverSummary = serverCheck.rows[0];

	process.stdout.write(
		`Database setup completed: ${String(accountSummary.count)} accounts, ${String(serverSummary.count)} servers, Argon2 hashes: ${String(accountSummary.argon2)}.\n`,
	);
} finally {
	await database.end();
}
