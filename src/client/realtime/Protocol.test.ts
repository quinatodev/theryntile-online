import assert from "node:assert/strict";
import test from "node:test";

import { isMoveMessage, parseRealtimeMessage } from "./Protocol.js";

test("move accepts integer grid coordinates", () => {
	assert.equal(isMoveMessage({ type: "MOVE", row: 0, column: 0 }), true);
	assert.equal(isMoveMessage({ type: "MOVE", row: 10, column: 10 }), true);
});

test("move rejects invalid row and column values", () => {
	assert.equal(isMoveMessage({ type: "MOVE", row: 1.5, column: 2 }), false);
	assert.equal(isMoveMessage({ type: "MOVE", row: 2, column: -1 }), false);
	assert.equal(isMoveMessage({ type: "MOVE", row: Number.MAX_SAFE_INTEGER + 1, column: 0 }), false);
});

test("channel state accepts valid integer values", () => {
	const message = parseRealtimeMessage(JSON.stringify({
		type: "CHANNELS_STATE",
		channels: [{ id: 1, name: "Theryn", population: 0, capacity: 100 }],
	}));

	assert.equal(message?.type, "CHANNELS_STATE");
});

test("session revoked is accepted as a server message", () => {
	assert.deepEqual(parseRealtimeMessage("{\"type\":\"SESSION_REVOKED\"}"), { type: "SESSION_REVOKED" });
});

test("portal, map transition, and authoritative Creature messages validate their required state", () => {
	assert.deepEqual(parseRealtimeMessage(JSON.stringify({ type: "PORTAL_AVAILABLE", portalId: "private-test" })), { type: "PORTAL_AVAILABLE", portalId: "private-test" });
	assert.equal(parseRealtimeMessage(JSON.stringify({ type: "PORTAL_AVAILABLE", portalId: "" })), null);
	const creature = { type: "CREATURE_MOVED", creatureId: "stag:shared", fromRow: 5, fromColumn: 5, row: 5, column: 6, sequence: 1, startedAt: 100, endsAt: 600, serverTime: 100 };
	assert.deepEqual(parseRealtimeMessage(JSON.stringify(creature)), creature);
	assert.equal(parseRealtimeMessage(JSON.stringify({ ...creature, row: 6 })), null);
	const changed = { type: "MAP_CHANGED", mapId: "multiplayer-test", map: { 0: [[1]] }, player: { id: 1, name: "A", row: 0, column: 0, sequence: 0 }, players: [], creatures: [{ id: "stag:shared", species: "stag", row: 0, column: 0, sequence: 0 }] };
	assert.deepEqual(parseRealtimeMessage(JSON.stringify(changed)), changed);
	assert.equal(parseRealtimeMessage(JSON.stringify({ ...changed, creatures: [{ ...changed.creatures[0], species: "dragon" }] })), null);
});

test("player moved accepts an authoritative adjacent transition", () => {
	assert.deepEqual(parseRealtimeMessage(JSON.stringify({
		type: "PLAYER_MOVED",
		playerId: 1,
		fromRow: 2,
		fromColumn: 2,
		row: 2,
		column: 3,
		sequence: 7,
		startedAt: 1_000,
		endsAt: 1_500,
		serverTime: 1_100,
		finalStep: true,
	})), {
		type: "PLAYER_MOVED",
		playerId: 1,
		fromRow: 2,
		fromColumn: 2,
		row: 2,
		column: 3,
		sequence: 7,
		startedAt: 1_000,
		endsAt: 1_500,
		serverTime: 1_100,
		finalStep: true,
	});
});

test("players resync validates stopped and active temporal states", () => {
	const message = { type: "PLAYERS_RESYNC", serverTime: 1_250, players: [
		{ id: 1, name: "Stopped", row: 2, column: 2, sequence: 4, movement: null },
		{ id: 2, name: "Moving", row: 1, column: 1, sequence: 7, movement: { fromRow: 1, fromColumn: 1, row: 1, column: 2, sequence: 7, startedAt: 1_000, endsAt: 1_500, finalStep: true } },
	] } as const;
	assert.deepEqual(parseRealtimeMessage(JSON.stringify(message)), message);
	assert.equal(parseRealtimeMessage(JSON.stringify({ ...message, players: [{ ...message.players[1], sequence: 8 }] })), null);
});

test("multiplayer lifecycle messages retain their validated observable payloads", () => {
	const messages = [
		{ type: "CHANNEL_POPULATION", channelId: 1, population: 7 },
		{ type: "ENTER_CHANNEL_SUCCESS", channelId: 1, player: { id: 1, name: "Local", row: 2, column: 3, sequence: 0 }, players: [{ id: 2, name: "Remote", row: 3, column: 3, sequence: 4 }] },
		{ type: "ENTER_CHANNEL_REJECTED", reason: "CHANNEL_FULL" },
		{ type: "PLAYER_JOINED", player: { id: 2, name: "Remote", row: 3, column: 3, sequence: 0 } },
		{ type: "PLAYER_LEFT", playerId: 2 },
		{ type: "SESSION_REPLACED" },
	] as const;
	for (const message of messages) assert.deepEqual(parseRealtimeMessage(JSON.stringify(message)), message);
	assert.equal(parseRealtimeMessage("not json"), null);
});

for (const message of [
	{ type: "PLAYER_MOVED", playerId: 0, fromRow: 2, fromColumn: 2, row: 2, column: 3, finalStep: true },
	{ type: "PLAYER_MOVED", playerId: 1, fromRow: 2, fromColumn: 2, row: 3, column: 3, finalStep: true },
	{ type: "PLAYER_MOVED", playerId: 1, fromRow: 2, fromColumn: 2, row: -1, column: 2, finalStep: true },
	{ type: "PLAYER_MOVED", playerId: 1, fromRow: 2, fromColumn: 2, row: 2.5, column: 2, finalStep: true },
	{ type: "PLAYER_MOVED", playerId: 1, fromRow: 2, fromColumn: 2, row: 2, column: 3, finalStep: "yes" },
]) {
	test(`player moved rejects malformed state: ${JSON.stringify(message)}`, () => {
		assert.equal(parseRealtimeMessage(JSON.stringify(message)), null);
	});
}

for (const temporal of [
	{ sequence: 0, startedAt: 1_000, endsAt: 1_500, serverTime: 1_100 },
	{ sequence: 1, startedAt: 1_500, endsAt: 1_500, serverTime: 1_500 },
	{ sequence: 1, startedAt: 1_500, endsAt: 1_000, serverTime: 1_200 },
]) {
	test(`player moved rejects invalid temporal invariants: ${JSON.stringify(temporal)}`, () => {
		assert.equal(parseRealtimeMessage(JSON.stringify({
			type: "PLAYER_MOVED", playerId: 1, fromRow: 2, fromColumn: 2, row: 2, column: 3, finalStep: true, ...temporal,
		})), null);
	});
}

for (const channel of [
	{ id: 1.5, name: "Theryn", population: 0, capacity: 100 },
	{ id: -1, name: "Theryn", population: 0, capacity: 100 },
	{ id: 1, name: "Theryn", population: -1, capacity: 100 },
	{ id: 1, name: "Theryn", population: 1.5, capacity: 100 },
	{ id: 1, name: "Theryn", population: 101, capacity: 100 },
	{ id: 1, name: "Theryn", population: 0, capacity: -1 },
]) {
	test(`channel state rejects invalid numbers: ${JSON.stringify(channel)}`, () => {
		assert.equal(parseRealtimeMessage(JSON.stringify({ type: "CHANNELS_STATE", channels: [channel] })), null);
	});
}
