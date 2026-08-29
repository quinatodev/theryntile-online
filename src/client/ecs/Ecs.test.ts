import assert from "node:assert/strict";
import test from "node:test";

import { AnimationSystem } from "./systems/AnimationSystem.js";
import { CameraSystem } from "./systems/CameraSystem.js";
import { enqueueMovementStep, MovementSystem } from "./systems/MovementSystem.js";
import { getMovementSortingGrid } from "./systems/RenderSystem.js";
import { World } from "./World.js";

test("World creates unique Entity IDs and removes every associated Component", () => {
	const world = new World();
	const first = world.createEntity();
	const second = world.createEntity();
	assert.notEqual(first, second);

	world.gridPositions.set(first, { column: 2, row: 1 });
	world.players.set(first, { id: 10, name: "Hana" });
	world.localPlayers.add(first);
	world.removeEntity(first);

	assert.equal(world.entities.has(first), false);
	assert.equal(world.gridPositions.has(first), false);
	assert.equal(world.players.has(first), false);
	assert.equal(world.localPlayers.has(first), false);
});

test("MovementSystem interpolates for 500 ms then returns to idle without changing direction", () => {
	const world = new World();
	const entity = world.createEntity();
	world.visualPositions.set(entity, { x: 0, y: 0 });
	world.animations.set(entity, { direction: "right_down", frame: 0, state: "walk" });
	world.movements.set(entity, {
		finalStep: true,
		fromColumn: 0, fromRow: 0, progress: 0, startX: 0, startY: 0,
		targetColumn: 1, targetRow: 0, targetX: 16, targetY: 8,
	});
	const system = new MovementSystem();
	system.update(world, 100);
	system.update(world, 350);
	assert.deepEqual(world.visualPositions.get(entity), { x: 8, y: 4 });
	assert.equal(world.movements.get(entity)?.progress, 0.5);

	system.update(world, 600);
	assert.deepEqual(world.visualPositions.get(entity), { x: 16, y: 8 });
	assert.equal(world.movements.has(entity), false);
	assert.deepEqual(world.animations.get(entity), { direction: "right_down", frame: 0, startedAt: 600, state: "idle" });
});

test("MovementSystem ignores Entities without the Components it requires", () => {
	const world = new World();
	const entity = world.createEntity();
	world.movements.set(entity, {
		finalStep: true,
		fromColumn: 0, fromRow: 0, progress: 0, startX: 0, startY: 0,
		targetColumn: 1, targetRow: 0, targetX: 16, targetY: 8,
	});
	new MovementSystem().update(world, 500);
	assert.equal(world.movements.get(entity)?.progress, 0);
});

test("MovementSystem keeps Walk and route lock between authoritative steps", () => {
	const world = new World();
	const entity = world.createEntity();
	world.visualPositions.set(entity, { x: 0, y: 0 });
	world.animations.set(entity, { direction: "right_down", frame: 0, state: "walk" });
	world.movingPlayers.add(entity);
	world.movements.set(entity, {
		finalStep: false, fromColumn: 0, fromRow: 0, progress: 0, startX: 0, startY: 0,
		targetColumn: 1, targetRow: 0, targetX: 16, targetY: 8,
	});
	const system = new MovementSystem();
	system.update(world, 0);
	system.update(world, 500);
	assert.equal(world.animations.get(entity)?.state, "walk");
	assert.equal(world.movingPlayers.has(entity), true);
	assert.equal(world.movements.has(entity), false);
});

const createMovingPlayer = (world: World, local = false) => {
	const entity = world.createEntity();
	world.gridPositions.set(entity, { column: 0, row: 0 });
	world.visualPositions.set(entity, { x: 0, y: 0 });
	world.animations.set(entity, { direction: "left_down", frame: 0, state: "idle" });
	world.players.set(entity, { id: entity, name: local ? "Local" : "Remote" });
	if (local) world.localPlayers.add(entity);

	return entity;
};

test("a step received at 90% is queued without replacing the active interpolation", () => {
	const world = new World();
	const entity = createMovingPlayer(world, true);
	const system = new MovementSystem();
	enqueueMovementStep(world, entity, { fromColumn: 0, fromRow: 0, column: 1, row: 0, finalStep: false });
	system.update(world, 0);
	system.update(world, 450);
	const active = world.movements.get(entity);
	assert.equal(active?.progress, 0.9);
	assert.deepEqual(world.visualPositions.get(entity), { x: 14.4, y: 7.2 });
	enqueueMovementStep(world, entity, { fromColumn: 1, fromRow: 0, column: 1, row: 1, finalStep: true });
	assert.equal(world.movements.get(entity), active);
	assert.equal(world.movementQueues.get(entity)?.length, 1);
	system.update(world, 500);
	assert.deepEqual(world.visualPositions.get(entity), { x: 16, y: 8 });
	assert.deepEqual(world.gridPositions.get(entity), { column: 1, row: 1 });
	assert.deepEqual(getMovementSortingGrid(world.gridPositions.get(entity)!, world.movements.get(entity)), { column: 1, row: 0 });
	assert.equal(world.animations.get(entity)?.direction, "left_down");
	system.update(world, 500);
	system.update(world, 1_000);
	assert.deepEqual(world.visualPositions.get(entity), { x: 0, y: 16 });
	assert.equal(world.movements.has(entity), false);
	assert.equal(world.movingPlayers.has(entity), false);
	assert.equal(world.animations.get(entity)?.state, "idle");
});

test("rapid Loading-style replay preserves and completes three authoritative steps in order", () => {
	const world = new World();
	const entity = createMovingPlayer(world);
	const system = new MovementSystem();
	enqueueMovementStep(world, entity, { fromColumn: 0, fromRow: 0, column: 1, row: 0, finalStep: false });
	enqueueMovementStep(world, entity, { fromColumn: 1, fromRow: 0, column: 2, row: 0, finalStep: false });
	enqueueMovementStep(world, entity, { fromColumn: 2, fromRow: 0, column: 2, row: 1, finalStep: true });
	assert.deepEqual(world.gridPositions.get(entity), { column: 1, row: 0 });
	assert.equal(world.movementQueues.get(entity)?.length, 2);
	system.update(world, 0);
	system.update(world, 500);
	assert.deepEqual(world.visualPositions.get(entity), { x: 16, y: 8 });
	assert.deepEqual(world.gridPositions.get(entity), { column: 2, row: 0 });
	assert.equal(world.animations.get(entity)?.direction, "right_down");
	system.update(world, 500);
	system.update(world, 1_000);
	assert.deepEqual(world.visualPositions.get(entity), { x: 32, y: 16 });
	assert.deepEqual(world.gridPositions.get(entity), { column: 2, row: 1 });
	assert.equal(world.animations.get(entity)?.direction, "left_down");
	system.update(world, 1_000);
	system.update(world, 1_500);
	assert.deepEqual(world.visualPositions.get(entity), { x: 16, y: 24 });
	assert.equal(world.movementQueues.has(entity), false);
	assert.equal(world.movements.has(entity), false);
	assert.equal(world.movingPlayers.has(entity), false);
});

test("finalStep false keeps lock and Walk while the authoritative queue is temporarily empty", () => {
	const world = new World();
	const entity = createMovingPlayer(world, true);
	const system = new MovementSystem();
	enqueueMovementStep(world, entity, { fromColumn: 0, fromRow: 0, column: 1, row: 0, finalStep: false });
	system.update(world, 0);
	system.update(world, 500);
	assert.equal(world.movements.has(entity), false);
	assert.equal(world.movementQueues.has(entity), false);
	assert.equal(world.movingPlayers.has(entity), true);
	assert.equal(world.animations.get(entity)?.state, "walk");
	enqueueMovementStep(world, entity, { fromColumn: 1, fromRow: 0, column: 2, row: 0, finalStep: true });
	assert.equal(world.movements.has(entity), true);
});

test("local and remote Players own independent queues and Entity cleanup removes them", () => {
	const world = new World();
	const local = createMovingPlayer(world, true);
	const remote = createMovingPlayer(world);
	enqueueMovementStep(world, local, { fromColumn: 0, fromRow: 0, column: 1, row: 0, finalStep: true });
	enqueueMovementStep(world, local, { fromColumn: 1, fromRow: 0, column: 2, row: 0, finalStep: true });
	enqueueMovementStep(world, remote, { fromColumn: 0, fromRow: 0, column: 0, row: 1, finalStep: true });
	assert.equal(world.movementQueues.get(local)?.length, 1);
	assert.equal(world.movements.has(remote), true);
	world.removeEntity(remote);
	assert.equal(world.movementQueues.has(remote), false);
	assert.equal(world.movements.has(remote), false);
	world.clear();
	assert.equal(world.movementQueues.size, 0);
	assert.equal(world.movements.size, 0);
});

test("only a completed local final step clears destination selection", () => {
	const world = new World();
	const local = createMovingPlayer(world, true);
	const remote = createMovingPlayer(world);
	const selected = world.createEntity();
	world.selectedTiles.add(selected);
	const system = new MovementSystem();
	enqueueMovementStep(world, remote, { fromColumn: 0, fromRow: 0, column: 1, row: 0, finalStep: true });
	system.update(world, 0);
	system.update(world, 500);
	assert.equal(world.selectedTiles.has(selected), true);
	enqueueMovementStep(world, local, { fromColumn: 0, fromRow: 0, column: 1, row: 0, finalStep: true });
	system.update(world, 500);
	assert.equal(world.selectedTiles.has(selected), true);
	system.update(world, 1_000);
	assert.equal(world.selectedTiles.size, 0);
});

test("AnimationSystem derives looping idle and walk frames from timestamps", () => {
	const world = new World();
	const idle = world.createEntity();
	const walk = world.createEntity();
	world.animations.set(idle, { direction: "left_down", frame: 0, startedAt: 0, state: "idle" });
	world.animations.set(walk, { direction: "left_top", frame: 0, startedAt: 0, state: "walk" });
	const system = new AnimationSystem();
	system.update(world, 125);
	assert.equal(world.animations.get(idle)?.frame, 1);
	assert.equal(world.animations.get(walk)?.frame, 2);
	system.update(world, 1_000);
	assert.equal(world.animations.get(idle)?.frame, 0);
	assert.equal(world.animations.get(walk)?.frame, 0);
});

test("CameraSystem follows the Local Player VisualPosition feet", () => {
	const world = new World();
	const remote = world.createEntity();
	const local = world.createEntity();
	world.visualPositions.set(remote, { x: 100, y: 100 });
	world.visualPositions.set(local, { x: 12, y: 20 });
	world.sprites.set(local, { feetOffsetY: 16, frameHeight: 48, frameWidth: 32, offsetX: 30, offsetY: -20 });
	world.localPlayers.add(local);
	const camera = { x: 0, y: 0, zoom: 1 };
	new CameraSystem().update(world, camera);
	assert.deepEqual(camera, { x: 12, y: 36, zoom: 1 });
});
