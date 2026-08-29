import { isCellWalkable } from "./Map.js";
import { type SpawnPosition } from "./Spawn.js";

/**
 * Lang: pt-BR
 * Limita a cinco steps a rota autoritativa completa aceita para uma intenção do client.
 *
 * Lang: en-US
 * Limits the complete authoritative route accepted from one client intent to five steps.
 */
export const MAX_MOVEMENT_STEPS = 5;
const NEIGHBOURS = [
	{ column: 0, row: -1 }, { column: -1, row: 0 },
	{ column: 1, row: 0 }, { column: 0, row: 1 },
] as const;
const keyOf = ({ row, column }: SpawnPosition) => `${row}:${column}`;
const heuristic = (a: SpawnPosition, b: SpawnPosition) => Math.abs(a.row - b.row) + Math.abs(a.column - b.column);

/**
 * Lang: pt-BR
 * Executa A* ortogonal autoritativo com vizinhos e desempate por inserção determinísticos.
 *
 * Lang: en-US
 * Runs authoritative orthogonal A* with deterministic neighbours and insertion-order tie-breaking.
 */
export function findPath(start: SpawnPosition, target: SpawnPosition): SpawnPosition[] | undefined {
	if (!isCellWalkable(start.row, start.column) || !isCellWalkable(target.row, target.column)) return undefined;
	if (start.row === target.row && start.column === target.column) return [];
	const open: Array<{ position: SpawnPosition; g: number; f: number; sequence: number }> = [
		{ position: start, g: 0, f: heuristic(start, target), sequence: 0 },
	];
	const cameFrom = new Map<string, SpawnPosition>();
	const costs = new Map<string, number>([[keyOf(start), 0]]);
	let sequence = 1;
	while (open.length > 0) {
		open.sort((a, b) => a.f - b.f || a.g - b.g || a.sequence - b.sequence);
		const current = open.shift();
		if (!current) break;
		if (keyOf(current.position) === keyOf(target)) {
			const path: SpawnPosition[] = [];
			let cursor = target;
			while (keyOf(cursor) !== keyOf(start)) {
				path.unshift(cursor);
				const previous = cameFrom.get(keyOf(cursor));
				if (!previous) return undefined;
				cursor = previous;
			}

			return path;
		}

		for (const delta of NEIGHBOURS) {
			const next = { row: current.position.row + delta.row, column: current.position.column + delta.column };
			if (!isCellWalkable(next.row, next.column)) continue;
			const nextCost = current.g + 1;
			if (nextCost >= (costs.get(keyOf(next)) ?? Number.POSITIVE_INFINITY)) continue;
			costs.set(keyOf(next), nextCost);
			cameFrom.set(keyOf(next), current.position);
			open.push({ position: next, g: nextCost, f: nextCost + heuristic(next, target), sequence });
			sequence += 1;
		}
	}

	return undefined;
}

/**
 * Lang: pt-BR
 * Autoriza somente uma rota A* completa de um a cinco steps; paths maiores nunca são truncados.
 *
 * Lang: en-US
 * Authorizes only a complete A* route of one through five steps; longer paths are never truncated.
 */
export const getAuthorizedPath = (start: SpawnPosition, target: SpawnPosition): SpawnPosition[] | undefined => {
	const path = findPath(start, target);

	return path && path.length > 0 && path.length <= MAX_MOVEMENT_STEPS ? path : undefined;
};
