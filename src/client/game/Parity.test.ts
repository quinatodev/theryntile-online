import assert from "node:assert/strict";
import test from "node:test";

import { GAME_CONFIG } from "../../server/game/GameConfig.js";
import { INITIAL_MAP, isCellWalkable as isServerCellWalkable } from "../../server/game/Map.js";
import { findPath as findServerPath } from "../../server/game/Navigation.js";
import { parseGameBootstrapConfig } from "./MapConfig.js";
import { isCellWalkable } from "./Map.js";
import { findPath } from "./Navigation.js";

const runtime = parseGameBootstrapConfig({
	map: GAME_CONFIG.maps.lobby, mapId: "lobby", movement: GAME_CONFIG.movement,
	zoom: GAME_CONFIG.zoom, zoomPreference: 1,
});

test("server map payload survives client parsing without a second client map definition", () => {
	assert.deepEqual(runtime.map, INITIAL_MAP);
	assert.equal(runtime.movement.maxSteps, GAME_CONFIG.movement.maxSteps);
	for (let row = -1; row <= 11; row += 1) for (let column = -1; column <= 11; column += 1) {
		assert.equal(isCellWalkable(runtime.map, row, column), isServerCellWalkable(INITIAL_MAP, row, column));
	}
});

test("independent client and server A-star implementations preserve deterministic paths", () => {
	const routes = [
		[{ row: 0, column: 0 }, { row: 0, column: 5 }],
		[{ row: 5, column: 3 }, { row: 3, column: 5 }],
		[{ row: 4, column: 3 }, { row: 4, column: 7 }],
	] as const;
	for (const [start, target] of routes) assert.deepEqual(findPath(runtime.map, start, target), findServerPath(start, target));
});
