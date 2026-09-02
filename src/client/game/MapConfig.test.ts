import assert from "node:assert/strict";
import test from "node:test";

import { changeCameraZoom } from "../engine/Camera.js";
import { parseGameBootstrapConfig, parseRuntimeMap } from "./MapConfig.js";

/** Lang: pt-BR - Cria payload válido para mutações focadas. Lang: en-US - Creates a valid payload for focused mutations. */
const createSerializedNewbiePayload = () => ({
	inventoryColumns: 4,
	inventoryPosition: null,
	map: {
		0: Array.from({ length: 11 }, () => Array<number>(11).fill(1)),
		1: Array.from({ length: 11 }, (_, row) => Array.from(
			{ length: 11 }, (_, column) => row >= 4 && row <= 6 && column >= 4 && column <= 6 ? 101 : 0,
		)),
	},
	mapId: "lobby", movement: { maxSteps: 5 }, tileDefinitions: { 1: true, 101: false, 501: true },
	zoom: { max: 3, min: 1 }, zoomPreference: 2,
});

test("runtime config accepts a serialized Newbie payload and clamps persisted zoom", () => {
	const payload = createSerializedNewbiePayload();
	assert.equal(parseGameBootstrapConfig(payload).mapId, "lobby");
	assert.equal(parseGameBootstrapConfig({ ...payload, zoomPreference: 99 }).zoomPreference, 3);
	assert.equal(parseGameBootstrapConfig({ ...payload, zoomPreference: 2.25 }).zoomPreference, 2.25);
	assert.deepEqual(parseGameBootstrapConfig({ ...payload, inventoryPosition: { x: 120, y: 80 } }).inventoryPosition, { x: 120, y: 80 });
	for (const inventoryColumns of [4, 5, 6]) assert.equal(parseGameBootstrapConfig({ ...payload, inventoryColumns }).inventoryColumns, inventoryColumns);
});

test("runtime map parser rejects every malformed structural class", () => {
	for (const invalid of [
		{}, { 0: [] }, { 0: [[]] }, { 0: [[1], [1, 1]] }, { 0: [[1]], 1: [[1], [1]] },
		{ 0: [[1.5]] }, { 0: [[-1]] }, { bad: [[1]] },
	]) assert.throws(() => parseRuntimeMap(invalid));
	const payload = createSerializedNewbiePayload();
	assert.throws(() => parseGameBootstrapConfig({ ...payload, mapId: "" }));
	assert.throws(() => parseGameBootstrapConfig({ ...payload, movement: { maxSteps: 0 } }));
	assert.throws(() => parseGameBootstrapConfig({ ...payload, tileDefinitions: { 0: true } }));
	assert.throws(() => parseGameBootstrapConfig({ ...payload, tileDefinitions: { 1: true } }), /Tile 101 is not registered/);
	assert.throws(() => parseGameBootstrapConfig({ ...payload, zoom: { min: 3, max: 1 } }));
});

test("bootstrap parser reports the exact invalid field without weakening validation", () => {
	const payload = createSerializedNewbiePayload();
	assert.throws(() => parseGameBootstrapConfig({ ...payload, mapId: "" }), /mapId/);
	assert.throws(() => parseGameBootstrapConfig({ ...payload, map: undefined }), /runtime map/);
	assert.throws(() => parseGameBootstrapConfig({ ...payload, movement: undefined }), /movement/);
	assert.throws(() => parseGameBootstrapConfig({ ...payload, movement: { maxSteps: 0 } }), /maxSteps/);
	assert.throws(() => parseGameBootstrapConfig({ ...payload, tileDefinitions: undefined }), /tileDefinitions/);
	assert.throws(() => parseGameBootstrapConfig({ ...payload, zoom: undefined }), /zoom/);
	assert.throws(() => parseGameBootstrapConfig({ ...payload, zoomPreference: "1" }), /zoomPreference/);
	for (const inventoryPosition of [undefined, { x: -1, y: 0 }, { x: 1.5, y: 0 }, { x: 0, y: "1" }]) {
		assert.throws(() => parseGameBootstrapConfig({ ...payload, inventoryPosition }), /inventoryPosition/);
	}
	for (const inventoryColumns of [undefined, null, "4", 3, 4.5, 7]) {
		assert.throws(() => parseGameBootstrapConfig({ ...payload, inventoryColumns }), /inventoryColumns/);
	}
});

test("camera zoom moves in normalized quarters inside runtime limits", () => {
	const camera = { x: 0, y: 0, zoom: 2 };
	changeCameraZoom(camera, -1, 1, 3);
	assert.equal(camera.zoom, 2.25);
	changeCameraZoom(camera, -1, 1, 3);
	assert.equal(camera.zoom, 2.5);
	changeCameraZoom(camera, 1, 1, 3);
	assert.equal(camera.zoom, 2.25);
	for (let index = 0; index < 8; index += 1) changeCameraZoom(camera, -100, 1, 3);
	assert.equal(camera.zoom, 3);
	changeCameraZoom(camera, -0.01, 1, 3);
	assert.equal(camera.zoom, 3);
	for (let index = 0; index < 12; index += 1) changeCameraZoom(camera, 100, 1, 3);
	assert.equal(camera.zoom, 1);
});
