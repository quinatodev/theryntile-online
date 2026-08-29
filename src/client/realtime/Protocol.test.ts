import assert from "node:assert/strict";
import test from "node:test";

import { isMoveMessage, parseRealtimeMessage } from "./Protocol.js";

test("move accepts integer grid coordinates", () => {
	assert.equal(isMoveMessage({ type: "MOVE", row: 2, column: 3 }), true);
});

test("move rejects invalid row and column values", () => {
	assert.equal(isMoveMessage({ type: "MOVE", row: 1.5, column: 2 }), false);
	assert.equal(isMoveMessage({ type: "MOVE", row: 2, column: -1 }), false);
	assert.equal(isMoveMessage({ type: "MOVE", row: 2, column: 5 }), false);
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

test("player moved accepts an authoritative adjacent transition", () => {
	assert.deepEqual(parseRealtimeMessage(JSON.stringify({
		type: "PLAYER_MOVED",
		playerId: 1,
		fromRow: 2,
		fromColumn: 2,
		row: 2,
		column: 3,
	})), {
		type: "PLAYER_MOVED",
		playerId: 1,
		fromRow: 2,
		fromColumn: 2,
		row: 2,
		column: 3,
	});
});

for (const message of [
	{ type: "PLAYER_MOVED", playerId: 0, fromRow: 2, fromColumn: 2, row: 2, column: 3 },
	{ type: "PLAYER_MOVED", playerId: 1, fromRow: 2, fromColumn: 2, row: 3, column: 3 },
	{ type: "PLAYER_MOVED", playerId: 1, fromRow: 2, fromColumn: 2, row: 5, column: 2 },
	{ type: "PLAYER_MOVED", playerId: 1, fromRow: 2, fromColumn: 2, row: 2.5, column: 2 },
]) {
	test(`player moved rejects malformed state: ${JSON.stringify(message)}`, () => {
		assert.equal(parseRealtimeMessage(JSON.stringify(message)), null);
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
