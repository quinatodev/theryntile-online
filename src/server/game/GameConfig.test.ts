import assert from "node:assert/strict";
import test from "node:test";

import { parseGameBootstrapConfig } from "../../client/game/MapConfig.js";
import { createGameBootstrapPayload, GAME_CONFIG } from "./GameConfig.js";
import { Newbie } from "./map/Newbie.js";
import { getMapBounds, getMapLayers, validateMapDefinition } from "./Map.js";

test("GAME_CONFIG owns global settings and associates lobby with Newbie", () => {
	assert.equal(GAME_CONFIG.movement.maxSteps, 5);
	assert.deepEqual(GAME_CONFIG.zoom, { max: 3, min: 1 });
	assert.equal(GAME_CONFIG.maps.lobby, Newbie);
});

test("Newbie is rectangular across layers and preserves exact Tile counts", () => {
	assert.doesNotThrow(() => validateMapDefinition(Newbie));
	assert.deepEqual(getMapLayers(Newbie), [0, 1]);
	assert.deepEqual(getMapBounds(Newbie), { columns: 11, rows: 11 });
	assert.equal(Newbie[0].flat().filter((tileId) => tileId === 1).length, 121);
	assert.equal(Newbie[1].flat().filter((tileId) => tileId === 101).length, 9);
	assert.equal(Newbie[1].flat().filter((tileId) => tileId === 0).length, 112);
});

test("game config API payload contains only the active map and survives client bootstrap parsing", () => {
	const payload = createGameBootstrapPayload(99);
	assert.equal(payload.mapId, "lobby");
	assert.equal(payload.map, Newbie);
	assert.equal(payload.movement.maxSteps, 5);
	assert.equal(payload.zoomPreference, 3);
	assert.equal("maps" in payload, false);
	assert.equal("rows" in payload, false);
	assert.equal("columns" in payload, false);
	assert.doesNotThrow(() => parseGameBootstrapConfig(JSON.parse(JSON.stringify(payload))));
});
