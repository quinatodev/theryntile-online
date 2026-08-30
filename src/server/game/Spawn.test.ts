import assert from "node:assert/strict";
import test from "node:test";

import { getRandomSpawn, type SpawnArea, type SpawnPosition } from "./Spawn.js";
import { registerTile } from "./TileRegistry.js";

registerTile(600, false);

const MAP = {
	0: [[1, 1, 600, 501], [1, 1, 1, 501]],
	1: [[0, 1, 0, 0], [0, 0, 0, 0]],
};
const AREA: SpawnArea = { minRow: 0, maxRow: 1, minColumn: 0, maxColumn: 2 };
const candidates: SpawnPosition[] = [{ row: 0, column: 0 }, { row: 1, column: 0 }, { row: 1, column: 1 }, { row: 1, column: 2 }];

test("Spawn uses only single walkable Tiles inside the inclusive spawn area", () => {
	assert.deepEqual(getRandomSpawn([], () => 0, MAP, AREA), { row: 0, column: 0 });
	assert.deepEqual(getRandomSpawn([], () => 0.999, MAP, AREA), { row: 1, column: 2 });
});

test("Spawn excludes empty, stacked, and out-of-area walkable cells", () => {
	for (const random of [0, 0.25, 0.5, 0.75, 0.999]) {
		const spawn = getRandomSpawn([], () => random, MAP, AREA);
		assert.notDeepEqual(spawn, { row: 0, column: 1 });
		assert.notDeepEqual(spawn, { row: 0, column: 2 });
		assert.notDeepEqual(spawn, { row: 0, column: 3 });
	}
});

test("Spawn prefers free cells and shares a valid cell only when all candidates are occupied", () => {
	assert.deepEqual(getRandomSpawn(candidates.slice(0, -1), () => 0.5, MAP, AREA), { row: 1, column: 2 });
	assert.deepEqual(getRandomSpawn(candidates, () => 0, MAP, AREA), { row: 0, column: 0 });
});

test("Spawn fails explicitly when its area has no walkable candidate", () => {
	assert.throws(() => getRandomSpawn([], () => 0, MAP, { minRow: 0, maxRow: 0, minColumn: 1, maxColumn: 2 }), /no walkable cells/);
});
