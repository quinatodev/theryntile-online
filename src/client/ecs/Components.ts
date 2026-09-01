/** Identity used only to associate component data inside the client World. */
export type Entity = number;

export interface GridPosition {
	column: number;
	row: number;
}

export interface VisualPosition {
	x: number;
	y: number;
}

export interface PlayerComponent {
	id: number;
	name: string;
}

export interface TileComponent {
	textureId: number;
}

export interface SpriteComponent {
	feetOffsetY: number;
	frameHeight: number;
	frameWidth: number;
	offsetX: number;
	offsetY: number;
}

export interface RenderableComponent {
	layer: number;
	order: number;
}

export type AnimationDirection = "left_down" | "left_top" | "right_down" | "right_top";

export interface AnimationComponent {
	direction: AnimationDirection;
	frame: number;
	startedAt?: number;
	state: "idle" | "walk";
}

export interface MovementComponent {
	/**
	 * Lang: pt-BR
	 * Marca o último step autoritativo para liberar o lock e retornar a Idle somente após sua interpolação.
	 *
	 * Lang: en-US
	 * Marks the final authoritative step so the lock is released and Idle resumes only after its interpolation.
	 */
	finalStep: boolean;
	endsAt?: number;
	fromColumn: number;
	fromRow: number;
	progress: number;
	sequence?: number;
	startedAt?: number;
	startX: number;
	startY: number;
	targetColumn: number;
	targetRow: number;
	targetX: number;
	targetY: number;
}

/**
 * Lang: pt-BR
 * Representa um único step autoritativo recebido e ainda não necessariamente iniciado pelo playback visual.
 *
 * Lang: en-US
 * Represents one received authoritative step that visual playback has not necessarily started yet.
 */
export interface MovementStep {
	column: number;
	endsAt?: number;
	finalStep: boolean;
	fromColumn: number;
	fromRow: number;
	row: number;
	sequence?: number;
	startedAt?: number;
}

export interface PointerPosition {
	canvasX: number;
	canvasY: number;
	inside: boolean;
}

export interface PlayerSnapshot {
	column: number;
	id: number;
	name: string;
	row: number;
	sequence?: number;
}
