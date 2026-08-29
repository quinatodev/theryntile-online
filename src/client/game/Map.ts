export type RuntimeMap = Readonly<Record<number, readonly (readonly number[])[]>>;

export const LAYER_HEIGHT = 8;
const TILE_TEXTURE_DIRECTORIES = ["grass", "ice"] as const;

/**
 * Lang: pt-BR
 * Deriva layers ordenadas exclusivamente do mapa runtime recebido pela API.
 *
 * Lang: en-US
 * Derives sorted layers exclusively from the runtime map received through the API.
 */
export const getMapLayers = (map: RuntimeMap): number[] => Object.keys(map).map(Number).sort((a, b) => a - b);

/**
 * Lang: pt-BR
 * Deriva bounds do mapa runtime validado, sem manter dimensões paralelas.
 *
 * Lang: en-US
 * Derives bounds from the validated runtime map without parallel dimensions.
 */
export const getMapBounds = (map: RuntimeMap): { columns: number; rows: number } => {
	const firstLayer = map[getMapLayers(map)[0] as number];

	return { columns: firstLayer?.[0]?.length ?? 0, rows: firstLayer?.length ?? 0 };
};

/**
 * Lang: pt-BR
 * Extrai os IDs não vazios necessários para carregar exatamente as textures do mapa runtime.
 *
 * Lang: en-US
 * Extracts non-empty IDs required to load exactly the runtime map textures.
 */
export const getMapTileIds = (map: RuntimeMap): number[] => [...new Set(
	getMapLayers(map).flatMap((layer) => map[layer]?.flat() ?? []).filter((tileId) => tileId !== 0),
)];

/**
 * Lang: pt-BR
 * Resolve o asset de Tile pelo ID validado presente no mapa runtime.
 *
 * Lang: en-US
 * Resolves a Tile asset from a validated ID in the runtime map.
 */
export const getTileTextureSource = (tileId: number): string => {
	const directory = TILE_TEXTURE_DIRECTORIES[Math.floor(tileId / 100)];
	if (!directory) throw new Error(`No texture directory is configured for Tile ID ${tileId}.`);

	return `/assets/textures/tiles/${directory}/tile${tileId}.png`;
};

/**
 * Lang: pt-BR
 * Centraliza a regra client-side de terreno espelhada para UX: ID 1 é caminhável.
 *
 * Lang: en-US
 * Centralizes the client-side terrain rule mirrored for UX: ID 1 is walkable.
 */
export const isTileWalkable = (tileId: number): boolean => tileId === 1;

/**
 * Lang: pt-BR
 * Avalia bounds e walkability usando somente o mapa runtime atual.
 *
 * Lang: en-US
 * Evaluates bounds and walkability using only the current runtime map.
 */
export const isCellWalkable = (map: RuntimeMap, row: number, column: number): boolean => {
	const { rows, columns } = getMapBounds(map);

	return row >= 0 && row < rows && column >= 0 && column < columns
		&& getMapLayers(map).every((layer) => {
			const tileId = map[layer]?.[row]?.[column] ?? 0;

			return tileId === 0 || isTileWalkable(tileId);
		});
};

/**
 * Lang: pt-BR
 * Converte layer estrutural no deslocamento vertical usado somente pela apresentação.
 *
 * Lang: en-US
 * Converts a structural layer into the vertical offset used only by presentation.
 */
export const getLayerVisualOffsetY = (layer: number): number => layer === 0 ? 0 : -layer * LAYER_HEIGHT;
