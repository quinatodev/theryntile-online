import { Newbie } from "./map/Newbie.js";
import { MultiplayerTest, SingleplayerTest } from "./map/TestMaps.js";
import { PORTALS } from "./Portals.js";
import { validateMapDefinition } from "./Map.js";
import { getTileDefinitions } from "./TileRegistry.js";

/**
 * Lang: pt-BR
 * Possui configurações globais do jogo e registra mapas concretos por seus IDs técnicos.
 * Cada definição permanece em arquivo próprio; o registry simples não possui lifecycle ou mutation.
 *
 * Lang: en-US
 * Owns global game settings and registers concrete maps by their technical IDs.
 * Each definition remains in its own file; the plain registry has no lifecycle or mutation.
 */
export const GAME_CONFIG = {
	maps: { lobby: Newbie, "multiplayer-test": MultiplayerTest, "singleplayer-test": SingleplayerTest },
	movement: { maxSteps: 8 },
	zoom: { max: 5, min: 2 },
} as const;

export const INITIAL_MAP_ID: keyof typeof GAME_CONFIG.maps = "lobby";
export const INVENTORY_POSITION_LIMIT = 10_000;
export const CHARACTER_POSITION_LIMIT = 10_000;
export const INVENTORY_COLUMNS_MAX = 6;
export const INVENTORY_COLUMNS_MIN = 4;

export interface InventoryPositionPreference {
	x: number;
	y: number;
}

export interface CharacterPositionPreference {
	x: number;
	y: number;
}

/**
 * Lang: pt-BR
 * Serializa somente o mapa inicial e as configurações necessárias ao Game, nunca o registry inteiro.
 *
 * Lang: en-US
 * Serializes only the initial map and settings required by the Game, never the whole registry.
 */
export const createGameBootstrapPayload = (
	zoomPreference: number,
	inventoryPosition: InventoryPositionPreference | null = null,
	inventoryColumns = INVENTORY_COLUMNS_MIN,
	characterPosition: CharacterPositionPreference | null = null,
) => {
	const map = GAME_CONFIG.maps[INITIAL_MAP_ID];
	validateMapDefinition(map);

	return {
		characterPosition,
		inventoryColumns,
		map,
		mapId: INITIAL_MAP_ID,
		portals: PORTALS.filter(({ mapId }) => mapId === INITIAL_MAP_ID),
		movement: GAME_CONFIG.movement,
		inventoryPosition,
		tileDefinitions: getTileDefinitions(),
		zoom: GAME_CONFIG.zoom,
		zoomPreference: clampZoom(zoomPreference),
	};
};

/** Lang: pt-BR - Aceita somente as três larguras discretas suportadas pela Backpack. Lang: en-US - Accepts only the three discrete widths supported by the Backpack. */
export const isAllowedInventoryColumns = (columns: unknown): columns is number => Number.isSafeInteger(columns)
	&& (columns as number) >= INVENTORY_COLUMNS_MIN
	&& (columns as number) <= INVENTORY_COLUMNS_MAX;

/** Lang: pt-BR - Limita coordenadas persistidas a pixels inteiros não negativos defensivos. Lang: en-US - Restricts persisted coordinates to defensive non-negative integer pixels. */
export const isAllowedInventoryCoordinate = (coordinate: unknown): coordinate is number => Number.isSafeInteger(coordinate)
	&& (coordinate as number) >= 0
	&& (coordinate as number) <= INVENTORY_POSITION_LIMIT;

/** Lang: pt-BR - Limita a posiÃ§Ã£o persistida de Character a pixels inteiros defensivos. Lang: en-US - Restricts the persisted Character position to defensive integer pixels. */
export const isAllowedCharacterCoordinate = (coordinate: unknown): coordinate is number => Number.isSafeInteger(coordinate)
	&& (coordinate as number) >= 0
	&& (coordinate as number) <= CHARACTER_POSITION_LIMIT;

/**
 * Lang: pt-BR
 * Confirma que um zoom finito pertence ao intervalo global aceito.
 *
 * Lang: en-US
 * Confirms that a finite zoom belongs to the accepted global range.
 */
export const isAllowedZoom = (zoom: number): boolean => Number.isFinite(zoom)
	&& zoom >= GAME_CONFIG.zoom.min
	&& zoom <= GAME_CONFIG.zoom.max;

/**
 * Lang: pt-BR
 * Normaliza preferências persistidas antigas para os limites globais atuais.
 *
 * Lang: en-US
 * Normalizes old persisted preferences to the current global limits.
 */
export const clampZoom = (zoom: number): number => Math.max(
	GAME_CONFIG.zoom.min,
	Math.min(GAME_CONFIG.zoom.max, zoom),
);
