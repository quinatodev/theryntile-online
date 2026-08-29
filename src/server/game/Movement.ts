/**
 * Lang: pt-BR
 * Valida uma transição lógica de um tile contra limites, adjacência ortogonal e ocupação.
 * Não conhece sockets e não produz mutation, permitindo que Channels preserve autoridade e atomicidade.
 *
 * Lang: en-US
 * Validates a one-tile logical transition against bounds, orthogonal adjacency, and occupancy.
 * It knows no sockets and performs no mutation, allowing Channels to preserve authority and atomicity.
 */
import { LOBBY_COLUMNS, LOBBY_ROWS, type SpawnPosition } from "./Spawn.js";

/**
 * Lang: pt-BR
 * Retorna true somente quando o destino inteiro está dentro do mapa, é adjacente e está livre.
 *
 * Lang: en-US
 * Returns true only when the integer destination is within the map, adjacent, and unoccupied.
 */
export function canMoveTo(
	current: SpawnPosition,
	target: SpawnPosition,
	occupiedPositions: readonly SpawnPosition[],
): boolean {
	if (
		!Number.isSafeInteger(target.row)
		|| !Number.isSafeInteger(target.column)
		|| target.row < 0
		|| target.row >= LOBBY_ROWS
		|| target.column < 0
		|| target.column >= LOBBY_COLUMNS
	) {
		return false;
	}

	const distance = Math.abs(target.row - current.row) + Math.abs(target.column - current.column);

	return distance === 1
		&& !occupiedPositions.some(({ row, column }) => row === target.row && column === target.column);
}
