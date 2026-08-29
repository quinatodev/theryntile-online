/**
 * Lang: pt-BR
 * Mantém no máximo um ground Tile caminhável selecionado, independentemente do estado de hover.
 * Cells bloqueadas por qualquer layer são recusadas mesmo quando o grass inferior é informado diretamente.
 *
 * Lang: en-US
 * Keeps at most one walkable ground Tile selected, independently from hover state.
 * Cells blocked by any layer are rejected even when the lower grass is supplied directly.
 */
import { type Entity } from "../Components.js";
import { type World } from "../World.js";
import { isCellWalkable } from "../../game/Map.js";

export class SelectSystem {
	select(world: World, entity: Entity | undefined): Entity | undefined {
		const grid = entity === undefined ? undefined : world.gridPositions.get(entity);
		if (entity === undefined || !world.tiles.has(entity) || !grid || !isCellWalkable(grid.row, grid.column)) return undefined;
		world.selectedTiles.clear();
		world.selectedTiles.add(entity);

		return entity;
	}
}
