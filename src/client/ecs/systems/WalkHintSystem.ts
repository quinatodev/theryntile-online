import { type Entity } from "../Components.js";
import { type World } from "../World.js";
import { getReachableCells } from "../../game/Navigation.js";
import { type RuntimeMap, type RuntimeTileDefinitions } from "../../game/Map.js";

export const WALK_HINT_IDLE_MS = 2_000;
export const HINT_RING_INTERVAL_MS = 140;
export const HINT_FADE_DURATION_MS = 500;

/**
 * Lang: pt-BR
 * Deriva por BFS os anéis alcançáveis, revela-os a cada 140 ms e aplica fade conjunto de 500 ms na RAF existente.
 * Limpa o estado durante movimento e reinicia o delay normal somente após concluir o ciclo.
 *
 * Lang: en-US
 * Derives reachable BFS rings, reveals them every 140 ms, and applies a shared 500 ms fade on the existing RAF.
 * Clears state during movement and restarts the normal delay only after completing the cycle.
 */
export class WalkHintSystem {
	private idleSince: number | undefined;
	private lastGridKey: string | undefined;
	private reachableByDistance = new Map<number, Entity[]>();

	constructor(
		private readonly map: RuntimeMap,
		private readonly tileDefinitions: RuntimeTileDefinitions,
		private readonly maxMovementSteps: number,
	) {}

	reset(world: World): void {
		this.idleSince = undefined;
		this.lastGridKey = undefined;
		world.hintedTiles.clear();
		world.walkHintAlpha = 1;
		this.reachableByDistance.clear();
	}

	update(world: World, localPlayer: Entity, timestamp: number): void {
		const grid = world.gridPositions.get(localPlayer);
		if (!grid) return;
		const key = `${grid.row}:${grid.column}`;
		if (world.movingPlayers.has(localPlayer) || world.movements.has(localPlayer)) {
			this.idleSince = undefined;
			this.lastGridKey = key;
			world.hintedTiles.clear();
			world.walkHintAlpha = 1;
			this.reachableByDistance.clear();

			return;
		}
		if (this.lastGridKey !== key) {
			this.lastGridKey = key;
			this.idleSince = timestamp;
			world.hintedTiles.clear();
			world.walkHintAlpha = 1;
			this.reachableByDistance.clear();

			return;
		}
		this.idleSince ??= timestamp;
		const elapsed = timestamp - this.idleSince;
		if (elapsed < WALK_HINT_IDLE_MS) return;
		if (this.reachableByDistance.size === 0) {
			const distances = new Map(getReachableCells(this.map, this.tileDefinitions, grid, this.maxMovementSteps)
				.map(({ row, column, distance }) => [`${row}:${column}`, distance]));
			for (const entity of world.tiles.keys()) {
				const tileGrid = world.gridPositions.get(entity);
				const renderable = world.renderables.get(entity);
				const distance = tileGrid ? distances.get(`${tileGrid.row}:${tileGrid.column}`) : undefined;
				if (distance !== undefined && renderable?.layer === 0) {
					const ring = this.reachableByDistance.get(distance) ?? [];
					ring.push(entity);
					this.reachableByDistance.set(distance, ring);
				}
			}
		}
		const revealElapsed = elapsed - WALK_HINT_IDLE_MS;
		const lastDistance = Math.max(0, ...this.reachableByDistance.keys());
		const revealedDistance = Math.min(lastDistance, Math.floor(revealElapsed / HINT_RING_INTERVAL_MS) + 1);
		for (let distance = 1; distance <= revealedDistance; distance += 1) {
			for (const entity of this.reachableByDistance.get(distance) ?? []) world.hintedTiles.add(entity);
		}
		const fadeStart = lastDistance * HINT_RING_INTERVAL_MS;
		if (revealElapsed < fadeStart) return;
		world.walkHintAlpha = Math.max(0, 1 - (revealElapsed - fadeStart) / HINT_FADE_DURATION_MS);
		if (world.walkHintAlpha > 0) return;
		world.hintedTiles.clear();
		this.reachableByDistance.clear();
		this.idleSince = timestamp;
		world.walkHintAlpha = 1;
	}
}
