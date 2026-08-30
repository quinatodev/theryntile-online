import assert from "node:assert/strict";
import test from "node:test";

import { addTileEntities, executeGameFrame } from "./Game.js";
import { World } from "../ecs/World.js";

test("fatal frame failure performs cleanup, reports once, and prevents continuation", () => {
	const failure = new Error("frame failed");
	let cleanups = 0;
	const reported: unknown[] = [];
	const completed = executeGameFrame(() => { throw failure; }, () => { cleanups += 1; }, (error) => reported.push(error));
	assert.equal(completed, false);
	assert.equal(cleanups, 1);
	assert.deepEqual(reported, [failure]);
});

test("successful frame continues without cleanup or fatal notification", () => {
	let ran = 0;
	let cleanups = 0;
	let reports = 0;
	const completed = executeGameFrame(() => { ran += 1; }, () => { cleanups += 1; }, () => { reports += 1; });
	assert.equal(completed, true);
	assert.equal(ran, 1);
	assert.equal(cleanups, 0);
	assert.equal(reports, 0);
});

test("Game creates all 130 Tile Entities exclusively from a serialized runtime payload", () => {
	const map = {
		0: Array.from({ length: 11 }, () => Array<number>(11).fill(1)),
		1: Array.from({ length: 11 }, (_, row) => Array.from(
			{ length: 11 }, (_, column) => row >= 4 && row <= 6 && column >= 4 && column <= 6 ? 101 : 0,
		)),
	};
	const world = new World();
	addTileEntities(world, {
		map, mapId: "lobby", movement: { maxSteps: 5 }, tileDefinitions: { 1: true, 101: false },
		zoom: { max: 3, min: 1 }, zoomPreference: 1,
	});
	assert.equal(world.tiles.size, 130);
	assert.equal([...world.tiles.values()].filter(({ textureId }) => textureId === 1).length, 121);
	assert.equal([...world.tiles.values()].filter(({ textureId }) => textureId === 101).length, 9);
});
