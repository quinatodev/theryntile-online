import assert from "node:assert/strict";
import test from "node:test";

import { parseGameBootstrapConfig } from "../../client/game/MapConfig.js";
import { clampZoom, createGameBootstrapPayload, GAME_CONFIG, isAllowedZoom } from "./GameConfig.js";
import { Newbie } from "./map/Newbie.js";
import { validateMapDefinition } from "./Map.js";

test("GAME_CONFIG exposes valid adjustable ranges and clamps zoom through their configured boundaries", () => {
	assert.ok(Number.isSafeInteger(GAME_CONFIG.movement.maxSteps) && GAME_CONFIG.movement.maxSteps > 0);
	assert.ok(Number.isSafeInteger(GAME_CONFIG.zoom.min));
	assert.ok(Number.isSafeInteger(GAME_CONFIG.zoom.max));
	assert.ok(GAME_CONFIG.zoom.min <= GAME_CONFIG.zoom.max);
	assert.equal(GAME_CONFIG.maps.lobby, Newbie);
	assert.equal(clampZoom(GAME_CONFIG.zoom.min - 100), GAME_CONFIG.zoom.min);
	assert.equal(clampZoom(GAME_CONFIG.zoom.max + 100), GAME_CONFIG.zoom.max);
	assert.equal(clampZoom(GAME_CONFIG.zoom.min), GAME_CONFIG.zoom.min);
	assert.equal(isAllowedZoom(GAME_CONFIG.zoom.min), true);
	assert.equal(isAllowedZoom(GAME_CONFIG.zoom.max), true);
	assert.equal(isAllowedZoom(GAME_CONFIG.zoom.min + 0.25), true);
	assert.equal(isAllowedZoom(Number.NaN), false);
	assert.equal(isAllowedZoom(Number.POSITIVE_INFINITY), false);
	assert.equal(isAllowedZoom(GAME_CONFIG.zoom.min - 1), false);
	assert.equal(isAllowedZoom(GAME_CONFIG.zoom.max + 1), false);
});

test("every Newbie Tile is registered and the real bootstrap payload is valid", () => {
	assert.doesNotThrow(() => validateMapDefinition(Newbie));
	const payload = createGameBootstrapPayload(1);
	assert.equal(payload.map, Newbie);
	assert.equal(payload.zoomPreference, GAME_CONFIG.zoom.min);
	assert.doesNotThrow(() => parseGameBootstrapConfig(JSON.parse(JSON.stringify(payload))));
});
