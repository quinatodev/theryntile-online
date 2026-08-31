import assert from "node:assert/strict";
import test from "node:test";

import { getAuthorizedPath, findPath } from "./Navigation.js";
import { RouteState } from "./RouteState.js";
import { GAME_CONFIG } from "./GameConfig.js";

const current = { row: 2, column: 2 };
const OPEN_MAP_SIZE = GAME_CONFIG.movement.maxSteps + 2;
const OPEN_MAP = { 0: Array.from({ length: OPEN_MAP_SIZE }, () => Array<number>(OPEN_MAP_SIZE).fill(1)) };

test("authoritative A* accepts one step and the configured maximum path cost", () => {
	assert.equal(getAuthorizedPath(current, { row: 2, column: 3 }, OPEN_MAP)?.length, 1);
	assert.equal(getAuthorizedPath({ row: 0, column: 0 }, { row: 0, column: GAME_CONFIG.movement.maxSteps }, OPEN_MAP)?.length, GAME_CONFIG.movement.maxSteps);
});

test("authoritative A* rejects maxSteps + 1 without truncating", () => {
	assert.equal(getAuthorizedPath({ row: 0, column: 0 }, { row: 0, column: GAME_CONFIG.movement.maxSteps + 1 }, OPEN_MAP), undefined);
});

test("authoritative A* follows deterministic orthogonal curves around stacked obstacles", () => {
	const map = { 0: Array.from({ length: 7 }, () => Array<number>(7).fill(1)), 1: Array.from({ length: 7 }, (_, row) => Array.from({ length: 7 }, (_, column) => row >= 4 && row <= 6 && column >= 4 && column <= 6 ? 1 : 0)) };
	const path = findPath({ row: 5, column: 3 }, { row: 3, column: 5 }, map);
	assert.deepEqual(path, [
		{ row: 4, column: 3 }, { row: 3, column: 3 }, { row: 3, column: 4 }, { row: 3, column: 5 },
	]);
	assert.deepEqual(findPath({ row: 5, column: 3 }, { row: 3, column: 5 }, map), path);
});

test("authoritative A* rejects blocked, out-of-map, and out-of-bounds targets", () => {
	assert.equal(getAuthorizedPath({ row: 0, column: 0 }, { row: -1, column: 0 }, OPEN_MAP), undefined);
	assert.equal(getAuthorizedPath({ row: 3, column: 3 }, { row: 4, column: 4 }, { 0: OPEN_MAP[0], 1: OPEN_MAP[0] }), undefined);
	assert.equal(getAuthorizedPath({ row: 4, column: 3 }, { row: 4, column: OPEN_MAP_SIZE }, OPEN_MAP), undefined);
});

test("authoritative A-star rejects gaps, isolated Tiles, and real detours above maxSteps", () => {
	const gap = { 0: [[1, 1, 0, 501]] };
	assert.equal(findPath({ row: 0, column: 0 }, { row: 0, column: 3 }, gap), undefined);
	const width = GAME_CONFIG.movement.maxSteps;
	const openRow = Array<number>(width).fill(1);
	const blockedMiddle = Array.from({ length: width }, (_, column) => column === 0 || column === width - 1 ? 1 : 0);
	const detour = { 0: [openRow, blockedMiddle, [...openRow]] };
	const start = { row: 1, column: 0 };
	const destination = { row: 1, column: width - 1 };
	const realPath = findPath(start, destination, detour);
	assert.ok(realPath);
	assert.equal(realPath.length, GAME_CONFIG.movement.maxSteps + 1);
	assert.equal(getAuthorizedPath(start, destination, detour), undefined);
});

test("authoritative route lock rejects concurrent intent and unlocks after completion or cleanup", () => {
	const routes = new RouteState<object>();
	const player = {};
	assert.equal(routes.begin(player), true);
	assert.equal(routes.begin(player), false);
	assert.equal(routes.has(player), true);
	routes.cancel(player);
	assert.equal(routes.has(player), false);
	assert.equal(routes.begin(player), true);
	routes.clear();
	assert.equal(routes.has(player), false);
});

test("route cancellation clears its active timer and prevents residual ownership", (context) => {
	const routes = new RouteState<object>();
	const player = {};
	const clearTimeoutMock = context.mock.method(globalThis, "clearTimeout");
	const timer = setTimeout(() => {}, 60_000);

	assert.equal(routes.begin(player), true);
	routes.setTimer(player, timer);
	routes.cancel(player);
	assert.equal(routes.has(player), false);
	assert.equal(clearTimeoutMock.mock.callCount(), 1);
});
