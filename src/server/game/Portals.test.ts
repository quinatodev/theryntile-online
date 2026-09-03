import assert from "node:assert/strict";
import test from "node:test";

import { GAME_CONFIG } from "./GameConfig.js";
import { isCellWalkable } from "./Map.js";
import { authorizePortalUse, findPortal, getRoamingCandidates, PORTALS, resolvePortalInstanceId } from "./Portals.js";

test("SPAWN portals preserve editor row/column convention and occupy walkable global cells", () => {
	assert.deepEqual(PORTALS.map(({ row, column }) => ({ row, column })), [{ row: 23, column: 37 }, { row: 22, column: 22 }]);
	for (const portal of PORTALS) assert.equal(isCellWalkable(GAME_CONFIG.maps.lobby, portal.row, portal.column), true);
	assert.equal(findPortal("lobby", 23, 37)?.id, "private-test");
});

test("portal authority requires the requested ID at the Player's current server-owned map cell", () => {
	assert.equal(authorizePortalUse("lobby", 23, 37, "private-test")?.destinationMapId, "singleplayer-test");
	assert.equal(authorizePortalUse("lobby", 23, 36, "private-test"), undefined);
	assert.equal(authorizePortalUse("singleplayer-test", 23, 37, "private-test"), undefined);
	assert.equal(authorizePortalUse("lobby", 23, 37, "shared-test"), undefined);
});

test("private portal isolates instance identity while shared portal converges players", () => {
	assert.notEqual(resolvePortalInstanceId(PORTALS[0], 1), resolvePortalInstanceId(PORTALS[0], 2));
	assert.equal(resolvePortalInstanceId(PORTALS[1], 1), resolvePortalInstanceId(PORTALS[1], 2));
});

test("test maps are 10x10 walkable ground and Stag roaming stays orthogonal and bounded", () => {
	for (const mapId of ["singleplayer-test", "multiplayer-test"] as const) {
		const map = GAME_CONFIG.maps[mapId];
		assert.equal(map[0]?.length, 10);
		assert.ok(map[0]?.every((row) => row.length === 10 && row.every((tile) => tile === 1)));
	}
	assert.deepEqual(getRoamingCandidates(0, 0, 10, 10), [{ row: 0, column: 1 }, { row: 1, column: 0 }]);
	for (const next of getRoamingCandidates(5, 5, 10, 10)) assert.equal(Math.abs(next.row - 5) + Math.abs(next.column - 5), 1);
});
