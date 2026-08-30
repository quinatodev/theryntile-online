import assert from "node:assert/strict";
import test from "node:test";

import { parseGameBootstrapConfig } from "../../client/game/MapConfig.js";
import { createGameBootstrapPayload, GAME_CONFIG } from "./GameConfig.js";
import { Newbie, NEWBIE_SPAWN_AREA } from "./map/Newbie.js";
import { getMapLayers, validateMapDefinition } from "./Map.js";
import { getTileDefinitions } from "./TileRegistry.js";

test("GAME_CONFIG owns global settings and associates lobby with the 20x20 Newbie map", () => {
	assert.equal(GAME_CONFIG.movement.maxSteps, 5);
	assert.deepEqual(GAME_CONFIG.zoom, { max: 5, min: 2 });
	assert.equal(GAME_CONFIG.maps.lobby, Newbie);
	assert.deepEqual(getMapLayers(Newbie), [0, 1, 2]);
	assert.equal(Newbie[0].length, 20);
	assert.ok(Newbie[0].every((row) => row.length === 20));
	assert.deepEqual(NEWBIE_SPAWN_AREA, { minRow: 0, maxRow: 19, minColumn: 0, maxColumn: 10 });
});

test("every Newbie Tile is registered and the real bootstrap payload is valid", () => {
	assert.doesNotThrow(() => validateMapDefinition(Newbie));
	const payload = createGameBootstrapPayload(1);
	assert.equal(payload.map, Newbie);
	assert.doesNotThrow(() => parseGameBootstrapConfig(JSON.parse(JSON.stringify(payload))));
});

test("registered Tile definitions survive server-style JSON and client parsing", () => {
	const parsed = parseGameBootstrapConfig(JSON.parse(JSON.stringify({
		map: { 0: [[1, 501]] }, mapId: "fixture", movement: GAME_CONFIG.movement,
		tileDefinitions: getTileDefinitions(), zoom: GAME_CONFIG.zoom, zoomPreference: 1,
	})));
	assert.equal(parsed.tileDefinitions[1], true);
	assert.equal(parsed.tileDefinitions[201], true);
	assert.equal(parsed.tileDefinitions[501], true);
	assert.equal(parsed.tileDefinitions[101], false);
	assert.equal(parsed.tileDefinitions[502], false);
	assert.equal(parsed.tileDefinitions[901], false);
});
