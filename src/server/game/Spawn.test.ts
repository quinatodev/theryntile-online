import assert from "node:assert/strict";
import test from "node:test";

import { getRandomSpawn, type SpawnPosition } from "./Spawn.js";
import { getMapBounds, INITIAL_MAP, isCellWalkable } from "./Map.js";

const { columns: MAP_COLUMNS, rows: MAP_ROWS } = getMapBounds(INITIAL_MAP);

const allPositions = (): SpawnPosition[] => Array.from({ length: MAP_ROWS * MAP_COLUMNS }, (_, index) => ({
	row: Math.floor(index / MAP_COLUMNS),
	column: index % MAP_COLUMNS,
})).filter(({ row, column }) => isCellWalkable(INITIAL_MAP, row, column));

test("getRandomSpawn returns an available position inside the lobby", () => {
	assert.deepEqual(getRandomSpawn([{ row: 0, column: 0 }], () => 0), { row: 0, column: 1 });
});

test("getRandomSpawn returns the only available position", () => {
	const occupied = allPositions().filter(({ row, column }) => row !== 10 || column !== 9);

	assert.deepEqual(getRandomSpawn(occupied, () => 0.75), { row: 10, column: 9 });
});

test("getRandomSpawn returns a valid fallback when every position is occupied", () => {
	assert.deepEqual(getRandomSpawn(allPositions(), () => 0), { row: 0, column: 0 });
	assert.deepEqual(getRandomSpawn(allPositions(), () => 0.999), { row: 10, column: 10 });
});

test("getRandomSpawn never uses the blocked central 3x3 area", () => {
	for (const random of [0, 0.25, 0.5, 0.75, 0.999]) {
		const spawn = getRandomSpawn([], () => random);
		assert.equal(isCellWalkable(INITIAL_MAP, spawn.row, spawn.column), true);
	}
});
