import assert from "node:assert/strict";
import test from "node:test";

import { isTileWalkable, registerTile, registerTiles } from "./TileRegistry.js";
import { isCellWalkable } from "./Map.js";

test("Tile Registry registers single IDs and inclusive ranges", () => {
	registerTile(700, true);
	registerTiles(701, 705, false);
	assert.equal(isTileWalkable(700), true);
	for (let id = 701; id <= 705; id += 1) assert.equal(isTileWalkable(id), false);
});

test("last Tile registration wins for single IDs and overlapping ranges", () => {
	registerTiles(710, 714, false);
	registerTile(712, true);
	assert.equal(isTileWalkable(711), false);
	assert.equal(isTileWalkable(712), true);
	registerTiles(711, 713, true);
	assert.equal(isTileWalkable(711), true);
	assert.equal(isTileWalkable(713), true);
	assert.equal(isTileWalkable(714), false);
});

test("Tile Registry rejects missing and invalid IDs and ranges", () => {
	assert.throws(() => isTileWalkable(999), /Tile 999 is not registered/);
	for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => registerTile(id, true), /positive safe integer/);
	}
	assert.throws(() => registerTiles(5, 4, false), /startId/);
});

test("cell walkability requires exactly one registered walkable Tile", () => {
	registerTile(720, false);
	const map = { 0: [[1, 501, 0, 720]], 1: [[0, 1, 0, 0]] };
	assert.equal(isCellWalkable(map, 0, 0), true);
	assert.equal(isCellWalkable(map, 0, 1), false);
	assert.equal(isCellWalkable(map, 0, 2), false);
	assert.equal(isCellWalkable(map, 0, 3), false);
});
