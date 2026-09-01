import assert from "node:assert/strict";
import test from "node:test";

import { getMapBounds, getMapLayers } from "../Map.js";
import { CHUNK_SIZE, composeMapChunks, type MapChunk } from "./ComposeMapChunks.js";
import { Newbie } from "./Newbie.js";

/** Lang: pt-BR - Produz uma layer homogênea de fixture. Lang: en-US - Produces a homogeneous fixture layer. */
const matrix = (tileId: number): number[][] => Array.from({ length: CHUNK_SIZE }, () => Array<number>(CHUNK_SIZE).fill(tileId));
/** Lang: pt-BR - Adapta layers para a forma de MapChunk. Lang: en-US - Adapts layers to the MapChunk shape. */
const chunk = (layers: Record<number, number[][]>): MapChunk => layers;

test("one 20x20 chunk composes one 20x20 map and preserves Tile IDs", () => {
	const map = composeMapChunks([[chunk({ 0: matrix(201) })]]);
	assert.deepEqual(getMapBounds(map), { columns: 20, rows: 20 });
	assert.equal(map[0]?.[0]?.[0], 201);
	assert.equal(map[0]?.[19]?.[19], 201);
});

test("a 3x3 grid composes 60x60 and null positions remain zero-filled space", () => {
	const center = chunk({ 0: matrix(1) });
	const map = composeMapChunks([[null, null, null], [null, center, null], [null, null, null]]);
	assert.deepEqual(getMapBounds(map), { columns: 60, rows: 60 });
	assert.equal(map[0]?.[0]?.[0], 0);
	assert.equal(map[0]?.[20]?.[20], 1);
	assert.equal(map[0]?.[39]?.[39], 1);
	assert.equal(map[0]?.[40]?.[40], 0);
});

test("chunk positions and exact boundaries do not shift by one cell", () => {
	const map = composeMapChunks([[chunk({ 0: matrix(1) }), chunk({ 0: matrix(201) })]]);
	assert.equal(map[0]?.[0]?.[19], 1);
	assert.equal(map[0]?.[0]?.[20], 201);
	assert.equal(map[0]?.[19]?.[39], 201);
});

test("layers are unioned and a missing chunk layer becomes zeroes", () => {
	const map = composeMapChunks([[chunk({ 0: matrix(1), 2: matrix(201) }), chunk({ 0: matrix(301) })]]);
	assert.deepEqual(getMapLayers(map), [0, 2]);
	assert.equal(map[0]?.[0]?.[20], 301);
	assert.equal(map[2]?.[0]?.[19], 201);
	assert.equal(map[2]?.[0]?.[20], 0);
});

test("composition rejects invalid grid and chunk dimensions", () => {
	const rows19 = chunk({ 0: matrix(1).slice(0, 19) });
	const rows21 = chunk({ 0: [...matrix(1), Array<number>(20).fill(1)] });
	const columns19 = chunk({ 0: matrix(1).map((row) => row.slice(0, 19)) });
	const columns21 = chunk({ 0: matrix(1).map((row) => [...row, 1]) });
	assert.throws(() => composeMapChunks([]), /contain rows/);
	assert.throws(() => composeMapChunks([[chunk({ 0: matrix(1) })], [chunk({ 0: matrix(1) }), null]]), /same column count/);
	assert.throws(() => composeMapChunks([[rows19]]), /exactly 20 rows/);
	assert.throws(() => composeMapChunks([[rows21]]), /exactly 20 rows/);
	assert.throws(() => composeMapChunks([[columns19]]), /exactly 20 columns/);
	assert.throws(() => composeMapChunks([[columns21]]), /exactly 20 columns/);
});

test("composition rejects invalid objects, layers, Tile values, and unregistered Tiles", () => {
	assert.throws(() => composeMapChunks([[{}]]), /at least one layer/);
	assert.throws(() => composeMapChunks([[{ bad: matrix(1) } as never]]), /layer IDs/);
	assert.throws(() => composeMapChunks([[chunk({ 0: matrix(-1) })]]), /Tile ID/);
	assert.throws(() => composeMapChunks([[chunk({ 0: matrix(999_999) })]]), /not registered/);
});

test("the current Newbie composition is a 60x60 multilayer map", () => {
	assert.deepEqual(getMapBounds(Newbie), { columns: 60, rows: 60 });
	assert.deepEqual(getMapLayers(Newbie), [0, 1, 2]);
});
