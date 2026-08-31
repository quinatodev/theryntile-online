/**
 * Lang: pt-BR
 * Avança frames de idle e walk pela base temporal única fornecida pelo RAF do Game.
 *
 * Lang: en-US
 * Advances idle and walk frames using the single time base supplied by Game's RAF.
 */
import { type World } from "../World.js";

export const ANIMATION_FRAME_COUNT = 8;
export const IDLE_FRAMES_PER_SECOND = 8;
export const WALK_FRAMES_PER_SECOND = 16;

/** Lang: pt-BR - Atualiza frames de animação pela timestamp do runtime. Lang: en-US - Updates animation frames from the runtime timestamp. */
export class AnimationSystem {
	/** Lang: pt-BR - Avança todas as animações com uma base temporal comum. Lang: en-US - Advances all animations with one shared time base. */
	update(world: World, timestamp: number): void {
		for (const animation of world.animations.values()) {
			animation.startedAt ??= timestamp;
			const elapsed = Math.max(0, timestamp - animation.startedAt);
			const framesPerSecond = animation.state === "idle" ? IDLE_FRAMES_PER_SECOND : WALK_FRAMES_PER_SECOND;
			animation.frame = Math.floor(elapsed * framesPerSecond / 1_000) % ANIMATION_FRAME_COUNT;
		}
	}
}
