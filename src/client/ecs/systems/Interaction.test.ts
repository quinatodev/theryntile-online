import assert from "node:assert/strict";
import test from "node:test";

import { HoverSystem } from "./HoverSystem.js";
import { canSelectTile, SelectSystem } from "./SelectSystem.js";
import { WalkHintSystem } from "./WalkHintSystem.js";
import { World } from "../World.js";
import { CLIENT_CONFIG } from "../../game/ClientConfig.js";

const TEST_MAP = {
	0: Array.from({ length: 11 }, () => Array<number>(11).fill(1)),
	1: Array.from({ length: 11 }, (_, row) => Array.from(
		{ length: 11 }, (_, column) => row === 4 && column === 4 ? 101 : 0,
	)),
};
const TEST_TILE_DEFINITIONS = { 1: true, 101: false };

/** Lang: pt-BR - Constrói World mínimo com Tiles para interação. Lang: en-US - Builds a minimal Tile World for interaction. */
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

test("SelectSystem preserves the current destination while route, path, or runtime limit rejects a new one", () => {
	const { first, second, world } = createTileWorld();
	const system = new SelectSystem();
	const maxSteps = 5;
	assert.equal(system.select(world, TEST_MAP, TEST_TILE_DEFINITIONS, first, 1, maxSteps), first);
	assert.equal(system.select(world, TEST_MAP, TEST_TILE_DEFINITIONS, second, undefined, maxSteps), undefined);
	assert.equal(system.select(world, TEST_MAP, TEST_TILE_DEFINITIONS, second, maxSteps + 1, maxSteps), undefined);
	assert.equal(system.select(world, TEST_MAP, TEST_TILE_DEFINITIONS, second, 1, maxSteps, true), undefined);
	assert.deepEqual([...world.selectedTiles], [first]);

	const player = world.createEntity();
	world.players.set(player, { id: 1, name: "Occupant" });
	world.gridPositions.set(player, { column: 1, row: 0 });
	assert.equal(system.select(world, TEST_MAP, TEST_TILE_DEFINITIONS, second, 1, maxSteps), second);
	assert.deepEqual([...world.selectedTiles], [second]);
});

test("clickability matches selection for valid, selected, out-of-range, blocked, and route-locked Tiles", () => {
	const { first, second, world } = createTileWorld();
	assert.equal(canSelectTile(world, TEST_MAP, TEST_TILE_DEFINITIONS, first, 1, 5), true);
	assert.equal(canSelectTile(world, TEST_MAP, TEST_TILE_DEFINITIONS, first, undefined, 5), false);
	assert.equal(canSelectTile(world, TEST_MAP, TEST_TILE_DEFINITIONS, first, 6, 5), false);
	assert.equal(canSelectTile(world, TEST_MAP, TEST_TILE_DEFINITIONS, first, 1, 5, true), false);
	world.selectedTiles.add(first);
	assert.equal(canSelectTile(world, TEST_MAP, TEST_TILE_DEFINITIONS, first, 1, 5), false);
	world.gridPositions.set(second, { row: 4, column: 4 });
	assert.equal(canSelectTile(world, TEST_MAP, TEST_TILE_DEFINITIONS, second, 1, 5), false);
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

test("WalkHintSystem uses configured timing, opacity, and resets during movement", () => {
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
	assert.equal(world.walkHintAlpha, CLIENT_CONFIG.hints.maxAlpha);
	system.update(world, player, 0);
	system.update(world, player, CLIENT_CONFIG.hints.delayMs - 1);
	assert.equal(world.hintedTiles.size, 0);
	system.update(world, player, CLIENT_CONFIG.hints.delayMs);
	assert.equal(world.hintedTiles.size, 1);
	const firstHint = [...world.hintedTiles][0] as number;
	assert.equal(world.hintedTileAlphas.get(firstHint), 0);
	system.update(world, player, CLIENT_CONFIG.hints.delayMs + CLIENT_CONFIG.hints.fadeInDurationMs / 2);
	assert.equal(world.hintedTileAlphas.get(firstHint), CLIENT_CONFIG.hints.maxAlpha / 2);
	system.update(world, player, CLIENT_CONFIG.hints.delayMs + CLIENT_CONFIG.hints.fadeInDurationMs);
	assert.equal(world.hintedTileAlphas.get(firstHint), CLIENT_CONFIG.hints.maxAlpha);
	system.update(world, player, CLIENT_CONFIG.hints.delayMs + CLIENT_CONFIG.hints.ringIntervalMs);
	assert.equal(world.hintedTiles.size, 2);
	const secondHint = [...world.hintedTiles].find((entity) => entity !== firstHint) as number;
	assert.equal(world.hintedTileAlphas.get(secondHint), 0);
	const allRingsRevealedAt = CLIENT_CONFIG.hints.delayMs + 4 * CLIENT_CONFIG.hints.ringIntervalMs;
	system.update(world, player, allRingsRevealedAt);
	assert.equal(world.hintedTiles.size, 5);
	const fadeStartedAt = CLIENT_CONFIG.hints.delayMs + 5 * CLIENT_CONFIG.hints.ringIntervalMs;
	system.update(world, player, fadeStartedAt + CLIENT_CONFIG.hints.fadeDurationMs / 2);
	assert.equal(world.walkHintAlpha, CLIENT_CONFIG.hints.maxAlpha / 2);
	world.movingPlayers.add(player);
	system.update(world, player, fadeStartedAt + CLIENT_CONFIG.hints.fadeDurationMs);
	assert.equal(world.hintedTiles.size, 0);
	assert.equal(world.hintedTileAlphas.size, 0);
	assert.equal(world.walkHintAlpha, CLIENT_CONFIG.hints.maxAlpha);
});

test("WalkHintSystem respects obstacles and Players, then restarts only after a complete configured cycle", () => {
	const map = {
		0: Array.from({ length: 3 }, () => Array<number>(3).fill(1)),
		1: Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) => row === 1 && column === 1 ? 101 : 0)),
	};
	const world = new World();
	const groundByGrid = new Map<string, number>();
	for (let row = 0; row < 3; row += 1) {
		for (let column = 0; column < 3; column += 1) {
			const tile = world.createEntity();
			groundByGrid.set(`${row}:${column}`, tile);
			world.tiles.set(tile, { textureId: 1 });
			world.gridPositions.set(tile, { column, row });
			world.renderables.set(tile, { layer: 0, order: 0 });
		}
	}
	const localPlayer = world.createEntity();
	world.gridPositions.set(localPlayer, { column: 0, row: 1 });
	const occupant = world.createEntity();
	world.players.set(occupant, { id: 2, name: "Occupant" });
	world.gridPositions.set(occupant, { column: 1, row: 0 });
	const maxSteps = 3;
	const system = new WalkHintSystem(map, TEST_TILE_DEFINITIONS, maxSteps);
	system.update(world, localPlayer, 0);
	const allRingsAt = CLIENT_CONFIG.hints.delayMs + (maxSteps - 1) * CLIENT_CONFIG.hints.ringIntervalMs;
	system.update(world, localPlayer, allRingsAt);
	assert.equal(world.hintedTiles.has(groundByGrid.get("1:1") as number), false);
	assert.equal(world.hintedTiles.has(groundByGrid.get("0:1") as number), true);

	const cycleEndsAt = CLIENT_CONFIG.hints.delayMs
		+ maxSteps * CLIENT_CONFIG.hints.ringIntervalMs
		+ CLIENT_CONFIG.hints.fadeDurationMs;
	system.update(world, localPlayer, cycleEndsAt);
	assert.equal(world.hintedTiles.size, 0);
	system.update(world, localPlayer, cycleEndsAt + CLIENT_CONFIG.hints.delayMs - 1);
	assert.equal(world.hintedTiles.size, 0);
	system.update(world, localPlayer, cycleEndsAt + CLIENT_CONFIG.hints.delayMs);
	assert.ok(world.hintedTiles.size > 0);
});
