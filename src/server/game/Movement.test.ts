import assert from "node:assert/strict";
import test from "node:test";

import { getAuthorizedPath, findPath } from "./Navigation.js";
import { RouteState } from "./RouteState.js";

const current = { row: 2, column: 2 };
const OPEN_MAP = { 0: Array.from({ length: 7 }, () => Array<number>(7).fill(1)) };

test("authoritative A* accepts paths of one through five steps", () => {
	assert.equal(getAuthorizedPath(current, { row: 2, column: 3 }, OPEN_MAP)?.length, 1);
	assert.equal(getAuthorizedPath({ row: 0, column: 0 }, { row: 0, column: 5 }, OPEN_MAP)?.length, 5);
});

test("authoritative A* rejects six steps without truncating", () => {
	assert.equal(getAuthorizedPath({ row: 0, column: 0 }, { row: 0, column: 6 }, OPEN_MAP), undefined);
});

test("authoritative A* follows deterministic orthogonal curves around Tile 101", () => {
	const map = { 0: Array.from({ length: 7 }, () => Array<number>(7).fill(1)), 1: Array.from({ length: 7 }, (_, row) => Array.from({ length: 7 }, (_, column) => row >= 4 && row <= 6 && column >= 4 && column <= 6 ? 1 : 0)) };
	const path = findPath({ row: 5, column: 3 }, { row: 3, column: 5 }, map);
	assert.deepEqual(path, [
		{ row: 4, column: 3 }, { row: 3, column: 3 }, { row: 3, column: 4 }, { row: 3, column: 5 },
	]);
	assert.deepEqual(findPath({ row: 5, column: 3 }, { row: 3, column: 5 }, map), path);
});

test("authoritative A* rejects blocked, out-of-map, and obstacle detours longer than five", () => {
	assert.equal(getAuthorizedPath({ row: 0, column: 0 }, { row: -1, column: 0 }, OPEN_MAP), undefined);
	assert.equal(getAuthorizedPath({ row: 3, column: 3 }, { row: 4, column: 4 }, { 0: OPEN_MAP[0], 1: OPEN_MAP[0] }), undefined);
	assert.equal(getAuthorizedPath({ row: 4, column: 3 }, { row: 4, column: 7 }, OPEN_MAP), undefined);
});

test("Player occupancy is absent from authoritative navigation so stacking remains allowed", () => {
	assert.deepEqual(getAuthorizedPath(current, { row: 1, column: 2 }, OPEN_MAP), [{ row: 1, column: 2 }]);
});

test("authoritative A-star rejects gaps, isolated Tiles, and real detours above maxSteps", () => {
	const gap = { 0: [[1, 1, 0, 501]] };
	assert.equal(findPath({ row: 0, column: 0 }, { row: 0, column: 3 }, gap), undefined);
	const detour = { 0: [
		[1, 1, 1, 1, 1],
		[1, 0, 0, 0, 1],
		[1, 1, 1, 1, 1],
	] };
	assert.equal(getAuthorizedPath({ row: 1, column: 0 }, { row: 1, column: 4 }, detour), undefined);
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

test("route cancellation clears its active timer and prevents residual ownership", () => {
	const routes = new RouteState<object>();
	const player = {};
	let emitted = false;
	const timer = setTimeout(() => { emitted = true; }, 20);

	assert.equal(routes.begin(player), true);
	routes.setTimer(player, timer);
	routes.cancel(player);
	assert.equal(routes.has(player), false);

	return new Promise<void>((resolve) => setTimeout(() => {
		assert.equal(emitted, false);
		resolve();
	}, 30));
});
