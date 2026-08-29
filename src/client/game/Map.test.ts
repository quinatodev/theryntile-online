import assert from "node:assert/strict";
import test from "node:test";

import { type GridPosition } from "../ecs/Components.js";
import { GAME_MAP, getLayerVisualOffsetY, getTileTextureSource, isCellWalkable, isTileWalkable, MAP_COLUMNS, MAP_LAYERS, MAP_ROWS, MAP_TILE_IDS, MapLayer } from "./Map.js";
import { findPath, getReachableCells, isValidDestination } from "./Navigation.js";

test("numeric map entry is 11x11 with 121 grass Tiles and the exact central 3x3 block", () => {
	assert.equal(MAP_ROWS, 11);
	assert.equal(MAP_COLUMNS, 11);
	for (const layer of MAP_LAYERS) {
		assert.equal(GAME_MAP[layer].length, 11);
		assert.ok(GAME_MAP[layer].every((row) => row.length === 11));
	}
	assert.equal(GAME_MAP[MapLayer.GROUND].flat().filter((id) => id === 1).length, 121);
	const upper = GAME_MAP[MapLayer.LEVEL_1];
	assert.equal(upper.flat().filter((id) => id === 101).length, 9);
	assert.deepEqual(MAP_TILE_IDS, [1, 101]);
	assert.equal(getTileTextureSource(1), "/assets/textures/tiles/grass/tile1.png");
	assert.equal(getTileTextureSource(101), "/assets/textures/tiles/ice/tile101.png");
	for (let row = 0; row < 11; row += 1) for (let column = 0; column < 11; column += 1) {
		assert.equal(upper[row]?.[column], row >= 4 && row <= 6 && column >= 4 && column <= 6 ? 101 : 0);
	}
});

test("walkability and layer height centralize Tile 101 and visual stacking rules", () => {
	assert.equal(isTileWalkable(1), true);
	assert.equal(isTileWalkable(101), false);
	assert.equal(isCellWalkable(3, 3), true);
	assert.equal(isCellWalkable(4, 4), false);
	assert.deepEqual([0, 1, 2].map(getLayerVisualOffsetY), [0, -8, -16]);
});

test("client A* is deterministic, orthogonal, avoids obstacles, and enforces real path limit", () => {
	assert.deepEqual(findPath({ row: 0, column: 0 }, { row: 0, column: 1 }), [{ row: 0, column: 1 }]);
	const curved = findPath({ row: 5, column: 3 }, { row: 3, column: 5 });
	assert.deepEqual(curved, [
		{ row: 4, column: 3 }, { row: 3, column: 3 }, { row: 3, column: 4 }, { row: 3, column: 5 },
	]);
	assert.deepEqual(findPath({ row: 5, column: 3 }, { row: 3, column: 5 }), curved);
	assert.equal(findPath({ row: 0, column: 0 }, { row: 4, column: 4 }), undefined);
	assert.equal(isValidDestination({ row: 0, column: 0 }, { row: 0, column: 5 }), true);
	assert.equal(isValidDestination({ row: 0, column: 0 }, { row: 0, column: 6 }), false);
	assert.equal(isValidDestination({ row: 4, column: 3 }, { row: 4, column: 7 }), false);
	for (const [index, step] of (curved ?? []).entries()) {
		const previous: GridPosition = index === 0 ? { row: 5, column: 3 } : curved[index - 1] as GridPosition;
		assert.equal(Math.abs(step.row - previous.row) + Math.abs(step.column - previous.column), 1);
	}
	assert.ok(getReachableCells({ row: 5, column: 3 }).every(({ row, column }) => isCellWalkable(row, column)));
});
