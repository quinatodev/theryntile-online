import assert from "node:assert/strict";
import test from "node:test";

import { parseRealtimeMessage } from "./Protocol.js";

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
