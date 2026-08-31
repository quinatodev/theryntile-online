import { type Entity } from "../Components.js";
import { type World } from "../World.js";
import { getReachableCells } from "../../game/Navigation.js";
import { type RuntimeMap, type RuntimeTileDefinitions } from "../../game/Map.js";
import { CLIENT_CONFIG } from "../../game/ClientConfig.js";

/**
 * Lang: pt-BR
 * Deriva por BFS os anéis alcançáveis, calcula o fade-in individual e aplica fade-out conjunto na RAF existente.
 * Limpa o estado durante movimento e reinicia o delay normal somente após concluir o ciclo.
 *
 * Lang: en-US
 * Derives reachable BFS rings, calculates individual fade-in, and applies shared fade-out on the existing RAF.
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

	/** Lang: pt-BR - Reinicia todo o ciclo visual de hints. Lang: en-US - Resets the complete visual hint cycle. */
	reset(world: World): void {
		this.idleSince = undefined;
		this.lastGridKey = undefined;
		world.hintedTiles.clear();
		world.hintedTileAlphas.clear();
		world.walkHintAlpha = CLIENT_CONFIG.hints.maxAlpha;
		this.reachableByDistance.clear();
	}

	/** Lang: pt-BR - Revela anéis alcançáveis e executa seu fade configurado. Lang: en-US - Reveals reachable rings and runs their configured fade. */
	update(world: World, localPlayer: Entity, timestamp: number): void {
		const grid = world.gridPositions.get(localPlayer);
		if (!grid) return;
		const key = `${grid.row}:${grid.column}`;
		if (world.movingPlayers.has(localPlayer) || world.movements.has(localPlayer)) {
			this.idleSince = undefined;
			this.lastGridKey = key;
			world.hintedTiles.clear();
			world.hintedTileAlphas.clear();
			world.walkHintAlpha = CLIENT_CONFIG.hints.maxAlpha;
			this.reachableByDistance.clear();

			return;
		}
		if (this.lastGridKey !== key) {
			this.lastGridKey = key;
			this.idleSince = timestamp;
			world.hintedTiles.clear();
			world.hintedTileAlphas.clear();
			world.walkHintAlpha = CLIENT_CONFIG.hints.maxAlpha;
			this.reachableByDistance.clear();

			return;
		}
		this.idleSince ??= timestamp;
		const elapsed = timestamp - this.idleSince;
		if (elapsed < CLIENT_CONFIG.hints.delayMs) return;
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
		const revealElapsed = elapsed - CLIENT_CONFIG.hints.delayMs;
		const lastDistance = Math.max(0, ...this.reachableByDistance.keys());
		const revealedDistance = Math.min(lastDistance, Math.floor(revealElapsed / CLIENT_CONFIG.hints.ringIntervalMs) + 1);
		for (let distance = 1; distance <= revealedDistance; distance += 1) {
			const ringElapsed = revealElapsed - (distance - 1) * CLIENT_CONFIG.hints.ringIntervalMs;
			const fadeInAlpha = CLIENT_CONFIG.hints.maxAlpha * Math.min(1, Math.max(0, ringElapsed / CLIENT_CONFIG.hints.fadeInDurationMs));
			for (const entity of this.reachableByDistance.get(distance) ?? []) {
				world.hintedTiles.add(entity);
				world.hintedTileAlphas.set(entity, fadeInAlpha);
			}
		}
		const fadeStart = lastDistance * CLIENT_CONFIG.hints.ringIntervalMs;
		if (revealElapsed < fadeStart) return;
		world.walkHintAlpha = CLIENT_CONFIG.hints.maxAlpha * Math.max(
			0,
			1 - (revealElapsed - fadeStart) / CLIENT_CONFIG.hints.fadeDurationMs,
		);
		if (world.walkHintAlpha > 0) return;
		world.hintedTiles.clear();
		world.hintedTileAlphas.clear();
		this.reachableByDistance.clear();
		this.idleSince = timestamp;
		world.walkHintAlpha = CLIENT_CONFIG.hints.maxAlpha;
	}
}
