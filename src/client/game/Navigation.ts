import { type GridPosition } from "../ecs/Components.js";
import { isCellWalkable } from "./Map.js";
import { type RuntimeMap, type RuntimeTileDefinitions } from "./Map.js";

/**
 * Lang: pt-BR
 * Mantém o pathfinder sem limite para distinguir destino inalcançável de destino além do alcance runtime.
 *
 * Lang: en-US
 * Keeps pathfinding unbounded to distinguish an unreachable target from one beyond the runtime range.
 */
// Lang: pt-BR
// A ordem fixa norte, oeste, leste, sul e o índice de inserção tornam os empates determinísticos.
// Lang: en-US
// Fixed north, west, east, south order plus insertion index makes ties deterministic.
const NEIGHBOURS = [
	{ column: 0, row: -1 },
	{ column: -1, row: 0 },
	{ column: 1, row: 0 },
	{ column: 0, row: 1 },
] as const;

/** Lang: pt-BR - Produz chave estável de uma célula. Lang: en-US - Produces a stable cell key. */
const keyOf = ({ row, column }: GridPosition) => `${row}:${column}`;
/** Lang: pt-BR - Calcula distância Manhattan admissível para o A*. Lang: en-US - Computes the admissible Manhattan distance for A*. */
const heuristic = (a: GridPosition, b: GridPosition) => Math.abs(a.row - b.row) + Math.abs(a.column - b.column);

/**
 * Lang: pt-BR
 * Calcula A* ortogonal client-side para UX, com Manhattan e desempate determinístico; o servidor recalcula a rota.
 *
 * Lang: en-US
 * Computes client-side orthogonal A* for UX with Manhattan and deterministic tie-breaking; the server recalculates the route.
 */
export function findPath(
	map: RuntimeMap, tileDefinitions: RuntimeTileDefinitions, start: GridPosition, target: GridPosition,
): GridPosition[] | undefined {
	if (!isCellWalkable(map, tileDefinitions, start.row, start.column)
		|| !isCellWalkable(map, tileDefinitions, target.row, target.column)) return undefined;
	if (start.row === target.row && start.column === target.column) return [];
	const open: Array<{ position: GridPosition; g: number; f: number; sequence: number }> = [
		{ position: start, g: 0, f: heuristic(start, target), sequence: 0 },
	];
	const cameFrom = new Map<string, GridPosition>();
	const costs = new Map<string, number>([[keyOf(start), 0]]);
	let sequence = 1;

	while (open.length > 0) {
		open.sort((a, b) => a.f - b.f || a.g - b.g || a.sequence - b.sequence);
		const current = open.shift();
		if (!current) break;
		if (current.position.row === target.row && current.position.column === target.column) {
			const path: GridPosition[] = [];
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
			if (!isCellWalkable(map, tileDefinitions, next.row, next.column)) continue;
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
 * Executa BFS limitado para derivar uma vez as cells caminháveis alcançáveis exibidas pelo Walk Hint.
 *
 * Lang: en-US
 * Runs bounded BFS to derive once the reachable walkable cells displayed by Walk Hint.
 */
export interface ReachableCell extends GridPosition { distance: number }

/** Lang: pt-BR - Enumera por BFS células alcançáveis dentro do limite. Lang: en-US - Enumerates by BFS cells reachable within the limit. */
export function getReachableCells(
	map: RuntimeMap, tileDefinitions: RuntimeTileDefinitions, start: GridPosition, maxSteps: number,
): ReachableCell[] {
	const queue = [{ position: start, distance: 0 }];
	const visited = new Set([keyOf(start)]);
	const reachable: ReachableCell[] = [];

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || current.distance >= maxSteps) continue;
		for (const delta of NEIGHBOURS) {
			const next = { row: current.position.row + delta.row, column: current.position.column + delta.column };
			const key = keyOf(next);
			if (visited.has(key) || !isCellWalkable(map, tileDefinitions, next.row, next.column)) continue;
			visited.add(key);
			reachable.push({ ...next, distance: current.distance + 1 });
			queue.push({ position: next, distance: current.distance + 1 });
		}
	}

	return reachable;
}

/**
 * Lang: pt-BR
 * Aceita para UX somente destinos cuja rota completa cabe no limite runtime recebido, sem truncar paths maiores.
 *
 * Lang: en-US
 * Accepts for UX only destinations whose complete route fits the received runtime limit, without truncating longer paths.
 */
export const isValidDestination = (
	map: RuntimeMap, tileDefinitions: RuntimeTileDefinitions, start: GridPosition, target: GridPosition, maxSteps: number,
): boolean => {
	const path = findPath(map, tileDefinitions, start, target);

	return path !== undefined && path.length > 0 && path.length <= maxSteps;
};
