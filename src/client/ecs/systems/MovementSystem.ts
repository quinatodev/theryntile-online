/**
 * Lang: pt-BR
 * Interpola exclusivamente cada step já autorizado pelo servidor, preservando Walk entre steps.
 * Somente finalStep libera o route lock visual e retorna a animação para Idle.
 *
 * Lang: en-US
 * Interpolates only each step already authorized by the server, preserving Walk between steps.
 * Only finalStep releases the visual route lock and returns animation to Idle.
 */
import { gridToIsometric } from "../../engine/Isometric.js";
import { type Entity, type MovementStep } from "../Components.js";
import { type World } from "../World.js";

export const MOVEMENT_DURATION_MS = 500;
const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;

/** Lang: pt-BR - Converte um step autoritativo em direção de animação. Lang: en-US - Converts an authoritative step into an animation direction. */
const movementDirection = ({ column, fromColumn, fromRow, row }: MovementStep) => {
	if (column > fromColumn) return "right_down" as const;
	if (column < fromColumn) return "left_top" as const;
	if (row > fromRow) return "left_down" as const;

	return "right_top" as const;
};

/** Lang: pt-BR - Inicia o próximo step enfileirado sem antecipar posição lógica. Lang: en-US - Starts the next queued step without anticipating logical position. */
const startNextMovement = (world: World, entity: Entity): boolean => {
	const queue = world.movementQueues.get(entity);
	if (!queue) return false;
	const step = queue.shift();
	if (!step) {
		world.movementQueues.delete(entity);

		return false;
	}
	if (queue.length === 0) world.movementQueues.delete(entity);
	const gridPosition = world.gridPositions.get(entity);
	const visualPosition = world.visualPositions.get(entity);
	const animation = world.animations.get(entity);
	if (!gridPosition || !visualPosition || !animation) {
		world.movementQueues.delete(entity);
		world.movingPlayers.delete(entity);

		return false;
	}
	const target = gridToIsometric(step.column, step.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
	world.movements.set(entity, {
		finalStep: step.finalStep, fromColumn: step.fromColumn, fromRow: step.fromRow, progress: 0,
		startX: visualPosition.x, startY: visualPosition.y,
		targetColumn: step.column, targetRow: step.row, targetX: target.x, targetY: target.y,
	});
	gridPosition.column = step.column;
	gridPosition.row = step.row;
	animation.direction = movementDirection(step);
	animation.state = "walk";
	animation.frame = 0;
	delete animation.startedAt;

	return true;
};

/**
 * Lang: pt-BR
 * Enfileira somente um step autoritativo recebido e inicia seu playback apenas quando nenhum step visual está ativo.
 * A fila preserva a ordem do WebSocket e não concede decisão de movimento ao client.
 *
 * Lang: en-US
 * Enqueues only a received authoritative step and starts its playback only when no visual step is active.
 * The queue preserves WebSocket order and grants no movement authority to the client.
 */
export const enqueueMovementStep = (world: World, entity: Entity, step: MovementStep): void => {
	const queue = world.movementQueues.get(entity) ?? [];
	queue.push(step);
	world.movementQueues.set(entity, queue);
	world.movingPlayers.add(entity);
	if (!world.movements.has(entity)) startNextMovement(world, entity);
};

/** Lang: pt-BR - Interpola a fila visual de movimento recebida do servidor. Lang: en-US - Interpolates the visual movement queue received from the server. */
export class MovementSystem {
	/** Lang: pt-BR - Avança movimentos e consolida steps concluídos. Lang: en-US - Advances movements and commits completed steps. */
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
				visualPosition.x = movement.targetX;
				visualPosition.y = movement.targetY;
				world.movements.delete(entity);
				const nextStarted = startNextMovement(world, entity);
				if (!nextStarted && movement.finalStep) {
					world.movingPlayers.delete(entity);
					if (world.localPlayers.has(entity)) world.selectedTiles.clear();
					animation.state = "idle";
					animation.startedAt = timestamp;
					animation.frame = 0;
				}
			}
		}
	}
}
