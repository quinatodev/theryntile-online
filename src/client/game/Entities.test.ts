import assert from "node:assert/strict";
import test from "node:test";

import { World } from "../ecs/World.js";
import { PLAYER_LAYER, PLAYER_ORDER, getRenderableRenderOrder } from "../ecs/systems/RenderSystem.js";
import { createCreatureEntity, createPlayerEntity, createPortalEntity, createTileEntity } from "./Entities.js";

test("Portal and Stag factories preserve physical frame geometry independently from frame count", () => {
	const world = new World();
	const portal = createPortalEntity(world, { id: "private-test", row: 2, column: 3 });
	const stag = createCreatureEntity(world, { id: "stag:1", species: "stag", row: 4, column: 5 });
	assert.deepEqual(world.portals.get(portal), { id: "private-test", frameWidth: 32, frameHeight: 32, frameCount: 6 });
	assert.deepEqual(world.sprites.get(stag), { feetOffsetY: 16, frameHeight: 48, frameWidth: 32, offsetX: 0, offsetY: 0 });
	assert.deepEqual(world.animations.get(stag), { direction: "left_down", frame: 0, frameCounts: { idle: 24, walk: 11 }, state: "idle" });
});

test("createPlayerEntity installs independent complete Local and remote Player Components", () => {
	const world = new World();
	const local = createPlayerEntity(world, { id: 10, name: "Local", row: 1, column: 2 }, true);
	const remoteA = createPlayerEntity(world, { id: 20, name: "Remote A", row: 3, column: 4 }, false);
	const remoteB = createPlayerEntity(world, { id: 30, name: "Remote B", row: 5, column: 6 }, false);
	assert.equal(new Set([local, remoteA, remoteB]).size, 3);
	assert.deepEqual(world.gridPositions.get(local), { row: 1, column: 2 });
	assert.deepEqual(world.visualPositions.get(local), { x: 16, y: 24 });
	assert.deepEqual(world.players.get(local), { id: 10, name: "Local" });
	assert.deepEqual(world.animations.get(local), { direction: "left_down", frame: 0, state: "idle" });
	assert.deepEqual(world.sprites.get(local), {
		feetOffsetY: 16, frameHeight: 48, frameWidth: 32, offsetX: 0, offsetY: 0,
	});
	assert.deepEqual(world.renderables.get(local), { layer: PLAYER_LAYER, order: PLAYER_ORDER });
	assert.equal(world.localPlayers.has(local), true);
	assert.equal(world.localPlayers.has(remoteA), false);
	assert.equal(world.localPlayers.has(remoteB), false);
	assert.deepEqual(world.players.get(remoteA), { id: 20, name: "Remote A" });
	assert.deepEqual(world.players.get(remoteB), { id: 30, name: "Remote B" });
	const renderable = world.renderables.get(local);
	const grid = world.gridPositions.get(local);
	assert.ok(renderable && grid);
	assert.deepEqual(getRenderableRenderOrder(grid, renderable, 10), {
		column: 2, depth: 3, layer: PLAYER_LAYER, order: PLAYER_ORDER, row: 1, tieBreaker: 10,
	});
});

test("createTileEntity installs grid, texture, and layer render configuration per Entity", () => {
	const world = new World();
	const ground = createTileEntity(world, 2, 3, 0, 1);
	const upper = createTileEntity(world, 2, 3, 1, 101);
	assert.notEqual(ground, upper);
	assert.deepEqual(world.gridPositions.get(ground), { row: 2, column: 3 });
	assert.deepEqual(world.tiles.get(ground), { textureId: 1 });
	assert.deepEqual(world.renderables.get(ground), { layer: 0, order: 0 });
	assert.deepEqual(world.tiles.get(upper), { textureId: 101 });
	assert.deepEqual(world.renderables.get(upper), { layer: 1, order: 0 });
});

test("createTileEntity preserves a sparse runtime texture ID without normalization", () => {
	const world = new World();
	const entity = createTileEntity(world, 4, 12, 1, 502);
	assert.deepEqual(world.tiles.get(entity), { textureId: 502 });
});
