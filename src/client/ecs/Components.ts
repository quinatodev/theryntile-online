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
	fromColumn: number;
	fromRow: number;
	progress: number;
	startedAt?: number;
	startX: number;
	startY: number;
	targetColumn: number;
	targetRow: number;
	targetX: number;
	targetY: number;
}

export interface MoveTargetComponent extends GridPosition {
	awaitingStep: boolean;
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
}
