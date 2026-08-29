/**
 * Lang: pt-BR
 * Resolve o Tile Entity sob o pointer usando Camera, zoom e o diamond hit-test isométrico existente.
 *
 * Lang: en-US
 * Resolves the Tile Entity under the pointer using Camera, zoom, and the existing isometric diamond hit test.
 */
import { type Camera } from "../../engine/Camera.js";
import { TILE_VISUAL_GROUND_OFFSET_Y, worldToGrid } from "../../engine/Isometric.js";
import { type Entity, type PointerPosition } from "../Components.js";
import { type World } from "../World.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;

export class HoverSystem {
	update(world: World, camera: Camera, viewportWidth: number, viewportHeight: number, pointer: PointerPosition): Entity | undefined {
		world.hoveredTiles.clear();
		if (!pointer.inside) return undefined;

		const worldX = (pointer.canvasX - viewportWidth / 2) / camera.zoom + camera.x;
		const worldY = (pointer.canvasY - viewportHeight / 2) / camera.zoom + camera.y;
		const target = worldToGrid(worldX, worldY - TILE_VISUAL_GROUND_OFFSET_Y, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
		if (!target) return undefined;

		for (const entity of world.tiles.keys()) {
			const gridPosition = world.gridPositions.get(entity);

			if (gridPosition?.row === target.row && gridPosition.column === target.column) {
				world.hoveredTiles.add(entity);

				return entity;
			}
		}

		return undefined;
	}
}
