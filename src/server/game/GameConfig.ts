import { Newbie } from "./map/Newbie.js";
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
	maps: { lobby: Newbie },
	movement: { maxSteps: 8 },
	zoom: { max: 5, min: 2 },
} as const;

export const INITIAL_MAP_ID: keyof typeof GAME_CONFIG.maps = "lobby";

/**
 * Lang: pt-BR
 * Serializa somente o mapa inicial e as configurações necessárias ao Game, nunca o registry inteiro.
 *
 * Lang: en-US
 * Serializes only the initial map and settings required by the Game, never the whole registry.
 */
export const createGameBootstrapPayload = (zoomPreference: number) => {
	const map = GAME_CONFIG.maps[INITIAL_MAP_ID];
	validateMapDefinition(map);

	return {
		map,
		mapId: INITIAL_MAP_ID,
		movement: GAME_CONFIG.movement,
		tileDefinitions: getTileDefinitions(),
		zoom: GAME_CONFIG.zoom,
		zoomPreference: clampZoom(zoomPreference),
	};
};

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
