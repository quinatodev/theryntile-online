/**
 * Lang: pt-BR
 * Possui sessões de autenticação persistentes, emissão/validação de JWT e contrato dos cookies.
 * Um JWT só é restaurável enquanto seu sid exato existir no banco; WebSockets permanecem fora deste módulo.
 *
 * Lang: en-US
 * Owns persistent authentication sessions, JWT issuance/validation, and the cookie contract.
 * A JWT is restorable only while its exact sid exists in the database; WebSockets remain outside this module.
 */
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { database } from "../database/Database.js";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_ISSUER = "theryntile-online";
const SESSION_AUDIENCE = "web";
const sessionSecretValue = process.env.AUTH_SESSION_SECRET;

if (!sessionSecretValue || Buffer.byteLength(sessionSecretValue, "utf8") < 32 || sessionSecretValue.includes("<placeholder>")) {
	throw new Error("AUTH_SESSION_SECRET must contain at least 32 bytes of secret data.");
}

const sessionSecret = new TextEncoder().encode(sessionSecretValue);

export const SESSION_COOKIE_NAME = "theryntile_session";

export const sessionCookieOptions = {
	httpOnly: true,
	maxAge: SESSION_TTL_SECONDS,
	path: "/",
	sameSite: "strict" as const,
	secure: process.env.NODE_ENV === "production",
};

export const clearSessionCookieOptions = {
	httpOnly: true,
	path: "/",
	sameSite: "strict" as const,
	secure: process.env.NODE_ENV === "production",
};

interface SessionAccountRow {
	id: number;
	display_name: string;
}

interface GameServerRow {
	id: number;
	name: string;
}

export interface SessionResponse {
	player: { id: number; name: string };
	servers: GameServerRow[];
}

export interface SessionDetails extends SessionResponse {
	accountId: number;
	sessionId: string;
}

export interface CreatedSession {
	sessionId: string;
	token: string;
}

interface VerifiedSessionClaims {
	accountId: number;
	sessionId: string;
}

/**
 * Lang: pt-BR
 * Verifica assinatura e claims estruturais do token sem afirmar que a sessão ainda existe no banco.
 *
 * Lang: en-US
 * Verifies token signature and structural claims without asserting that the session still exists in the database.
 */
async function verifySessionToken(token: string): Promise<VerifiedSessionClaims | null> {
	try {
		const { payload } = await jwtVerify(token, sessionSecret, {
			algorithms: ["HS256"],
			audience: SESSION_AUDIENCE,
			issuer: SESSION_ISSUER,
		});
		const accountId = Number(payload.sub);

		if (!Number.isSafeInteger(accountId) || accountId <= 0 || typeof payload.sid !== "string") {
			return null;
		}

		return { accountId, sessionId: payload.sid };
	} catch {
		return null;
	}
}

/**
 * Lang: pt-BR
 * Substitui atomicamente a sessão da account e emite um JWT ligado ao novo sid persistido.
 * A transação e o advisory lock cooperam com o índice único para preservar uma sessão ativa por account.
 *
 * Lang: en-US
 * Atomically replaces the account session and issues a JWT bound to the new persisted sid.
 * The transaction and advisory lock cooperate with the unique index to preserve one active session per account.
 */
export async function createSession(accountId: number): Promise<CreatedSession> {
	const sessionId = randomUUID();
	const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
	const client = await database.connect();

	try {
		await client.query("BEGIN");

		// Lang: pt-BR
		// A serialização por account impede que transações concorrentes violem a ordem de replacement.
		// Lang: en-US
		// Per-account serialization prevents concurrent transactions from violating replacement order.
		await client.query("SELECT pg_advisory_xact_lock($1)", [accountId]);
		await client.query("DELETE FROM auth_sessions WHERE expires_at <= NOW() OR account_id = $1", [accountId]);
		await client.query("INSERT INTO auth_sessions (id, account_id, expires_at) VALUES ($1, $2, $3)", [sessionId, accountId, expiresAt]);
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");

		throw error;
	} finally {
		client.release();
	}

	const token = await new SignJWT({ sid: sessionId })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(String(accountId))
		.setIssuer(SESSION_ISSUER)
		.setAudience(SESSION_AUDIENCE)
		.setIssuedAt()
		.setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
		.sign(sessionSecret);

	return { sessionId, token };
}

/**
 * Lang: pt-BR
 * Restaura identity, sid e catálogo para coordenação interna de HTTP/WebSocket, ou null quando inválida.
 *
 * Lang: en-US
 * Restores identity, sid, and catalog for internal HTTP/WebSocket coordination, or null when invalid.
 */
export async function restoreSessionDetails(token: string): Promise<SessionDetails | null> {
	const claims = await verifySessionToken(token);
	if (!claims) {
		return null;
	}

	// Lang: pt-BR
	// Um JWT válido não basta: seu sid exato ainda deve existir e estar válido no PostgreSQL.
	// Lang: en-US
	// A valid JWT is insufficient: its exact sid must still exist and remain valid in PostgreSQL.
	const accountResult = await database.query<SessionAccountRow>(
		`SELECT accounts.id, accounts.display_name
		FROM auth_sessions
		INNER JOIN accounts ON accounts.id = auth_sessions.account_id
		WHERE auth_sessions.id = $1
			AND auth_sessions.account_id = $2
			AND auth_sessions.expires_at > NOW()`,
		[claims.sessionId, claims.accountId],
	);
	const account = accountResult.rows[0];

	if (!account) {
		return null;
	}

	const serversResult = await database.query<GameServerRow>(
		"SELECT id, name FROM game_servers ORDER BY id",
	);

	return {
		accountId: account.id,
		sessionId: claims.sessionId,
		player: { id: account.id, name: account.display_name },
		servers: serversResult.rows,
	};
}

/**
 * Lang: pt-BR
 * Restaura somente a resposta pública da sessão, sem expor accountId ou sessionId internos.
 *
 * Lang: en-US
 * Restores only the public session response without exposing internal accountId or sessionId.
 */
export async function restoreSession(token: string): Promise<SessionResponse | null> {
	const session = await restoreSessionDetails(token);
	if (!session) {
		return null;
	}

	return { player: session.player, servers: session.servers };
}

/**
 * Lang: pt-BR
 * Confirma que um sid ainda é a sessão persistida atual antes da finalização de um login concorrente.
 *
 * Lang: en-US
 * Confirms that a sid remains the current persisted session before concurrent-login finalization.
 */
export async function isCurrentSession(accountId: number, sessionId: string): Promise<boolean> {
	const result = await database.query(
		"SELECT 1 FROM auth_sessions WHERE id = $1 AND account_id = $2 AND expires_at > NOW()",
		[sessionId, accountId],
	);

	return result.rowCount === 1;
}

/**
 * Lang: pt-BR
 * Revoga somente a linha correspondente aos claims verificados; tokens inválidos não causam mutação.
 *
 * Lang: en-US
 * Revokes only the row matching verified claims; invalid tokens cause no mutation.
 */
export async function revokeSession(token: string): Promise<void> {
	const claims = await verifySessionToken(token);
	if (!claims) {
		return;
	}

	await database.query(
		"DELETE FROM auth_sessions WHERE id = $1 AND account_id = $2",
		[claims.sessionId, claims.accountId],
	);
}
