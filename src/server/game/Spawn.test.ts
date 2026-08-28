import assert from "node:assert/strict";
import test from "node:test";

import { getRandomSpawn, type SpawnPosition } from "./Spawn.js";

const allPositions = (): SpawnPosition[] => Array.from({ length: 25 }, (_, index) => ({
	row: Math.floor(index / 5),
	column: index % 5,
}));

test("getRandomSpawn returns an available position inside the lobby", () => {
	assert.deepEqual(getRandomSpawn([{ row: 0, column: 0 }], () => 0), { row: 0, column: 1 });
});

test("getRandomSpawn returns the only available position", () => {
	const occupied = allPositions().filter(({ row, column }) => row !== 4 || column !== 3);

	assert.deepEqual(getRandomSpawn(occupied, () => 0.75), { row: 4, column: 3 });
});

test("getRandomSpawn returns undefined when every position is occupied", () => {
	assert.equal(getRandomSpawn(allPositions()), undefined);
});
