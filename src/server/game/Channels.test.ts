import assert from "node:assert/strict";
import test from "node:test";

import { closeSocketAfterSend, createInitializationGuard, isValidChannelCapacity } from "./ChannelLifecycle.js";

/**
 * Lang: pt-BR
 * Cria o socket estrutural mínimo que conclui send e close para observar targeting e cleanup por SID.
 *
 * Lang: en-US
 * Creates the minimal structural socket that completes send and close to observe SID targeting and cleanup.
 */
const createSocket = () => {
	const sent: string[] = [];
	let closeListener: (() => void) | undefined;
	let messageListener: ((data: unknown) => void) | undefined;
	let closes = 0;
	const socket = {
		readyState: 1,
		close() { closes += 1; closeListener?.(); },
		on(event: "message" | "error", listener: ((data: unknown) => void) | ((error: Error) => void)) { if (event === "message") messageListener = listener as (data: unknown) => void; },
		once(_event: "close", listener: () => void) { closeListener = listener; },
		send(data: string, callback?: (error?: Error) => void) { sent.push(data); callback?.(); },
	};

	return { get closes() { return closes; }, message(data: object) { messageListener?.(JSON.stringify(data)); }, sent, socket };
};

test("Channels initialization guard accepts the first claim and rejects the second", () => {
	const claim = createInitializationGuard();
	claim();
	assert.throws(() => claim(), /already been initialized/);
});

test("channel capacity accepts positive safe integers only", () => {
	assert.equal(isValidChannelCapacity(1), true);
	assert.equal(isValidChannelCapacity(100), true);
	assert.equal(isValidChannelCapacity(0), false);
	assert.equal(isValidChannelCapacity(-1), false);
	assert.equal(isValidChannelCapacity(1.5), false);
});

test("socket send callback closes once and cancels its fallback", () => {
	let callback: (() => void) | undefined;
	let fallback: (() => void) | undefined;
	let cancelled = 0;
	let closes = 0;
	const socket = {
		close() { closes += 1; },
		send(_data: string, next?: () => void) { callback = next; },
	};
	closeSocketAfterSend(socket, "message", 4001, "reason", 10, ((next: () => void) => {
		fallback = next;

		return 1;
	}) as typeof setTimeout, (() => { cancelled += 1; }) as typeof clearTimeout);
	callback?.();
	fallback?.();
	assert.equal(closes, 1);
	assert.equal(cancelled, 1);
});

test("socket fallback closes once when send callback is absent or late", () => {
	let callback: (() => void) | undefined;
	let fallback: (() => void) | undefined;
	let closes = 0;
	const socket = {
		close() { closes += 1; },
		send(_data: string, next?: () => void) { callback = next; },
	};
	closeSocketAfterSend(socket, "message", 4002, "reason", 10, ((next: () => void) => {
		fallback = next;

		return 1;
	}) as typeof setTimeout, (() => {}) as typeof clearTimeout);
	fallback?.();
	callback?.();
	assert.equal(closes, 1);
});

test("session replacement and revocation target only sockets owning the affected account and SID", async () => {
	const previousDatabaseUrl = process.env.DATABASE_URL;
	process.env.DATABASE_URL = previousDatabaseUrl ?? "postgresql://unused:unused@localhost/unused";
	try {
		const { addLobbySocket, replaceAccountConnections, revokeSessionConnections } = await import("./Channels.js");
		const oldSession = createSocket();
		const currentSession = createSocket();
		const otherAccount = createSocket();
		const future = new Date(Date.now() + 60_000);
		addLobbySocket(oldSession.socket, { id: 1, name: "Player" }, "sid-old", future);
		addLobbySocket(currentSession.socket, { id: 1, name: "Player" }, "sid-current", future);
		addLobbySocket(otherAccount.socket, { id: 2, name: "Other" }, "sid-other", future);

		replaceAccountConnections(1, "sid-current");
		assert.equal(oldSession.closes, 1);
		assert.equal(currentSession.closes, 0);
		assert.equal(otherAccount.closes, 0);
		assert.deepEqual(JSON.parse(oldSession.sent.at(-1) as string), { type: "SESSION_REPLACED" });

		revokeSessionConnections("sid-current");
		assert.equal(currentSession.closes, 1);
		assert.equal(otherAccount.closes, 0);
		assert.deepEqual(JSON.parse(currentSession.sent.at(-1) as string), { type: "SESSION_REVOKED" });
	} finally {
		if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = previousDatabaseUrl;
	}
});

test("natural session expiration removes socket eligibility before revocation closes it", async (context) => {
	context.mock.timers.enable({ apis: ["setTimeout"], now: new Date("2026-01-01T00:00:00.000Z") });
	const previousDatabaseUrl = process.env.DATABASE_URL;
	process.env.DATABASE_URL = previousDatabaseUrl ?? "postgresql://unused:unused@localhost/unused";
	try {
		const { addLobbySocket } = await import("./Channels.js");
		const expired = createSocket();
		addLobbySocket(expired.socket, { id: 10, name: "Expiring" }, "sid-expiring", new Date(Date.now() + 1_000));
		assert.equal(expired.closes, 0);
		context.mock.timers.tick(1_000);
		assert.equal(expired.closes, 1);
		assert.deepEqual(JSON.parse(expired.sent.at(-1) as string), { type: "SESSION_REVOKED" });
		const sentAfterClose = expired.sent.length;
		expired.message({ type: "RESYNC_PLAYERS" });
		expired.message({ type: "MOVE", row: 1, column: 1 });
		assert.equal(expired.sent.length, sentAfterClose);
	} finally {
		context.mock.timers.reset();
		if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = previousDatabaseUrl;
	}
});
