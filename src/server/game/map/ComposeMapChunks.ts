import { type MapDefinition } from "../Map.js";
import { isTileWalkable } from "../TileRegistry.js";

export const CHUNK_SIZE = 20;

export type MapChunk = Readonly<Record<number, readonly (readonly number[])[]>>;
export type MapChunkGrid = readonly (readonly (MapChunk | null)[])[];

/**
 * Lang: pt-BR
 * Compõe chunks fixos 20×20 em um único mapa multilayer; posições nulas e layers ausentes preservam espaço com zeros.
 *
 * Lang: en-US
 * Composes fixed 20×20 chunks into one multilayer map; null positions and missing layers preserve space with zeroes.
 */
export function composeMapChunks(grid: MapChunkGrid): MapDefinition {
	if (!Array.isArray(grid) || grid.length === 0) throw new Error("Chunk grid must contain rows.");
	const chunkColumns = grid[0]?.length ?? 0;
	if (chunkColumns === 0) throw new Error("Chunk grid rows must contain columns.");
	if (grid.some((row) => !Array.isArray(row) || row.length !== chunkColumns)) {
		throw new Error("Every chunk grid row must have the same column count.");
	}

	const layers = new Set<number>();
	for (const row of grid) {
		for (const chunk of row) {
			if (chunk === null) continue;
			if (typeof chunk !== "object" || Array.isArray(chunk)) throw new Error("Every non-null chunk must be a multilayer object.");
			const layerKeys = Object.keys(chunk);
			if (layerKeys.length === 0) throw new Error("Every non-null chunk must contain at least one layer.");
			for (const layerKey of layerKeys) {
				if (!/^(0|[1-9]\d*)$/.test(layerKey)) throw new Error("Chunk layer IDs must be non-negative integers.");
				const layer = Number(layerKey);
				if (!Number.isSafeInteger(layer)) throw new Error("Chunk layer IDs must be safe integers.");
				const matrix = chunk[layer];
				if (!Array.isArray(matrix) || matrix.length !== CHUNK_SIZE) throw new Error(`Chunk layer ${layer} must contain exactly ${CHUNK_SIZE} rows.`);
				for (const matrixRow of matrix) {
					if (!Array.isArray(matrixRow) || matrixRow.length !== CHUNK_SIZE) throw new Error(`Every chunk row must contain exactly ${CHUNK_SIZE} columns.`);
					for (const tileId of matrixRow) {
						if (!Number.isSafeInteger(tileId) || tileId < 0) throw new Error("Every Tile ID must be a non-negative safe integer.");
						if (tileId !== 0) isTileWalkable(tileId);
					}
				}
				layers.add(layer);
			}
		}
	}
	if (layers.size === 0) throw new Error("Chunk grid must contain at least one non-null chunk.");

	const result: Record<number, number[][]> = {};
	for (const layer of [...layers].sort((a, b) => a - b)) {
		result[layer] = grid.flatMap((chunkRow) => Array.from({ length: CHUNK_SIZE }, (_, localRow) =>
			chunkRow.flatMap((chunk: MapChunk | null) => chunk?.[layer]?.[localRow] ?? Array<number>(CHUNK_SIZE).fill(0)),
		));
	}

	return result;
}
