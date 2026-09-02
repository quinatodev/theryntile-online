import assert from "node:assert/strict";
import test from "node:test";

import { isCellWalkable as isServerCellWalkable } from "../../server/game/Map.js";
import { findPath as findServerPath } from "../../server/game/Navigation.js";
import { registerTile } from "../../server/game/TileRegistry.js";
import { parseGameBootstrapConfig } from "./MapConfig.js";
import { isCellWalkable } from "./Map.js";
import { findPath } from "./Navigation.js";

registerTile(600, false);

const MAP = {
	0: [[1, 1, 600, 501], [1, 1, 0, 0], [1, 1, 1, 501]],
	1: [[0, 1, 0, 0], [0, 0, 501, 0], [0, 0, 0, 0]],
	2: [[0, 0, 0, 0], [0, 0, 0, 501], [0, 0, 0, 0]],
};
const runtime = parseGameBootstrapConfig({
	map: MAP, mapId: "fixture", movement: { maxSteps: 5 }, tileDefinitions: { 1: true, 501: true, 600: false },
	zoom: { min: 1, max: 3 }, zoomPreference: 1, inventoryColumns: 4, inventoryPosition: null,
});

test("server payload round-trip preserves Tile definitions and cell-walkability parity", () => {
	assert.deepEqual(runtime.tileDefinitions, { 1: true, 501: true, 600: false });
	for (let row = -1; row <= 3; row += 1) for (let column = -1; column <= 4; column += 1) {
		assert.equal(
			isCellWalkable(runtime.map, runtime.tileDefinitions, row, column),
			isServerCellWalkable(MAP, row, column),
		);
	}
});

test("client and server A-star agree for continuous, empty, stacked, and upper-layer-only routes", () => {
	const routes = [
		[{ row: 1, column: 0 }, { row: 1, column: 2 }],
		[{ row: 0, column: 0 }, { row: 0, column: 3 }],
		[{ row: 1, column: 0 }, { row: 0, column: 1 }],
		[{ row: 1, column: 0 }, { row: 2, column: 3 }],
	] as const;
	for (const [start, target] of routes) {
		assert.deepEqual(findPath(runtime.map, runtime.tileDefinitions, start, target), findServerPath(start, target, MAP));
	}
});
