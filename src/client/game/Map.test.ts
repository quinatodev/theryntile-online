import assert from "node:assert/strict";
import test from "node:test";

import { getMapBounds, getMapLayers, getMapTileIds, isCellWalkable } from "./Map.js";
import { findPath, getReachableCells, isValidDestination } from "./Navigation.js";
import { parseGameBootstrapConfig } from "./MapConfig.js";

/** Lang: pt-BR - Cria a forma serializada do bootstrap Newbie. Lang: en-US - Creates the serialized Newbie bootstrap shape. */
export const createSerializedNewbiePayload = () => ({
	map: {
		0: Array.from({ length: 11 }, () => Array<number>(11).fill(1)),
		1: Array.from({ length: 11 }, (_, row) => Array.from(
			{ length: 11 }, (_, column) => row >= 4 && row <= 6 && column >= 4 && column <= 6 ? 101 : 0,
		)),
	},
	mapId: "lobby",
	movement: { maxSteps: 5 },
	tileDefinitions: { 1: true, 101: false, 501: true },
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
	assert.equal(isCellWalkable(map, { 1: true, 101: false, 501: true }, 3, 3), true);
	assert.equal(isCellWalkable(map, { 1: true, 101: false, 501: true }, 4, 4), false);
});

test("client A-star uses the runtime map and runtime movement limit", () => {
	const config = parseGameBootstrapConfig(createSerializedNewbiePayload());
	assert.deepEqual(findPath(config.map, config.tileDefinitions, { row: 0, column: 0 }, { row: 0, column: 5 })?.length, 5);
	assert.equal(isValidDestination(config.map, config.tileDefinitions, { row: 0, column: 0 }, { row: 0, column: 5 }, config.movement.maxSteps), true);
	assert.equal(isValidDestination(config.map, config.tileDefinitions, { row: 0, column: 0 }, { row: 0, column: 6 }, config.movement.maxSteps), false);
	assert.ok(getReachableCells(config.map, config.tileDefinitions, { row: 5, column: 3 }, config.movement.maxSteps)
		.every(({ row, column }) => isCellWalkable(config.map, config.tileDefinitions, row, column)));
});

test("client walkability rejects empty and stacked cells and A-star cannot reach isolated Tiles", () => {
	const definitions = { 1: true, 501: true };
	const map = { 0: [[1, 1, 0, 501], [0, 0, 0, 0]], 1: [[0, 1, 0, 0], [0, 0, 0, 501]] };
	assert.equal(isCellWalkable(map, definitions, 0, 0), true);
	assert.equal(isCellWalkable(map, definitions, 0, 1), false);
	assert.equal(isCellWalkable(map, definitions, 0, 2), false);
	assert.equal(isCellWalkable(map, definitions, 0, 3), true);
	assert.equal(findPath(map, definitions, { row: 0, column: 0 }, { row: 0, column: 3 }), undefined);
	assert.equal(findPath(map, definitions, { row: 0, column: 0 }, { row: 1, column: 3 }), undefined);
});
