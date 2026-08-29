/**
 * Lang: pt-BR
 * Espelha no servidor autoritativo a entrada multilayer 11×11 sem importar módulos do client.
 *
 * Lang: en-US
 * Mirrors the 11×11 multilayer entry in the authoritative server without importing client modules.
 */
export enum MapLayer {
	GROUND = 0,
	LEVEL_1 = 1,
}

export const SERVER_MAP = {
	[MapLayer.GROUND]: Array.from({ length: 11 }, () => Array<number>(11).fill(1)),
	[MapLayer.LEVEL_1]: Array.from({ length: 11 }, (_, row) => Array.from(
		{ length: 11 },
		(_, column) => row >= 4 && row <= 6 && column >= 4 && column <= 6 ? 101 : 0,
	)),
} as const;

export const MAP_LAYERS = [MapLayer.GROUND, MapLayer.LEVEL_1] as const;
export const MAP_ROWS = SERVER_MAP[MapLayer.GROUND].length;
export const MAP_COLUMNS = SERVER_MAP[MapLayer.GROUND][0]?.length ?? 0;

/**
 * Lang: pt-BR
 * Centraliza a regra autoritativa de terreno: ID 1 é caminhável e ID 101 é bloqueador.
 *
 * Lang: en-US
 * Centralizes the authoritative terrain rule: ID 1 is walkable and ID 101 is blocking.
 */
export const isTileWalkable = (tileId: number): boolean => tileId === 1;

/**
 * Lang: pt-BR
 * Bloqueia uma cell fora dos bounds ou com qualquer Tile não caminhável em qualquer layer.
 *
 * Lang: en-US
 * Blocks an out-of-bounds cell or one containing any non-walkable Tile in any layer.
 */
export const isCellWalkable = (row: number, column: number): boolean => row >= 0
	&& row < MAP_ROWS
	&& column >= 0
	&& column < MAP_COLUMNS
	&& MAP_LAYERS.every((layer) => {
		const tileId = SERVER_MAP[layer][row]?.[column] ?? 0;

		return tileId === 0 || isTileWalkable(tileId);
	});
