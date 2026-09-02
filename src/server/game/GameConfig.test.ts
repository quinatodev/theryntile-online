import assert from "node:assert/strict";
import test from "node:test";

import { parseGameBootstrapConfig } from "../../client/game/MapConfig.js";
import { clampZoom, createGameBootstrapPayload, GAME_CONFIG, INVENTORY_COLUMNS_MAX, INVENTORY_COLUMNS_MIN, INVENTORY_POSITION_LIMIT, isAllowedInventoryColumns, isAllowedInventoryCoordinate, isAllowedZoom } from "./GameConfig.js";
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
	assert.equal(isAllowedInventoryCoordinate(0), true);
	assert.equal(isAllowedInventoryCoordinate(INVENTORY_POSITION_LIMIT), true);
	assert.equal(isAllowedInventoryCoordinate(-1), false);
	assert.equal(isAllowedInventoryCoordinate(INVENTORY_POSITION_LIMIT + 1), false);
	assert.equal(isAllowedInventoryCoordinate(1.5), false);
	assert.equal(isAllowedInventoryColumns(INVENTORY_COLUMNS_MIN), true);
	assert.equal(isAllowedInventoryColumns(5), true);
	assert.equal(isAllowedInventoryColumns(INVENTORY_COLUMNS_MAX), true);
	assert.equal(isAllowedInventoryColumns(3), false);
	assert.equal(isAllowedInventoryColumns(7), false);
	assert.equal(isAllowedInventoryColumns(4.5), false);
});

test("every Newbie Tile is registered and the real bootstrap payload is valid", () => {
	assert.doesNotThrow(() => validateMapDefinition(Newbie));
	const payload = createGameBootstrapPayload(1);
	assert.equal(payload.map, Newbie);
	assert.equal(payload.zoomPreference, GAME_CONFIG.zoom.min);
	assert.equal(payload.inventoryPosition, null);
	assert.equal(payload.inventoryColumns, INVENTORY_COLUMNS_MIN);
	assert.doesNotThrow(() => parseGameBootstrapConfig(JSON.parse(JSON.stringify(payload))));
});
