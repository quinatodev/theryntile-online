/**
 * Lang: pt-BR
 * Seleciona uma posição livre sem conhecer ou mutar channels, sockets ou banco de dados.
 * A escolha aleatória é a política simples atual e pode ser injetada para testes determinísticos.
 *
 * Lang: en-US
 * Selects a free position without knowing about or mutating channels, sockets, or the database.
 * Random selection is the current simple policy and can be injected for deterministic tests.
 */
export interface SpawnPosition {
	row: number;
	column: number;
}
import { getMapBounds, INITIAL_MAP, isCellWalkable, type MapDefinition } from "./Map.js";

/**
 * Lang: pt-BR
 * Prefere uma cell caminhável desocupada e usa uma caminhável ocupada quando todas as candidatas estiverem ocupadas.
 * Tiles bloqueadores nunca participam nem como fallback, preservando stacking somente em terreno válido.
 *
 * Lang: en-US
 * Prefers an unoccupied walkable cell and uses an occupied walkable one when every candidate is occupied.
 * Blocking Tiles never participate even as fallback, preserving stacking only on valid terrain.
 */
export function getRandomSpawn(
	occupiedPositions: readonly SpawnPosition[],
	random: () => number = Math.random,
	map: MapDefinition = INITIAL_MAP,
): SpawnPosition {
	const availablePositions: SpawnPosition[] = [];
	const allPositions: SpawnPosition[] = [];

	const { rows, columns } = getMapBounds(map);
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			if (!isCellWalkable(map, row, column)) continue;
			allPositions.push({ row, column });
			const occupied = occupiedPositions.some((position) => position.row === row && position.column === column);

			if (!occupied) {
				availablePositions.push({ row, column });
			}
		}
	}

	const candidates = availablePositions.length > 0 ? availablePositions : allPositions;

	return candidates[Math.floor(random() * candidates.length)] as SpawnPosition;
}
