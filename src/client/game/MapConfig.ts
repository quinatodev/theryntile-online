import { type RuntimeMap } from "./Map.js";

export interface GameRuntimeConfig {
	map: RuntimeMap;
	mapId: string;
	movement: { maxSteps: number };
	zoom: { max: number; min: number };
	zoomPreference: number;
}

const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);

/**
 * Lang: pt-BR
 * Valida e copia o mapa recebido, exigindo layers retangulares, compatíveis e Tile IDs inteiros não negativos.
 *
 * Lang: en-US
 * Validates and copies the received map, requiring rectangular compatible layers and non-negative integer Tile IDs.
 */
export function parseRuntimeMap(value: unknown): RuntimeMap {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid runtime map.");
	const entries = Object.entries(value);
	if (entries.length === 0) throw new Error("Runtime map must contain at least one layer.");
	const map: Record<number, number[][]> = {};
	let expectedRows: number | undefined;
	let expectedColumns: number | undefined;
	for (const [key, layer] of entries) {
		const layerNumber = Number(key);
		if (!Number.isSafeInteger(layerNumber) || layerNumber < 0 || String(layerNumber) !== key) throw new Error("Invalid runtime map layer key.");
		if (!Array.isArray(layer) || layer.length === 0) throw new Error("Runtime map layer must contain rows.");
		expectedRows ??= layer.length;
		if (layer.length !== expectedRows) throw new Error("Runtime map layers must have matching row counts.");
		const parsedLayer: number[][] = [];
		for (const row of layer) {
			if (!Array.isArray(row) || row.length === 0) throw new Error("Runtime map row must contain columns.");
			expectedColumns ??= row.length;
			if (row.length !== expectedColumns) throw new Error("Runtime map rows must have matching column counts.");
			if (!row.every((tileId) => isInteger(tileId) && tileId >= 0)) throw new Error("Invalid runtime map Tile ID.");
			parsedLayer.push([...row]);
		}
		map[layerNumber] = parsedLayer;
	}

	return map;
}

/**
 * Lang: pt-BR
 * Valida a fronteira HTTP completa antes de entregar mapa e configurações ao bootstrap do Game.
 *
 * Lang: en-US
 * Validates the complete HTTP boundary before handing map and settings to the Game bootstrap.
 */
export function parseGameBootstrapConfig(value: unknown): GameRuntimeConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid game configuration: response must be an object.");
	const response = value as Record<string, unknown>;
	const movement = response.movement as Record<string, unknown> | undefined;
	const zoom = response.zoom as Record<string, unknown> | undefined;
	if (typeof response.mapId !== "string" || response.mapId.length === 0) throw new Error("Invalid game configuration: mapId must be a non-empty string.");
	if (!("map" in response)) throw new Error("Invalid game configuration: map is missing.");
	if (!movement || typeof movement !== "object") throw new Error("Invalid game configuration: movement is missing or invalid.");
	if (!isInteger(movement.maxSteps) || movement.maxSteps <= 0) throw new Error("Invalid game configuration: movement.maxSteps must be a positive safe integer.");
	if (!zoom || typeof zoom !== "object") throw new Error("Invalid game configuration: zoom is missing or invalid.");
	if (!isInteger(zoom.min) || !isInteger(zoom.max) || zoom.min > zoom.max) throw new Error("Invalid game configuration: zoom limits must be ordered safe integers.");
	if (!isInteger(response.zoomPreference)) throw new Error("Invalid game configuration: zoomPreference must be a safe integer.");

	return {
		map: parseRuntimeMap(response.map),
		mapId: response.mapId,
		movement: { maxSteps: movement.maxSteps },
		zoom: { max: zoom.max, min: zoom.min },
		zoomPreference: Math.max(zoom.min, Math.min(zoom.max, response.zoomPreference)),
	};
}
