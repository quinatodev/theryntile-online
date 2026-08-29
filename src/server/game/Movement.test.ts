import assert from "node:assert/strict";
import test from "node:test";

import { getAuthorizedPath, findPath } from "./Navigation.js";
import { RouteState } from "./RouteState.js";

const current = { row: 2, column: 2 };

test("authoritative A* accepts paths of one through five steps", () => {
	assert.equal(getAuthorizedPath(current, { row: 2, column: 3 })?.length, 1);
	assert.equal(getAuthorizedPath({ row: 0, column: 0 }, { row: 0, column: 5 })?.length, 5);
});

test("authoritative A* rejects six steps without truncating", () => {
	assert.equal(getAuthorizedPath({ row: 0, column: 0 }, { row: 0, column: 6 }), undefined);
});

test("authoritative A* follows deterministic orthogonal curves around Tile 101", () => {
	const path = findPath({ row: 5, column: 3 }, { row: 3, column: 5 });
	assert.deepEqual(path, [
		{ row: 4, column: 3 }, { row: 3, column: 3 }, { row: 3, column: 4 }, { row: 3, column: 5 },
	]);
	assert.deepEqual(findPath({ row: 5, column: 3 }, { row: 3, column: 5 }), path);
});

test("authoritative A* rejects blocked, out-of-map, and obstacle detours longer than five", () => {
	assert.equal(getAuthorizedPath({ row: 0, column: 0 }, { row: -1, column: 0 }), undefined);
	assert.equal(getAuthorizedPath({ row: 3, column: 3 }, { row: 4, column: 4 }), undefined);
	assert.equal(getAuthorizedPath({ row: 4, column: 3 }, { row: 4, column: 7 }), undefined);
});

test("Player occupancy is absent from authoritative navigation so stacking remains allowed", () => {
	assert.deepEqual(getAuthorizedPath(current, { row: 1, column: 2 }), [{ row: 1, column: 2 }]);
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
