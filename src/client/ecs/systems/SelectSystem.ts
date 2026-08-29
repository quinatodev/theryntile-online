/**
 * Lang: pt-BR
 * Mantém no máximo um Tile Entity selecionado, independentemente do estado de hover.
 *
 * Lang: en-US
 * Keeps at most one Tile Entity selected, independently from hover state.
 */
import { type Entity } from "../Components.js";
import { type World } from "../World.js";

export class SelectSystem {
	select(world: World, entity: Entity | undefined): Entity | undefined {
		if (entity === undefined || !world.tiles.has(entity)) return undefined;
		world.selectedTiles.clear();
		world.selectedTiles.add(entity);

		return entity;
	}
}
