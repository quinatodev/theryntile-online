import { type Entity } from "../Components.js";
import { type World } from "../World.js";
import { getReachableCells } from "../../game/Navigation.js";

export const WALK_HINT_IDLE_MS = 2_000;

/**
 * Lang: pt-BR
 * Deriva por BFS limitado os Tiles alcançáveis após 2 s de idle usando o RAF, sem timer ou loop paralelo.
 * Limpa o estado durante movimento; o renderer aplica a prioridade Selected > Hover > Hint.
 *
 * Lang: en-US
 * Derives reachable Tiles through bounded BFS after 2 s idle using RAF time, without a parallel timer or loop.
 * Clears state during movement; the renderer applies Selected > Hover > Hint priority.
 */
export class WalkHintSystem {
	private idleSince: number | undefined;
	private lastGridKey: string | undefined;

	reset(world: World): void {
		this.idleSince = undefined;
		this.lastGridKey = undefined;
		world.hintedTiles.clear();
	}

	update(world: World, localPlayer: Entity, timestamp: number): void {
		const grid = world.gridPositions.get(localPlayer);
		if (!grid) return;
		const key = `${grid.row}:${grid.column}`;
		if (world.movingPlayers.has(localPlayer) || world.movements.has(localPlayer)) {
			this.idleSince = undefined;
			this.lastGridKey = key;
			world.hintedTiles.clear();

			return;
		}
		if (this.lastGridKey !== key) {
			this.lastGridKey = key;
			this.idleSince = timestamp;
			world.hintedTiles.clear();

			return;
		}
		this.idleSince ??= timestamp;
		if (timestamp - this.idleSince < WALK_HINT_IDLE_MS || world.hintedTiles.size > 0) return;
		const reachable = new Set(getReachableCells(grid).map(({ row, column }) => `${row}:${column}`));

		for (const entity of world.tiles.keys()) {
			const tileGrid = world.gridPositions.get(entity);
			const renderable = world.renderables.get(entity);
			if (tileGrid && renderable?.layer === 0 && reachable.has(`${tileGrid.row}:${tileGrid.column}`)) {
				world.hintedTiles.add(entity);
			}
		}
	}
}
