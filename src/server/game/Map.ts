import { Newbie } from "./map/Newbie.js";
import { isTileWalkable } from "./TileRegistry.js";

export type MapDefinition = Readonly<Record<number, readonly (readonly number[])[]>>;
export const INITIAL_MAP: MapDefinition = Newbie;

/** Lang: pt-BR
 * Deriva as layers numéricas ordenadas da definição, sem metadata global duplicada.
 *
 * Lang: en-US
 * Derives sorted numeric layers from the definition without duplicated global metadata.
 */
export const getMapLayers = (map: MapDefinition): number[] => Object.keys(map).map(Number).sort((a, b) => a - b);

/**
 * Lang: pt-BR
 * Valida todas as layers como matrizes retangulares, não vazias, compatíveis e com Tile IDs inteiros não negativos.
 *
 * Lang: en-US
 * Validates every layer as a non-empty, rectangular, compatible matrix of non-negative integer Tile IDs.
 */
export function validateMapDefinition(map: MapDefinition): void {
	const layers = getMapLayers(map);
	if (layers.length === 0 || layers.some((layer) => !Number.isSafeInteger(layer) || layer < 0)) throw new Error("Map must contain valid layers.");
	let rows: number | undefined;
	let columns: number | undefined;
	for (const layer of layers) {
		const matrix = map[layer];
		if (!Array.isArray(matrix) || matrix.length === 0) throw new Error("Every map layer must contain rows.");
		rows ??= matrix.length;
		if (matrix.length !== rows) throw new Error("Every map layer must have the same row count.");
		for (const row of matrix) {
			if (!Array.isArray(row) || row.length === 0) throw new Error("Every map row must contain columns.");
			columns ??= row.length;
			if (row.length !== columns) throw new Error("Every map row must have the same column count.");
			if (row.some((tileId) => !Number.isSafeInteger(tileId) || tileId < 0)) throw new Error("Every Tile ID must be a non-negative safe integer.");
			for (const tileId of row) if (tileId !== 0) isTileWalkable(tileId);
		}
	}
}

/**
 * Lang: pt-BR
 * Deriva os bounds da definição validada do mapa.
 *
 * Lang: en-US
 * Derives bounds from the validated map definition.
 */
export const getMapBounds = (map: MapDefinition): { columns: number; rows: number } => {
	validateMapDefinition(map);
	const firstLayer = map[getMapLayers(map)[0] as number] as readonly (readonly number[])[];

	return { columns: firstLayer[0]?.length ?? 0, rows: firstLayer.length };
};

/**
 * Lang: pt-BR
 * Exige ground caminhável no layer 0 e todas as layers superiores vazias.
 *
 * Lang: en-US
 * Requires walkable ground on layer 0 and every upper layer to be empty.
 */
export const isCellWalkable = (map: MapDefinition, row: number, column: number): boolean => {
	const { rows, columns } = getMapBounds(map);

	if (row < 0 || row >= rows || column < 0 || column >= columns) return false;
	const groundTileId = map[0]?.[row]?.[column] ?? 0;
	if (groundTileId === 0 || !isTileWalkable(groundTileId)) return false;

	return getMapLayers(map).every((layer) => layer === 0 || (map[layer]?.[row]?.[column] ?? 0) === 0);
};
