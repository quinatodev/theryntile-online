import assert from "node:assert/strict";
import test from "node:test";

import { compareRenderOrder, getPlayerSortingGrid, type RenderOrder } from "./Lobby.js";
import { type PlayerMovement } from "./Player.js";

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
		const movement: PlayerMovement = {
			...transition, progress: 0.499, startX: 0, startY: 0, targetX: 0, targetY: 0,
		};
		const player = { column: transition.column, movement, row: transition.row };

		assert.deepEqual(getPlayerSortingGrid(player), { column: transition.fromColumn, row: transition.fromRow });

		movement.progress = 0.5;
		assert.deepEqual(getPlayerSortingGrid(player), { column: transition.column, row: transition.row });
	}
});
