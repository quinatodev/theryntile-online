/**
 * Lang: pt-BR
 * Resolve o ground Tile sob o pointer usando Camera, zoom e hit-test isométrico.
 * Walkability multilayer bloqueia tanto o Tile superior quanto click-through no ground inferior.
 *
 * Lang: en-US
 * Resolves the ground Tile under the pointer using Camera, zoom, and isometric hit testing.
 * Multilayer walkability blocks both the upper Tile and click-through to the lower ground.
 */
import { type Camera } from "../../engine/Camera.js";
import { TILE_VISUAL_GROUND_OFFSET_Y, worldToGrid } from "../../engine/Isometric.js";
import { type Entity, type PointerPosition } from "../Components.js";
import { type World } from "../World.js";
import { isCellWalkable } from "../../game/Map.js";
import { type RuntimeMap } from "../../game/Map.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;

export class HoverSystem {
	update(world: World, map: RuntimeMap, camera: Camera, viewportWidth: number, viewportHeight: number, pointer: PointerPosition): Entity | undefined {
		world.hoveredTiles.clear();
		if (!pointer.inside) return undefined;

		const worldX = (pointer.canvasX - viewportWidth / 2) / camera.zoom + camera.x;
		const worldY = (pointer.canvasY - viewportHeight / 2) / camera.zoom + camera.y;
		const target = worldToGrid(worldX, worldY - TILE_VISUAL_GROUND_OFFSET_Y, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
		if (!target || !isCellWalkable(map, target.row, target.column)) return undefined;

		for (const entity of world.tiles.keys()) {
			const gridPosition = world.gridPositions.get(entity);

			const renderable = world.renderables.get(entity);
			if (gridPosition?.row === target.row && gridPosition.column === target.column && renderable?.layer === 0) {
				world.hoveredTiles.add(entity);

				return entity;
			}
		}

		return undefined;
	}
}
