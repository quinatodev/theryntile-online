/**
 * Lang: pt-BR
 * Representa a timeline autoritativa: GridPosition permanece discreta e VisualPosition interpola o intervalo vigente.
 * RAF suspensa consolida passos expirados sem replay; sequence impede regressão por mensagens antigas.
 *
 * Lang: en-US
 * Represents the authoritative timeline: GridPosition stays discrete while VisualPosition interpolates the current interval.
 * Suspended RAF commits expired steps without replay; sequence prevents stale-message regression.
 */
import { gridToIsometric } from "../../engine/Isometric.js";
import { type Entity, type MovementStep } from "../Components.js";
import { type World } from "../World.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;
const LEGACY_TEST_STEP_MS = 500;

/** Lang: pt-BR - Converte step em direção visual. Lang: en-US - Converts a step into visual direction. */
const movementDirection = ({ column, fromColumn, fromRow, row }: MovementStep) => {
	if (column > fromColumn) return "right_down" as const;
	if (column < fromColumn) return "left_top" as const;
	if (row > fromRow) return "left_down" as const;

	return "right_top" as const;
};

/** Lang: pt-BR - Instala somente o próximo intervalo relevante. Lang: en-US - Installs only the next relevant interval. */
const startNextMovement = (world: World, entity: Entity): boolean => {
	const queue = world.movementQueues.get(entity);
	const step = queue?.shift();

	if (!step) {
		world.movementQueues.delete(entity);

		return false;
	}
	if (queue?.length === 0) world.movementQueues.delete(entity);
	const grid = world.gridPositions.get(entity);
	const visual = world.visualPositions.get(entity);
	const animation = world.animations.get(entity);
	if (!grid || !visual || !animation) return false;
	const start = gridToIsometric(step.fromColumn, step.fromRow, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
	const target = gridToIsometric(step.column, step.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
	grid.column = step.fromColumn; grid.row = step.fromRow;
	visual.x = start.x; visual.y = start.y;
	world.movements.set(entity, {
		...step, progress: 0, startX: start.x, startY: start.y,
		targetColumn: step.column, targetRow: step.row, targetX: target.x, targetY: target.y,
	});
	animation.direction = movementDirection(step);
	animation.state = "walk"; animation.frame = 0; delete animation.startedAt;

	return true;
};

/** Lang: pt-BR - Aceita somente sequence nova e ordena por ela. Lang: en-US - Accepts only a new sequence and orders by it. */
export const enqueueMovementStep = (world: World, entity: Entity, step: MovementStep): boolean => {
	const previousSequence = world.movementSequences.get(entity) ?? 0;
	const queued = world.movementQueues.get(entity);
	const inferredStart = step.startedAt ?? queued?.at(-1)?.endsAt ?? world.movements.get(entity)?.endsAt ?? 0;
	const normalized = {
		...step,
		sequence: step.sequence ?? previousSequence + 1,
		startedAt: inferredStart,
		endsAt: step.endsAt ?? inferredStart + LEGACY_TEST_STEP_MS,
	};
	if (normalized.sequence <= previousSequence) return false;
	world.movementSequences.set(entity, normalized.sequence);
	const queue = world.movementQueues.get(entity) ?? [];
	queue.push(normalized); queue.sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
	world.movementQueues.set(entity, queue); world.movingPlayers.add(entity);
	if (!world.movements.has(entity)) startNextMovement(world, entity);

	return true;
};

/**
 * Lang: pt-BR
 * Reconcilia estado parado ou o único passo atual sem permitir que snapshot antigo substitua sequence nova.
 *
 * Lang: en-US
 * Reconciles stopped state or the sole current step without letting an old snapshot replace a newer sequence.
 */
export const reconcileMovement = (world: World, entity: Entity, row: number, column: number, sequence: number, movement: MovementStep | null): boolean => {
	if (sequence < (world.movementSequences.get(entity) ?? 0)) return false;
	world.movementSequences.set(entity, sequence); world.movementQueues.delete(entity); world.movements.delete(entity);
	const grid = world.gridPositions.get(entity); const visual = world.visualPositions.get(entity); const animation = world.animations.get(entity);
	if (!grid || !visual || !animation) return false;
	grid.row = row; grid.column = column;
	if (movement) {
		world.movementQueues.set(entity, [movement]); world.movingPlayers.add(entity); startNextMovement(world, entity);
	} else {
		const position = gridToIsometric(column, row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
		visual.x = position.x; visual.y = position.y; world.movingPlayers.delete(entity);
		if (world.localPlayers.has(entity)) world.selectedTiles.clear();
		animation.state = "idle"; animation.frame = 0;
	}

	return true;
};

/** Lang: pt-BR - Avança apresentação pela hora estimada do servidor. Lang: en-US - Advances presentation using estimated server time. */
export class MovementSystem {
	/** Lang: pt-BR - Consolida expirados e interpola apenas o atual. Lang: en-US - Commits expired intervals and interpolates only the current one. */
	update(world: World, serverTimestamp: number, animationTimestamp = serverTimestamp): void {
		for (const entity of new Set([...world.movingPlayers, ...world.movements.keys()])) {
			let movement = world.movements.get(entity);
			if (movement && movement.startedAt === undefined) movement.startedAt = serverTimestamp;
			if (movement && movement.endsAt === undefined) movement.endsAt = (movement.startedAt ?? serverTimestamp) + LEGACY_TEST_STEP_MS;
			while (movement && serverTimestamp >= (movement.endsAt ?? Number.POSITIVE_INFINITY)) {
				const visual = world.visualPositions.get(entity); const grid = world.gridPositions.get(entity);
				if (visual) { visual.x = movement.targetX; visual.y = movement.targetY; }
				if (grid) { grid.row = movement.targetRow; grid.column = movement.targetColumn; }
				world.movements.delete(entity);
				const finishedFinal = movement.finalStep;
				if (!startNextMovement(world, entity)) {
					if (finishedFinal) {
						world.movingPlayers.delete(entity); if (world.localPlayers.has(entity)) world.selectedTiles.clear();
						const animation = world.animations.get(entity);
						if (animation) { animation.state = "idle"; animation.startedAt = animationTimestamp; animation.frame = 0; }
					}
					movement = undefined; break;
				}
				movement = world.movements.get(entity);
			}
			if (!movement) continue;
			const visual = world.visualPositions.get(entity); if (!visual) continue;
			const startedAt = movement.startedAt ?? serverTimestamp;
			const endsAt = movement.endsAt ?? startedAt + LEGACY_TEST_STEP_MS;
			movement.progress = Math.max(0, Math.min(1, (serverTimestamp - startedAt) / (endsAt - startedAt)));
			visual.x = movement.startX + (movement.targetX - movement.startX) * movement.progress;
			visual.y = movement.startY + (movement.targetY - movement.startY) * movement.progress;
		}
	}
}
