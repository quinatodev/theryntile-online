import assert from "node:assert/strict";
import test from "node:test";

import { AnimationSystem } from "./systems/AnimationSystem.js";
import { CameraSystem } from "./systems/CameraSystem.js";
import { MovementSystem } from "./systems/MovementSystem.js";
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
		fromColumn: 0, fromRow: 0, progress: 0, startX: 0, startY: 0,
		targetColumn: 1, targetRow: 0, targetX: 16, targetY: 8,
	});
	new MovementSystem().update(world, 500);
	assert.equal(world.movements.get(entity)?.progress, 0);
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
