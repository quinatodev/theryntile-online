import assert from "node:assert/strict";
import test from "node:test";

import { canMoveTo } from "./Movement.js";

const current = { row: 2, column: 2 };

test("accepts an orthogonally adjacent free tile", () => {
	assert.equal(canMoveTo(current, { row: 2, column: 3 }), true);
});

test("rejects a distant tile", () => {
	assert.equal(canMoveTo(current, { row: 2, column: 4 }), false);
});

test("rejects a logical diagonal", () => {
	assert.equal(canMoveTo(current, { row: 3, column: 3 }), false);
});

test("rejects a destination outside the map", () => {
	assert.equal(canMoveTo({ row: 0, column: 0 }, { row: -1, column: 0 }), false);
	assert.equal(canMoveTo({ row: 4, column: 4 }, { row: 4, column: 5 }), false);
});

test("accepts a tile occupied by another player because stacking is allowed", () => {
	assert.equal(canMoveTo(current, { row: 1, column: 2 }), true);
});
