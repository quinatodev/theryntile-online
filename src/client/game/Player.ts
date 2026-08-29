/**
 * Lang: pt-BR
 * Representa no client um jogador autoritativo recebido do server.
 * Não possui socket nem decide id, row ou column.
 *
 * Lang: en-US
 * Represents an authoritative server-provided player on the client.
 * It owns no socket and does not decide id, row, or column.
 */
export interface Player {
	id: number;
	name: string;
	row: number;
	column: number;
}

export type PlayerDirection = "left_down" | "left_top" | "right_down" | "right_top";

export interface PlayerMovement {
	fromRow: number;
	fromColumn: number;
	row: number;
	column: number;
	startX: number;
	startY: number;
	targetX: number;
	targetY: number;
	progress: number;
	startedAt?: number;
}

/**
 * Lang: pt-BR
 * Estende o mirror autoritativo com estado exclusivamente visual para interpolação e sprites.
 *
 * Lang: en-US
 * Extends the authoritative mirror with exclusively visual state for interpolation and sprites.
 */
export interface VisualPlayer extends Player {
	visualX: number;
	visualY: number;
	direction: PlayerDirection;
	animation: "idle" | "walk";
	animationStartedAt?: number;
	frame: number;
	movement?: PlayerMovement;
}
