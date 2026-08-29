/**
 * Lang: pt-BR
 * Interpola exclusivamente a apresentação client-side de movimentos já autorizados pelo servidor.
 *
 * Lang: en-US
 * Interpolates only the client-side presentation of movements already authorized by the server.
 */
import { type GridPosition, type MoveTargetComponent } from "../Components.js";
import { type World } from "../World.js";

export const MOVEMENT_DURATION_MS = 500;

export const getNextOrthogonalStep = (current: GridPosition, target: GridPosition): GridPosition | undefined => {
	if (current.row !== target.row) {
		return { column: current.column, row: current.row + Math.sign(target.row - current.row) };
	}

	if (current.column !== target.column) {
		return { column: current.column + Math.sign(target.column - current.column), row: current.row };
	}

	return undefined;
};

export const getOrthogonalSteps = (current: GridPosition, target: GridPosition): GridPosition[] => {
	const steps: GridPosition[] = [];
	let position = current;
	let nextStep = getNextOrthogonalStep(position, target);

	while (nextStep) {
		steps.push(nextStep);
		position = nextStep;
		nextStep = getNextOrthogonalStep(position, target);
	}

	return steps;
};

export const getNextRequestedStep = (
	current: GridPosition,
	target: MoveTargetComponent,
	movementActive: boolean,
): GridPosition | undefined => target.awaitingStep || movementActive ? undefined : getNextOrthogonalStep(current, target);

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
				animation.state = "idle";
				animation.startedAt = timestamp;
				animation.frame = 0;
				world.movements.delete(entity);
			}
		}
	}
}
