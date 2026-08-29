import { GAME_CONFIG, INITIAL_MAP_ID } from "./GameConfig.js";

export type MapDefinition = Readonly<Record<number, readonly (readonly number[])[]>>;
export const INITIAL_MAP: MapDefinition = GAME_CONFIG.maps[INITIAL_MAP_ID];

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
 * Centraliza a regra autoritativa mínima de terreno: ID 1 é caminhável.
 *
 * Lang: en-US
 * Centralizes the minimal authoritative terrain rule: ID 1 is walkable.
 */
export const isTileWalkable = (tileId: number): boolean => tileId === 1;

/**
 * Lang: pt-BR
 * Avalia bounds e walkability em todas as layers do mapa informado.
 *
 * Lang: en-US
 * Evaluates bounds and walkability across every layer of the supplied map.
 */
export const isCellWalkable = (map: MapDefinition, row: number, column: number): boolean => {
	const { rows, columns } = getMapBounds(map);

	return row >= 0 && row < rows && column >= 0 && column < columns
		&& getMapLayers(map).every((layer) => {
			const tileId = map[layer]?.[row]?.[column] ?? 0;

			return tileId === 0 || isTileWalkable(tileId);
		});
};

validateMapDefinition(INITIAL_MAP);
