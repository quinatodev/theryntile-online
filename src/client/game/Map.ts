/**
 * Lang: pt-BR
 * Define a entrada numérica multilayer usada apenas pela apresentação e navegação de UX do client.
 *
 * Lang: en-US
 * Defines the numeric multilayer entry used only by client presentation and UX navigation.
 */
export enum MapLayer {
	GROUND = 0,
	LEVEL_1 = 1,
}

/**
 * Lang: pt-BR
 * Define a elevação estrutural: cada layer visual sobe exatamente 8 px sem alterar GridPosition.
 *
 * Lang: en-US
 * Defines structural elevation: each visual layer rises exactly 8 px without changing GridPosition.
 */
export const LAYER_HEIGHT = 8;

const GROUND = [
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
] as const;

const LEVEL_1 = [
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 101, 101, 101, 0, 0, 0, 0],
	[0, 0, 0, 0, 101, 101, 101, 0, 0, 0, 0],
	[0, 0, 0, 0, 101, 101, 101, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
] as const;

export const GAME_MAP = {
	[MapLayer.GROUND]: GROUND,
	[MapLayer.LEVEL_1]: LEVEL_1,
} as const;

export const MAP_LAYERS = [MapLayer.GROUND, MapLayer.LEVEL_1] as const;
export const MAP_ROWS = GROUND.length;
export const MAP_COLUMNS = GROUND[0].length;
export const MAP_TILE_IDS = [...new Set(MAP_LAYERS.flatMap((layer) => GAME_MAP[layer].flat()).filter((tileId) => tileId !== 0))];

const TILE_TEXTURE_DIRECTORIES = ["grass", "ice"] as const;

/**
 * Lang: pt-BR
 * Resolve o asset de um Tile pelo ID numérico presente na entrada do mapa, sem guardar paths nas cells.
 *
 * Lang: en-US
 * Resolves a Tile asset from the numeric ID in the map entry without storing paths in cells.
 */
export const getTileTextureSource = (tileId: number): string => {
	const directory = TILE_TEXTURE_DIRECTORIES[Math.floor(tileId / 100)];
	if (!directory) throw new Error(`No texture directory is configured for Tile ID ${tileId}.`);

	return `/assets/textures/tiles/${directory}/tile${tileId}.png`;
};

/**
 * Lang: pt-BR
 * Centraliza a regra mínima de terreno: ID 1 é caminhável e ID 101 é bloqueador.
 *
 * Lang: en-US
 * Centralizes the minimal terrain rule: ID 1 is walkable and ID 101 is blocking.
 */
export const isTileWalkable = (tileId: number): boolean => tileId === 1;

/**
 * Lang: pt-BR
 * Considera a cell caminhável somente quando está nos bounds e nenhum Tile não vazio em qualquer layer a bloqueia.
 *
 * Lang: en-US
 * Treats a cell as walkable only when it is in bounds and no non-empty Tile in any layer blocks it.
 */
export const isCellWalkable = (row: number, column: number): boolean => row >= 0
	&& row < MAP_ROWS
	&& column >= 0
	&& column < MAP_COLUMNS
	&& MAP_LAYERS.every((layer) => {
		const tileId = GAME_MAP[layer][row]?.[column] ?? 0;

		return tileId === 0 || isTileWalkable(tileId);
	});

/**
 * Lang: pt-BR
 * Converte layer estrutural no deslocamento vertical usado pelo render e por sua geometria associada.
 *
 * Lang: en-US
 * Converts structural layer into the vertical offset used by rendering and its associated geometry.
 */
export const getLayerVisualOffsetY = (layer: number): number => layer === 0 ? 0 : -layer * LAYER_HEIGHT;
