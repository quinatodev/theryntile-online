import assert from "node:assert/strict";
import test from "node:test";

import { HoverSystem } from "./HoverSystem.js";
import { getNextRequestedStep, getOrthogonalSteps } from "./MovementSystem.js";
import { SelectSystem } from "./SelectSystem.js";
import { World } from "../World.js";

const createTileWorld = () => {
	const world = new World();
	const first = world.createEntity();
	const second = world.createEntity();
	world.tiles.set(first, { textureId: 1 });
	world.gridPositions.set(first, { column: 0, row: 0 });
	world.tiles.set(second, { textureId: 1 });
	world.gridPositions.set(second, { column: 1, row: 0 });

	return { first, second, world };
};

test("HoverSystem resolves one Tile with Camera/zoom and clears hover outside", () => {
	const { first, second, world } = createTileWorld();
	const system = new HoverSystem();
	const camera = { x: 0, y: 0, zoom: 2 };
	assert.equal(system.update(world, camera, 100, 100, { canvasX: 50, canvasY: 82, inside: true }), first);
	assert.deepEqual([...world.hoveredTiles], [first]);
	assert.equal(system.update(world, camera, 100, 100, { canvasX: 82, canvasY: 98, inside: true }), second);
	assert.deepEqual([...world.hoveredTiles], [second]);
	assert.equal(system.update(world, camera, 100, 100, { canvasX: 0, canvasY: 0, inside: false }), undefined);
	assert.equal(world.hoveredTiles.size, 0);
});

test("a Player on a Tile does not prevent HoverSystem from resolving that Tile", () => {
	const { first, world } = createTileWorld();
	const player = world.createEntity();
	world.players.set(player, { id: 1, name: "Hana" });
	world.gridPositions.set(player, { column: 0, row: 0 });
	assert.equal(new HoverSystem().update(world, { x: 0, y: 0, zoom: 1 }, 100, 100, { canvasX: 50, canvasY: 66, inside: true }), first);
});

test("HoverSystem does not capture the area 8px above the visual ground", () => {
	const { world } = createTileWorld();
	const hovered = new HoverSystem().update(
		world,
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
	system.select(world, first);
	world.hoveredTiles.clear();
	assert.deepEqual([...world.selectedTiles], [first]);
	system.select(world, second);
	assert.deepEqual([...world.selectedTiles], [second]);
});

test("orthogonal paths are deterministic and every step is adjacent", () => {
	assert.deepEqual(getOrthogonalSteps({ column: 0, row: 0 }, { column: 3, row: 0 }), [
		{ column: 1, row: 0 }, { column: 2, row: 0 }, { column: 3, row: 0 },
	]);
	assert.deepEqual(getOrthogonalSteps({ column: 0, row: 0 }, { column: 2, row: 2 }), [
		{ column: 0, row: 1 }, { column: 0, row: 2 }, { column: 1, row: 2 }, { column: 2, row: 2 },
	]);
	for (const [index, step] of getOrthogonalSteps({ column: 0, row: 0 }, { column: 2, row: 2 }).entries()) {
		const previous = index === 0 ? { column: 0, row: 0 } : getOrthogonalSteps({ column: 0, row: 0 }, { column: 2, row: 2 })[index - 1];
		assert.equal(Math.abs(step.row - previous.row) + Math.abs(step.column - previous.column), 1);
	}
});

test("the next MOVE waits for authority and interpolation while a new target can replace the future route", () => {
	const current = { column: 0, row: 0 };
	const target = { awaitingStep: false, column: 0, row: 3 };
	assert.deepEqual(getNextRequestedStep(current, target, false), { column: 0, row: 1 });
	target.awaitingStep = true;
	assert.equal(getNextRequestedStep(current, target, false), undefined);
	target.column = 3;
	target.row = 0;
	assert.equal(getNextRequestedStep(current, target, true), undefined);
	target.awaitingStep = false;
	assert.deepEqual(getNextRequestedStep({ column: 0, row: 1 }, target, false), { column: 0, row: 0 });
});
