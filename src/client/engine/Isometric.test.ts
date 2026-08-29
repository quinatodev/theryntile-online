import assert from "node:assert/strict";
import test from "node:test";

import { gridToIsometric, worldToGrid } from "./Isometric.js";

const TILE_WIDTH = 32;
const TILE_HEIGHT = 16;

test("inverse projection maps every tile center back to its grid position", () => {
	for (let row = 0; row < 5; row += 1) {
		for (let column = 0; column < 5; column += 1) {
			const world = gridToIsometric(column, row, TILE_WIDTH, TILE_HEIGHT);

			assert.deepEqual(worldToGrid(world.x, world.y + TILE_HEIGHT / 2, TILE_WIDTH, TILE_HEIGHT), { row, column });
		}
	}
});

test("inverse projection keeps a point inside the tile diamond", () => {
	const world = gridToIsometric(2, 2, TILE_WIDTH, TILE_HEIGHT);

	assert.deepEqual(worldToGrid(world.x + 15, world.y + TILE_HEIGHT / 2, TILE_WIDTH, TILE_HEIGHT), { row: 2, column: 2 });
});
