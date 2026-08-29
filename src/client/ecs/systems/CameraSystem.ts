/**
 * Lang: pt-BR
 * Faz a câmera seguir os pés visuais da única Entity marcada como Player local.
 *
 * Lang: en-US
 * Makes the camera follow the visual feet of the sole Entity tagged as the local Player.
 */
import { type Camera } from "../../engine/Camera.js";
import { type World } from "../World.js";

export class CameraSystem {
	update(world: World, camera: Camera): void {
		for (const entity of world.localPlayers) {
			const visualPosition = world.visualPositions.get(entity);
			const sprite = world.sprites.get(entity);

			if (!visualPosition || !sprite) continue;

			camera.x = visualPosition.x;
			camera.y = visualPosition.y + sprite.feetOffsetY;

			return;
		}
	}
}
