/**
 * Lang: pt-BR
 * Interpola exclusivamente cada step já autorizado pelo servidor, preservando Walk entre steps.
 * Somente finalStep libera o route lock visual e retorna a animação para Idle.
 *
 * Lang: en-US
 * Interpolates only each step already authorized by the server, preserving Walk between steps.
 * Only finalStep releases the visual route lock and returns animation to Idle.
 */
import { type World } from "../World.js";

export const MOVEMENT_DURATION_MS = 500;

export class MovementSystem {
	update(world: World, timestamp: number): void {
		for (const [entity, movement] of world.movements) {
			const visualPosition = world.visualPositions.get(entity);
			const animation = world.animations.get(entity);

			if (!visualPosition || !animation) continue;

			movement.startedAt ??= timestamp;
			const elapsed = Math.max(0, timestamp - movement.startedAt);
			movement.progress = Math.min(1, elapsed / MOVEMENT_DURATION_MS);
			visualPosition.x = movement.startX + (movement.targetX - movement.startX) * movement.progress;
			visualPosition.y = movement.startY + (movement.targetY - movement.startY) * movement.progress;

			if (movement.progress >= 1) {
				world.movements.delete(entity);
				if (movement.finalStep) {
					world.movingPlayers.delete(entity);
					animation.state = "idle";
					animation.startedAt = timestamp;
					animation.frame = 0;
				}
			}
		}
	}
}
