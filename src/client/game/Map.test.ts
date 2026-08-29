import assert from "node:assert/strict";
import test from "node:test";

import { getMapBounds, getMapLayers, getMapTileIds, isCellWalkable } from "./Map.js";
import { findPath, getReachableCells, isValidDestination } from "./Navigation.js";
import { parseGameBootstrapConfig } from "./MapConfig.js";

export const createSerializedNewbiePayload = () => ({
	map: {
		0: Array.from({ length: 11 }, () => Array<number>(11).fill(1)),
		1: Array.from({ length: 11 }, (_, row) => Array.from(
			{ length: 11 }, (_, column) => row >= 4 && row <= 6 && column >= 4 && column <= 6 ? 101 : 0,
		)),
	},
	mapId: "lobby",
	movement: { maxSteps: 5 },
	zoom: { max: 3, min: 1 },
	zoomPreference: 2,
});

test("serialized API map produces the Newbie dimensions, layers, Tile IDs, and walkability", () => {
	const { map } = parseGameBootstrapConfig(createSerializedNewbiePayload());
	assert.deepEqual(getMapBounds(map), { columns: 11, rows: 11 });
	assert.deepEqual(getMapLayers(map), [0, 1]);
	assert.deepEqual(getMapTileIds(map), [1, 101]);
	assert.equal(map[0]?.flat().filter((id) => id === 1).length, 121);
	assert.equal(map[1]?.flat().filter((id) => id === 101).length, 9);
	assert.equal(isCellWalkable(map, 3, 3), true);
	assert.equal(isCellWalkable(map, 4, 4), false);
});

test("client A-star uses the runtime map and runtime movement limit", () => {
	const config = parseGameBootstrapConfig(createSerializedNewbiePayload());
	assert.deepEqual(findPath(config.map, { row: 0, column: 0 }, { row: 0, column: 5 })?.length, 5);
	assert.equal(isValidDestination(config.map, { row: 0, column: 0 }, { row: 0, column: 5 }, config.movement.maxSteps), true);
	assert.equal(isValidDestination(config.map, { row: 0, column: 0 }, { row: 0, column: 6 }, config.movement.maxSteps), false);
	assert.ok(getReachableCells(config.map, { row: 5, column: 3 }, config.movement.maxSteps)
		.every(({ row, column }) => isCellWalkable(config.map, row, column)));
});
