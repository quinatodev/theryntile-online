import assert from "node:assert/strict";
import test from "node:test";

import { type MovementComponent } from "../Components.js";
import {
	applySpriteOffset,
	compareRenderOrder,
	getHighlightDiamond,
	getHighlightRenderOrder,
	getMovementSortingGrid,
	getTileHighlightState,
	type RenderOrder,
} from "./RenderSystem.js";

interface NamedRenderOrder extends RenderOrder { name: string; }

const orderedNames = (items: NamedRenderOrder[]) => items.sort(compareRenderOrder).map(({ name }) => name);

test("grid order takes precedence over layer and order", () => {
	const previous = { column: 0, depth: 0, layer: 999, name: "previous", order: 999_999, row: 0 };
	const next = { column: 0, depth: 1, layer: 0, name: "next", order: -999_999, row: 1 };
	assert.deepEqual(orderedNames([next, previous]), ["previous", "next"]);
});

test("layer orders drawables only inside the same grid", () => {
	const ground = { column: 0, depth: 0, layer: 0, name: "ground", order: 10, row: 0 };
	const player = { column: 0, depth: 0, layer: 1, name: "player", order: 0, row: 0 };
	assert.deepEqual(orderedNames([player, ground]), ["ground", "player"]);
});

test("order breaks ties only inside the same layer of the same grid", () => {
	const first = { column: 0, depth: 0, layer: 1, name: "first", order: 0, row: 0 };
	const second = { column: 0, depth: 0, layer: 1, name: "second", order: 1, row: 0 };
	assert.deepEqual(orderedNames([second, first]), ["first", "second"]);
});

test("isometric grids stay grouped before their local layers are sorted", () => {
	const item = (row: number, column: number, layer: number, order: number, name: string): NamedRenderOrder => ({
		column, depth: row + column, layer, name, order, row,
	});
	const shuffled = [
		item(0, 2, 0, 0, "0,2 tile"), item(0, 0, 2, 0, "0,0 top"),
		item(1, 0, 1, 1, "1,0 player"), item(1, 1, 0, 0, "1,1 tile"),
		item(0, 1, 0, 0, "0,1 tile"), item(2, 0, 0, 0, "2,0 tile"),
		item(0, 0, 0, 0, "0,0 tile"), item(1, 0, 0, 0, "1,0 tile"),
	];
	assert.deepEqual(orderedNames(shuffled), [
		"0,0 tile", "0,0 top", "0,1 tile", "1,0 tile", "1,0 player",
		"0,2 tile", "1,1 tile", "2,0 tile",
	]);
});

test("moving players switch sorting grid once at the shared tile boundary in every direction", () => {
	const transitions = [
		{ fromColumn: 2, fromRow: 2, column: 3, row: 2 },
		{ fromColumn: 2, fromRow: 2, column: 1, row: 2 },
		{ fromColumn: 2, fromRow: 2, column: 2, row: 3 },
		{ fromColumn: 2, fromRow: 2, column: 2, row: 1 },
	];
	for (const transition of transitions) {
		const movement: MovementComponent = {
			fromColumn: transition.fromColumn, fromRow: transition.fromRow, progress: 0.499,
			startX: 0, startY: 0, targetColumn: transition.column, targetRow: transition.row, targetX: 0, targetY: 0,
		};
		const gridPosition = { column: transition.column, row: transition.row };
		assert.deepEqual(getMovementSortingGrid(gridPosition, movement), { column: transition.fromColumn, row: transition.fromRow });
		movement.progress = 0.5;
		assert.deepEqual(getMovementSortingGrid(gridPosition, movement), { column: transition.column, row: transition.row });
	}
});

test("highlight ordering remains local to its Tile grid", () => {
	const earlierHighlight = { ...getHighlightRenderOrder({ column: 0, row: 0 }), name: "highlight" };
	const laterTile = { column: 0, depth: 1, layer: 0, name: "later tile", order: 0, row: 1 };
	assert.deepEqual(orderedNames([laterTile, earlierHighlight]), ["highlight", "later tile"]);
});

test("Tile and highlight share layer zero while order draws the highlight above the Tile", () => {
	const tile = { column: 2, depth: 3, layer: 0, name: "tile", order: 0, row: 1 };
	const highlight = { ...getHighlightRenderOrder({ column: 2, row: 1 }), name: "highlight" };
	const player = { column: 2, depth: 3, layer: 2, name: "player", order: 7, row: 1 };
	assert.equal(highlight.layer, 0);
	assert.ok(tile.order < highlight.order);
	assert.deepEqual(orderedNames([player, highlight, tile]), ["tile", "highlight", "player"]);
});

test("Hover and Selected highlights both use the same local order above the Tile", () => {
	const gridPosition = { column: 3, row: 4 };
	assert.deepEqual(getHighlightRenderOrder(gridPosition), { ...gridPosition, depth: 7, layer: 0, order: 1 });
});

test("Selected has visual precedence and produces one highlight state", () => {
	assert.equal(getTileHighlightState(false, true), "hovered");
	assert.equal(getTileHighlightState(true, false), "selected");
	assert.equal(getTileHighlightState(true, true), "selected");
	assert.equal(getTileHighlightState(false, false), undefined);
});

test("highlight diamond matches the visual ground footprint with its 8px vertical offset and 2x1 inset", () => {
	assert.deepEqual(getHighlightDiamond({ x: 16, y: 24 }), [
		{ x: 16, y: 33 },
		{ x: 30, y: 40 },
		{ x: 16, y: 47 },
		{ x: 2, y: 40 },
	]);
});

test("sprite offsets translate only the final drawing position", () => {
	assert.deepEqual(applySpriteOffset({ x: 100, y: 50 }, { offsetX: 3, offsetY: -4 }), { x: 103, y: 46 });
	assert.deepEqual(applySpriteOffset({ x: 100, y: 50 }, { offsetX: 0, offsetY: 0 }), { x: 100, y: 50 });
});

test("sprite offsets do not participate in Player sorting", () => {
	const renderOrder = { column: 2, depth: 3, layer: 2, order: 7, row: 1 };
	applySpriteOffset({ x: 100, y: 50 }, { offsetX: 999, offsetY: -999 });
	assert.deepEqual(renderOrder, { column: 2, depth: 3, layer: 2, order: 7, row: 1 });
});
