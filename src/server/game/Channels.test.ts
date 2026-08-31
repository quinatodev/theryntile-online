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
	let closes = 0;
	const socket = {
		readyState: 1,
		close() { closes += 1; closeListener?.(); },
		on() {},
		once(_event: "close", listener: () => void) { closeListener = listener; },
		send(data: string, callback?: (error?: Error) => void) { sent.push(data); callback?.(); },
	};

	return { get closes() { return closes; }, sent, socket };
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
		addLobbySocket(oldSession.socket, { id: 1, name: "Player" }, "sid-old");
		addLobbySocket(currentSession.socket, { id: 1, name: "Player" }, "sid-current");
		addLobbySocket(otherAccount.socket, { id: 2, name: "Other" }, "sid-other");

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
