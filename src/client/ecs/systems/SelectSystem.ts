/**
 * Lang: pt-BR
 * Mantém no máximo um destino selecionado e exige path dentro do limite runtime sem rota local ativa.
 * Cells bloqueadas por qualquer layer são recusadas mesmo quando o grass inferior é informado diretamente.
 *
 * Lang: en-US
 * Keeps at most one selected target and requires a path within the runtime limit with no active local route.
 * Cells blocked by any layer are rejected even when the lower grass is supplied directly.
 */
import { type Entity } from "../Components.js";
import { type World } from "../World.js";
import { isCellWalkable } from "../../game/Map.js";
import { type RuntimeMap, type RuntimeTileDefinitions } from "../../game/Map.js";

/** Lang: pt-BR - Define a única semântica client-side de destino clicável. Lang: en-US - Defines the single client-side clickable-destination semantic. */
export const canSelectTile = (world: World, map: RuntimeMap, tileDefinitions: RuntimeTileDefinitions, entity: Entity | undefined, pathLength?: number, maxMovementSteps?: number, routeActive = false): boolean => {
	const grid = entity === undefined ? undefined : world.gridPositions.get(entity);
	if (entity === undefined || grid === undefined || pathLength === undefined || maxMovementSteps === undefined) return false;

	return world.tiles.has(entity) && isCellWalkable(map, tileDefinitions, grid.row, grid.column)
		&& pathLength > 0 && pathLength <= maxMovementSteps && !routeActive && !world.selectedTiles.has(entity);
};

/** Lang: pt-BR - Aplica as invariantes de seleção de destino. Lang: en-US - Applies destination-selection invariants. */
export class SelectSystem {
	/** Lang: pt-BR - Substitui a seleção apenas por destino alcançável e permitido. Lang: en-US - Replaces selection only with a reachable permitted target. */
	select(world: World, map: RuntimeMap, tileDefinitions: RuntimeTileDefinitions, entity: Entity | undefined, pathLength?: number, maxMovementSteps?: number, routeActive = false): Entity | undefined {
		if (!canSelectTile(world, map, tileDefinitions, entity, pathLength, maxMovementSteps, routeActive)) return undefined;
		world.selectedTiles.clear();
		world.selectedTiles.add(entity!);

		return entity;
	}
}
