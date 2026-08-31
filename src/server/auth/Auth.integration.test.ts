/**
 * Lang: pt-BR
 * Exercita Session e fronteiras Auth contra o PostgreSQL descartável dedicado.
 *
 * Lang: en-US
 * Exercises Session and Auth boundaries against the dedicated disposable PostgreSQL database.
 */
import assert from "node:assert/strict";
import argon2 from "argon2";
import pg from "pg";
import WebSocket from "ws";

import { after, before, test } from "node:test";
import { type FastifyInstance } from "fastify";

const TEST_DATABASE_NAME = "theryntile-online-test";
const configuredUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!configuredUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for integration tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = `/${TEST_DATABASE_NAME}`;
process.env.DATABASE_URL = testUrl.toString();
const fixtureUsernames = ["integration_primary", "integration_secondary", "integration_tertiary"] as const;
const pool = new pg.Pool({ connectionString: testUrl.toString() });
let primaryAccountId = 0;
let secondaryAccountId = 0;
let server: FastifyInstance;
let websocketUrl = "";
let originalCapacities: Array<{ capacity: number; id: number }> = [];

/** Lang: pt-BR - Aborta antes de mutação se a conexão não for dedicada. Lang: en-US - Aborts before mutation unless the connection is dedicated. */
const assertTestDatabase = async (): Promise<void> => {
	const result = await pool.query<{ current_database: string }>("SELECT current_database()");
	assert.equal(result.rows[0]?.current_database, TEST_DATABASE_NAME);
};

/** Lang: pt-BR - Remove somente as accounts próprias desta suíte. Lang: en-US - Removes only accounts owned by this suite. */
const cleanupFixtures = async (): Promise<void> => {
	await assertTestDatabase();
	await pool.query("DELETE FROM accounts WHERE username = ANY($1::text[])", [fixtureUsernames]);
};

/** Lang: pt-BR - Cria uma account isolada com credencial Argon2 real. Lang: en-US - Creates an isolated account with a real Argon2 credential. */
const createAccount = async (username: string, displayName: string): Promise<number> => {
	const passwordHash = await argon2.hash("integration-password");
	const result = await pool.query<{ id: number }>("INSERT INTO accounts (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id", [username, passwordHash, displayName]);

	return result.rows[0]?.id ?? 0;
};

/** Lang: pt-BR - Extrai o par name=value do cookie emitido. Lang: en-US - Extracts the name=value pair from an emitted cookie. */
const cookiePair = (setCookie: string | string[] | undefined): string => {
	assert.ok(setCookie);

	return (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";", 1)[0] as string;
};

/** Lang: pt-BR - Abre um WebSocket real autenticado no listener efêmero. Lang: en-US - Opens a real authenticated WebSocket against the ephemeral listener. */
const openWebSocket = async (cookie: string): Promise<WebSocket> => new Promise((resolve, reject) => {
	const socket = new WebSocket(websocketUrl, { headers: { cookie } });
	socket.once("open", () => resolve(socket));
	socket.once("error", reject);
});

/** Lang: pt-BR - Observa rejeição HTTP e encerra integralmente o client real. Lang: en-US - Observes HTTP rejection and fully closes the real client. */
const rejectedWebSocketStatus = async (cookie?: string): Promise<number> => new Promise((resolve, reject) => {
	const socket = new WebSocket(websocketUrl, cookie ? { headers: { cookie } } : undefined);
	socket.once("open", () => { socket.terminate(); reject(new Error("WebSocket unexpectedly authenticated.")); });
	socket.once("unexpected-response", (_request, response) => {
		const status = response.statusCode ?? 0;
		response.resume();
		socket.terminate();
		resolve(status);
	});
	socket.once("error", () => {});
});

/** Lang: pt-BR - Aguarda e valida a próxima mensagem JSON. Lang: en-US - Waits for and parses the next JSON message. */
const nextMessage = async (socket: WebSocket): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
	socket.once("message", (data) => {
		try { resolve(JSON.parse(data.toString()) as Record<string, unknown>); } catch (error) { reject(error); }
	});
	socket.once("error", reject);
});

/** Lang: pt-BR - Filtra mensagens até obter a quantidade esperada de um tipo. Lang: en-US - Filters messages until the expected count of one type is received. */
const messagesOfType = async (socket: WebSocket, type: string, count = 1): Promise<Array<Record<string, unknown>>> => new Promise((resolve, reject) => {
	const messages: Array<Record<string, unknown>> = [];
	const onMessage = (data: WebSocket.RawData) => {
		try {
			const message = JSON.parse(data.toString()) as Record<string, unknown>;
			if (message.type !== type) return;
			messages.push(message);
			if (messages.length === count) {
				socket.off("message", onMessage);
				resolve(messages);
			}
		} catch (error) { reject(error); }
	};
	socket.on("message", onMessage);
	socket.once("error", reject);
});

/** Lang: pt-BR - Realiza login HTTP real e devolve o cookie vencedor. Lang: en-US - Performs a real HTTP login and returns the winning cookie. */
const loginCookie = async (username: string): Promise<string> => {
	const response = await server.inject({ method: "POST", url: "/auth/login", payload: { username, password: "integration-password" } });
	assert.equal(response.statusCode, 200);

	return cookiePair(response.headers["set-cookie"]);
};

/** Lang: pt-BR - Fecha um client WebSocket e aguarda o handshake de encerramento. Lang: en-US - Closes a WebSocket client and waits for the closing handshake. */
const closeWebSocket = async (socket: WebSocket): Promise<void> => {
	if (socket.readyState === WebSocket.CLOSED) return;
	const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
	socket.close();
	await closed;
};

before(async () => {
	await assertTestDatabase();
	await cleanupFixtures();
	primaryAccountId = await createAccount(fixtureUsernames[0], "Integration Primary");
	secondaryAccountId = await createAccount(fixtureUsernames[1], "Integration Secondary");
	await createAccount(fixtureUsernames[2], "Integration Tertiary");
	const capacities = await pool.query<{ capacity: number; id: number }>("SELECT id, capacity FROM game_servers ORDER BY id");
	originalCapacities = capacities.rows;
	await pool.query("UPDATE game_servers SET capacity = 2");
	const serverModule = await import("../Server.js");
	server = await serverModule.createServer();
	const address = await server.listen({ host: "127.0.0.1", port: 0 });
	websocketUrl = `${address.replace(/^http/, "ws")}/ws`;
});

after(async () => {
	try {
		await server.close();
		await assertTestDatabase();
		await pool.query("DROP TRIGGER IF EXISTS integration_reject_session ON auth_sessions");
		await pool.query("DROP FUNCTION IF EXISTS integration_reject_session_insert()");
		await cleanupFixtures();
		for (const channel of originalCapacities) await pool.query("UPDATE game_servers SET capacity = $1 WHERE id = $2", [channel.capacity, channel.id]);
	} finally {
		const { database } = await import("../database/Database.js");
		await database.end();
		await pool.end();
	}
});

test("Session persists JWT/SID ownership, restores, revokes, expires, and replaces the previous login", async () => {
	const { createSession, isCurrentSession, restoreSessionDetails, revokeSession } = await import("./Session.js");
	const first = await createSession(primaryAccountId);
	assert.match(first.sessionId, /^[0-9a-f-]{36}$/i);
	assert.equal((await restoreSessionDetails(first.token))?.accountId, primaryAccountId);
	assert.equal(await isCurrentSession(primaryAccountId, first.sessionId), true);
	const second = await createSession(primaryAccountId);
	assert.equal(await restoreSessionDetails(first.token), null);
	assert.equal((await restoreSessionDetails(second.token))?.sessionId, second.sessionId);
	await revokeSession(second.token);
	assert.equal(await restoreSessionDetails(second.token), null);
	await revokeSession(second.token);
	const expired = await createSession(primaryAccountId);
	await pool.query("UPDATE auth_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [expired.sessionId]);
	assert.equal(await restoreSessionDetails(expired.token), null);
	assert.equal(await restoreSessionDetails("not-a-jwt"), null);
});

test("Session transaction rolls back deletion when replacement insert fails", async () => {
	const { createSession, restoreSessionDetails } = await import("./Session.js");
	const previous = await createSession(primaryAccountId);
	try {
		await pool.query("CREATE FUNCTION integration_reject_session_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'integration rejection'; END $$");
		await pool.query("CREATE TRIGGER integration_reject_session BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION integration_reject_session_insert()");
		await assert.rejects(createSession(primaryAccountId), /integration rejection/);
		assert.equal((await restoreSessionDetails(previous.token))?.sessionId, previous.sessionId);
		const count = await pool.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM auth_sessions WHERE account_id = $1", [primaryAccountId]);
		assert.equal(count.rows[0]?.count, 1);
	} finally {
		await pool.query("DROP TRIGGER IF EXISTS integration_reject_session ON auth_sessions");
		await pool.query("DROP FUNCTION IF EXISTS integration_reject_session_insert()");
	}
});

test("concurrent HTTP logins leave one winner and Auth routes honor cookie lifecycle", async () => {
	const payload = { username: fixtureUsernames[0], password: "integration-password" };
	const [loginA, loginB] = await Promise.all([server.inject({ method: "POST", url: "/auth/login", payload }), server.inject({ method: "POST", url: "/auth/login", payload })]);
	assert.deepEqual([loginA.statusCode, loginB.statusCode].sort(), [200, 409]);
	const winner = loginA.statusCode === 200 ? loginA : loginB;
	const cookie = cookiePair(winner.headers["set-cookie"]);
	assert.equal((await server.inject({ method: "GET", url: "/auth/session", headers: { cookie } })).statusCode, 200);
	assert.equal((await server.inject({ method: "GET", url: "/auth/session" })).statusCode, 401);
	assert.equal((await server.inject({ method: "GET", url: "/auth/session", headers: { cookie: "theryntile_session=invalid" } })).statusCode, 401);
	assert.equal((await server.inject({ method: "POST", url: "/auth/login", payload: { username: fixtureUsernames[0], password: "wrong" } })).statusCode, 401);
	assert.equal((await server.inject({ method: "POST", url: "/auth/login", payload: {} })).statusCode, 400);
	const logout = await server.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
	assert.equal(logout.statusCode, 200);
	assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/);
	assert.equal((await server.inject({ method: "GET", url: "/auth/session", headers: { cookie } })).statusCode, 401);
});

test("WebSocket upgrade accepts only a currently persisted session", async () => {
	const { createSession, revokeSession } = await import("./Session.js");
	const active = await createSession(secondaryAccountId);
	const cookie = `theryntile_session=${active.token}`;
	const socket = await openWebSocket(cookie);
	const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
	socket.close();
	await closed;
	assert.equal(await rejectedWebSocketStatus(), 401);
	assert.equal(await rejectedWebSocketStatus("theryntile_session=invalid"), 401);
	await revokeSession(active.token);
	assert.equal(await rejectedWebSocketStatus(cookie), 401);
	const expired = await createSession(secondaryAccountId);
	await pool.query("UPDATE auth_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [expired.sessionId]);
	assert.equal(await rejectedWebSocketStatus(`theryntile_session=${expired.token}`), 401);
});

test("a second login replaces the first persisted session and its authenticated socket", async () => {
	const payload = { username: fixtureUsernames[1], password: "integration-password" };
	const loginA = await server.inject({ method: "POST", url: "/auth/login", payload });
	assert.equal(loginA.statusCode, 200);
	const cookieA = cookiePair(loginA.headers["set-cookie"]);
	const socketA = await openWebSocket(cookieA);
	const replacement = nextMessage(socketA);
	const closed = new Promise<void>((resolve) => socketA.once("close", () => resolve()));
	const loginB = await server.inject({ method: "POST", url: "/auth/login", payload });
	assert.equal(loginB.statusCode, 200);
	assert.equal((await replacement).type, "SESSION_REPLACED");
	await closed;
	assert.equal((await server.inject({ method: "GET", url: "/auth/session", headers: { cookie: cookieA } })).statusCode, 401);
	const cookieB = cookiePair(loginB.headers["set-cookie"]);
	assert.equal((await server.inject({ method: "GET", url: "/auth/session", headers: { cookie: cookieB } })).statusCode, 200);
});

test("Channels integrates admission, capacity, presence, cleanup, broadcasts, movement ordering, and route lock", async () => {
	const { getRuntimeChannels } = await import("../game/Channels.js");
	const { findPath } = await import("../game/Navigation.js");
	const channel = getRuntimeChannels()[0];
	assert.ok(channel);
	assert.equal(channel.capacity, 2);
	const sockets = await Promise.all(fixtureUsernames.map(async (username) => openWebSocket(await loginCookie(username))));
	const [socketA, socketB, socketC] = sockets;
	assert.ok(socketA && socketB && socketC);
	try {
		const missing = messagesOfType(socketC, "ENTER_CHANNEL_REJECTED");
		socketC.send(JSON.stringify({ type: "ENTER_CHANNEL", channelId: 2_147_483_647 }));
		assert.equal((await missing)[0]?.reason, "CHANNEL_NOT_FOUND");
		assert.equal(channel.members.size, 0);

		const enteredA = messagesOfType(socketA, "ENTER_CHANNEL_SUCCESS");
		socketA.send(JSON.stringify({ type: "ENTER_CHANNEL", channelId: channel.id }));
		const playerA = (await enteredA)[0]?.player as { column: number; id: number; row: number };
		assert.equal(channel.members.size, 1);

		const joinedB = messagesOfType(socketA, "PLAYER_JOINED");
		const enteredB = messagesOfType(socketB, "ENTER_CHANNEL_SUCCESS");
		socketB.send(JSON.stringify({ type: "ENTER_CHANNEL", channelId: channel.id }));
		const playerB = (await enteredB)[0]?.player as { id: number };
		assert.equal(((await joinedB)[0]?.player as { id: number }).id, playerB.id);
		assert.equal(channel.members.size, channel.capacity);

		const full = messagesOfType(socketC, "ENTER_CHANNEL_REJECTED");
		socketC.send(JSON.stringify({ type: "ENTER_CHANNEL", channelId: channel.id }));
		assert.equal((await full)[0]?.reason, "CHANNEL_FULL");
		assert.equal(channel.members.size, channel.capacity);

		const candidates: Array<{ column: number; row: number }> = [];
		for (let row = Math.max(0, playerA.row - 2); row <= playerA.row + 2; row += 1) for (let column = Math.max(0, playerA.column - 2); column <= playerA.column + 2; column += 1) {
			const path = findPath(playerA, { row, column });
			if (path?.length === 2) candidates.push({ row, column });
		}
		const target = candidates[0];
		assert.ok(target);
		const moved = messagesOfType(socketB, "PLAYER_MOVED", 2);
		socketA.send(JSON.stringify({ type: "MOVE", ...target }));
		socketA.send(JSON.stringify({ type: "MOVE", row: playerA.row, column: playerA.column }));
		const steps = await moved;
		assert.equal(steps[0]?.playerId, playerA.id);
		assert.equal(steps[0]?.fromRow, playerA.row);
		assert.equal(steps[0]?.fromColumn, playerA.column);
		assert.equal(steps[0]?.finalStep, false);
		assert.equal(steps[1]?.fromRow, steps[0]?.row);
		assert.equal(steps[1]?.fromColumn, steps[0]?.column);
		assert.deepEqual({ row: steps[1]?.row, column: steps[1]?.column }, target);
		assert.equal(steps[1]?.finalStep, true);
		await new Promise<void>((resolve) => setTimeout(resolve, 550));
		const resumed = messagesOfType(socketB, "PLAYER_MOVED");
		socketA.send(JSON.stringify({ type: "MOVE", row: playerA.row, column: playerA.column }));
		const resumedStep = (await resumed)[0];
		assert.equal(resumedStep?.fromRow, target.row);
		assert.equal(resumedStep?.fromColumn, target.column);

		const leftB = messagesOfType(socketA, "PLAYER_LEFT");
		await closeWebSocket(socketB);
		assert.equal((await leftB)[0]?.playerId, playerB.id);
		assert.equal(channel.members.size, 1);
		const enteredC = messagesOfType(socketC, "ENTER_CHANNEL_SUCCESS");
		socketC.send(JSON.stringify({ type: "ENTER_CHANNEL", channelId: channel.id }));
		await enteredC;
		assert.equal(channel.members.size, channel.capacity);
	} finally {
		const serverClosed = channel.players.map(({ socket }) => new Promise<void>((resolve) => socket.once("close", resolve)));
		await Promise.all(sockets.map(closeWebSocket));
		await Promise.all(serverClosed);
	}
	assert.equal(channel.members.size, 0);
	assert.equal(channel.players.length, 0);
});
