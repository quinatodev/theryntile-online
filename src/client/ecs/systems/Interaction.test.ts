import assert from "node:assert/strict";
import test from "node:test";

import { HoverSystem } from "./HoverSystem.js";
import { SelectSystem } from "./SelectSystem.js";
import { WalkHintSystem } from "./WalkHintSystem.js";
import { World } from "../World.js";

const TEST_MAP = {
	0: Array.from({ length: 11 }, () => Array<number>(11).fill(1)),
	1: Array.from({ length: 11 }, (_, row) => Array.from(
		{ length: 11 }, (_, column) => row === 4 && column === 4 ? 101 : 0,
	)),
};
const TEST_TILE_DEFINITIONS = { 1: true, 101: false };

const createTileWorld = () => {
	const world = new World();
	const first = world.createEntity();
	const second = world.createEntity();
	world.tiles.set(first, { textureId: 1 });
	world.gridPositions.set(first, { column: 0, row: 0 });
	world.renderables.set(first, { layer: 0, order: 0 });
	world.tiles.set(second, { textureId: 1 });
	world.gridPositions.set(second, { column: 1, row: 0 });
	world.renderables.set(second, { layer: 0, order: 0 });

	return { first, second, world };
};

test("HoverSystem resolves one Tile with Camera/zoom and clears hover outside", () => {
	const { first, second, world } = createTileWorld();
	const system = new HoverSystem();
	const camera = { x: 0, y: 0, zoom: 2 };
	assert.equal(system.update(world, TEST_MAP, TEST_TILE_DEFINITIONS, camera, 100, 100, { canvasX: 50, canvasY: 82, inside: true }), first);
	assert.deepEqual([...world.hoveredTiles], [first]);
	assert.equal(system.update(world, TEST_MAP, TEST_TILE_DEFINITIONS, camera, 100, 100, { canvasX: 82, canvasY: 98, inside: true }), second);
	assert.deepEqual([...world.hoveredTiles], [second]);
	assert.equal(system.update(world, TEST_MAP, TEST_TILE_DEFINITIONS, camera, 100, 100, { canvasX: 0, canvasY: 0, inside: false }), undefined);
	assert.equal(world.hoveredTiles.size, 0);
});

test("a Player on a Tile does not prevent HoverSystem from resolving that Tile", () => {
	const { first, world } = createTileWorld();
	const player = world.createEntity();
	world.players.set(player, { id: 1, name: "Hana" });
	world.gridPositions.set(player, { column: 0, row: 0 });
	assert.equal(new HoverSystem().update(world, TEST_MAP, TEST_TILE_DEFINITIONS, { x: 0, y: 0, zoom: 1 }, 100, 100, { canvasX: 50, canvasY: 66, inside: true }), first);
});

test("HoverSystem does not capture the area 8px above the visual ground", () => {
	const { world } = createTileWorld();
	const hovered = new HoverSystem().update(
		world,
		TEST_MAP,
		TEST_TILE_DEFINITIONS,
		{ x: 0, y: 0, zoom: 1 },
		100,
		100,
		{ canvasX: 50, canvasY: 54, inside: true },
	);
	assert.equal(hovered, undefined);
	assert.equal(world.hoveredTiles.size, 0);
});

test("SelectSystem keeps exactly one selected Tile independently from hover", () => {
	const { first, second, world } = createTileWorld();
	const system = new SelectSystem();
	world.hoveredTiles.add(first);
	system.select(world, TEST_MAP, TEST_TILE_DEFINITIONS, first, 1, 5);
	world.hoveredTiles.clear();
	assert.deepEqual([...world.selectedTiles], [first]);
	system.select(world, TEST_MAP, TEST_TILE_DEFINITIONS, second, 1, 5);
	assert.deepEqual([...world.selectedTiles], [second]);
});

test("blocked multi-layer cells have no Hover click-through to their ground Tile", () => {
	const world = new World();
	let ground: number | undefined;
	for (const layer of [0, 1]) {
		const entity = world.createEntity();
		if (layer === 0) ground = entity;
		world.tiles.set(entity, { textureId: layer === 0 ? 1 : 101 });
		world.gridPositions.set(entity, { column: 4, row: 4 });
		world.renderables.set(entity, { layer, order: 0 });
	}
	assert.equal(new HoverSystem().update(world, TEST_MAP, TEST_TILE_DEFINITIONS, { x: 0, y: 0, zoom: 1 }, 100, 100, { canvasX: 50, canvasY: 130, inside: true }), undefined);
	assert.equal(world.hoveredTiles.size, 0);
	assert.equal(new SelectSystem().select(world, TEST_MAP, TEST_TILE_DEFINITIONS, ground, 1, 5), undefined);
	assert.equal(world.selectedTiles.size, 0);
});

test("WalkHintSystem waits 2s, excludes the current cell, and resets during movement", () => {
	const world = new World();
	for (let column = 0; column <= 5; column += 1) {
		const tile = world.createEntity();
		world.tiles.set(tile, { textureId: 1 });
		world.gridPositions.set(tile, { column, row: 0 });
		world.renderables.set(tile, { layer: 0, order: 0 });
	}
	const player = world.createEntity();
	world.gridPositions.set(player, { column: 0, row: 0 });
	world.localPlayers.add(player);
	const system = new WalkHintSystem(TEST_MAP, TEST_TILE_DEFINITIONS, 5);
	system.update(world, player, 0);
	system.update(world, player, 1_999);
	assert.equal(world.hintedTiles.size, 0);
	system.update(world, player, 2_560);
	assert.equal(world.hintedTiles.size, 5);
	world.movingPlayers.add(player);
	system.update(world, player, 2_001);
	assert.equal(world.hintedTiles.size, 0);
});
