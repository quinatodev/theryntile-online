/**
 * Lang: pt-BR
 * Define o contrato client-side das mensagens WebSocket e valida dados recebidos em runtime.
 * Tipos TypeScript não tornam payloads de rede confiáveis, portanto toda mensagem do server passa pelo parser.
 *
 * Lang: en-US
 * Defines the client-side WebSocket message contract and validates data received at runtime.
 * TypeScript types do not make network payloads trustworthy, so every server message goes through the parser.
 */

export interface ChannelState {
	id: number;
	name: string;
	population: number;
	capacity: number;
}

export interface ChannelsStateMessage {
	type: "CHANNELS_STATE";
	channels: ChannelState[];
}

export interface ChannelPopulationMessage {
	type: "CHANNEL_POPULATION";
	channelId: number;
	population: number;
}

export interface EnterChannelMessage {
	type: "ENTER_CHANNEL";
	channelId: number;
}

export interface MoveMessage {
	type: "MOVE";
	row: number;
	column: number;
}

export interface UsePortalMessage { type: "USE_PORTAL"; portalId: string; }
export interface PortalAvailableMessage { type: "PORTAL_AVAILABLE"; portalId: string; }
export interface CreatureState { id: string; species: "stag"; row: number; column: number; sequence: number; }
export interface CreatureMovedMessage { type: "CREATURE_MOVED"; creatureId: string; fromRow: number; fromColumn: number; row: number; column: number; sequence: number; startedAt: number; endsAt: number; serverTime: number; }
export interface MapChangedMessage { type: "MAP_CHANGED"; mapId: string; map: Record<string, unknown>; player: PlayerState; players: PlayerState[]; creatures: CreatureState[]; }

export interface PlayerState {
	id: number;
	name: string;
	row: number;
	column: number;
	sequence: number;
}

export interface PlayerMovementState {
	fromRow: number; fromColumn: number; row: number; column: number;
	sequence: number; startedAt: number; endsAt: number; finalStep: boolean;
}

export interface PlayerResyncState extends PlayerState { movement: PlayerMovementState | null; }

export interface PlayersResyncMessage {
	type: "PLAYERS_RESYNC";
	serverTime: number;
	players: PlayerResyncState[];
}

export interface EnterChannelSuccessMessage {
	type: "ENTER_CHANNEL_SUCCESS";
	channelId: number;
	player: PlayerState;
	players: PlayerState[];
}

export interface PlayerJoinedMessage { type: "PLAYER_JOINED"; player: PlayerState; }

export interface PlayerLeftMessage { type: "PLAYER_LEFT"; playerId: number; }

export interface PlayerMovedMessage {
	type: "PLAYER_MOVED";
	playerId: number;
	fromRow: number;
	fromColumn: number;
	row: number;
	column: number;
	sequence: number;
	startedAt: number;
	endsAt: number;
	serverTime: number;
	/**
	 * Lang: pt-BR
	 * Informa se este é o último step da rota autoritativa para o client liberar lock somente após interpolá-lo.
	 *
	 * Lang: en-US
	 * Reports whether this is the final authoritative-route step so the client releases its lock only after interpolation.
	 */
	finalStep: boolean;
}

export interface SessionReplacedMessage { type: "SESSION_REPLACED"; }

export interface SessionRevokedMessage { type: "SESSION_REVOKED"; }

export type EnterChannelRejectionReason = "CHANNEL_NOT_FOUND" | "CHANNEL_FULL" | "ALREADY_IN_CHANNEL" | "INVALID_REQUEST" | "NO_SPAWN_AVAILABLE";

export interface EnterChannelRejectedMessage {
	type: "ENTER_CHANNEL_REJECTED";
	reason: EnterChannelRejectionReason;
}

export type RealtimeMessage = ChannelsStateMessage
	| ChannelPopulationMessage
	| EnterChannelSuccessMessage
	| EnterChannelRejectedMessage
	| PlayerJoinedMessage
	| PlayerLeftMessage
	| PlayerMovedMessage
	| PlayersResyncMessage
	| PortalAvailableMessage | CreatureMovedMessage | MapChangedMessage
	| SessionReplacedMessage
	| SessionRevokedMessage;

const rejectionReasons: EnterChannelRejectionReason[] = [
	"CHANNEL_NOT_FOUND",
	"CHANNEL_FULL",
	"ALREADY_IN_CHANNEL",
	"INVALID_REQUEST",
	"NO_SPAWN_AVAILABLE",
];

/** Lang: pt-BR - Valida identidade inteira positiva. Lang: en-US - Validates a positive integer identity. */
const isPositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

/** Lang: pt-BR - Valida contador inteiro não negativo. Lang: en-US - Validates a non-negative integer counter. */
const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

/** Lang: pt-BR - Valida índice de row do grid. Lang: en-US - Validates a grid row index. */
const isGridRow = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

/** Lang: pt-BR - Valida índice de column do grid. Lang: en-US - Validates a grid column index. */
const isGridColumn = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

/**
 * Lang: pt-BR
 * Valida a forma client -> server de MOVE antes do transporte; o server repete validação e autoridade.
 *
 * Lang: en-US
 * Validates the client -> server MOVE shape before transport; the server repeats validation and authority.
 */
export function isMoveMessage(value: unknown): value is MoveMessage {
	if (!value || typeof value !== "object") {
		return false;
	}

	const message = value as Record<string, unknown>;
	const keys = Object.keys(message);

	return message.type === "MOVE"
		&& isGridRow(message.row)
		&& isGridColumn(message.column)
		&& keys.length === 3
		&& keys.includes("type")
		&& keys.includes("row")
		&& keys.includes("column");
}

/**
 * Lang: pt-BR
 * Valida o catálogo de um canal, incluindo inteiros e a invariante population <= capacity.
 *
 * Lang: en-US
 * Validates a channel catalog entry, including integers and the population <= capacity invariant.
 */
const isChannelState = (value: unknown): value is ChannelState => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const channel = value as Record<string, unknown>;

	return isPositiveInteger(channel.id)
		&& typeof channel.name === "string"
		&& isNonNegativeInteger(channel.population)
		&& isNonNegativeInteger(channel.capacity)
		&& channel.population <= channel.capacity;
};

/**
 * Lang: pt-BR
 * Valida a representação de jogador recebida do server antes que ela alcance o runtime visual.
 *
 * Lang: en-US
 * Validates the player representation received from the server before it reaches the visual runtime.
 */
const isPlayerState = (value: unknown): value is PlayerState => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const player = value as Record<string, unknown>;

	return isPositiveInteger(player.id)
		&& typeof player.name === "string"
		&& isGridRow(player.row)
		&& isGridColumn(player.column)
		&& isNonNegativeInteger(player.sequence);
};

/** Lang: pt-BR - Valida um passo temporal adjacente e causal. Lang: en-US - Validates an adjacent, causal temporal step. */
const isPlayerMovementState = (value: unknown): value is PlayerMovementState => {
	if (!value || typeof value !== "object") return false;
	const movement = value as Record<string, unknown>;

	return isGridRow(movement.fromRow) && isGridColumn(movement.fromColumn)
		&& isGridRow(movement.row) && isGridColumn(movement.column)
		&& isPositiveInteger(movement.sequence)
		&& isNonNegativeInteger(movement.startedAt) && isNonNegativeInteger(movement.endsAt)
		&& movement.startedAt < movement.endsAt
		&& typeof movement.finalStep === "boolean"
		&& Math.abs(movement.row - movement.fromRow) + Math.abs(movement.column - movement.fromColumn) === 1;
};

/** Lang: pt-BR - Valida o estado mínimo de reconciliação de um Player. Lang: en-US - Validates a Player's minimal reconciliation state. */
const isPlayerResyncState = (value: unknown): value is PlayerResyncState => {
	if (!isPlayerState(value)) return false;
	const player = value as unknown as Record<string, unknown>;

	return player.movement === null || (isPlayerMovementState(player.movement)
		&& (player.movement as PlayerMovementState).sequence === player.sequence);
};

/**
 * Lang: pt-BR
 * Converte uma mensagem server -> client em uma união tipada ou retorna null quando o payload viola o protocolo.
 *
 * Lang: en-US
 * Converts a server -> client message into a typed union or returns null when the payload violates the protocol.
 */
export function parseRealtimeMessage(data: string): RealtimeMessage | null {
	try {
		const message = JSON.parse(data) as Record<string, unknown>;

		if (message.type === "CHANNELS_STATE" && Array.isArray(message.channels) && message.channels.every(isChannelState)) {
			return { type: "CHANNELS_STATE", channels: message.channels };
		}

		if (message.type === "CHANNEL_POPULATION" && isPositiveInteger(message.channelId) && isNonNegativeInteger(message.population)) {
			return {
				type: "CHANNEL_POPULATION",
				channelId: message.channelId,
				population: message.population,
			};
		}

		if (message.type === "ENTER_CHANNEL_SUCCESS" && isPositiveInteger(message.channelId) && isPlayerState(message.player) && Array.isArray(message.players) && message.players.every(isPlayerState)) {
			return { type: "ENTER_CHANNEL_SUCCESS", channelId: message.channelId, player: message.player, players: message.players };
		}

		if (message.type === "PLAYER_JOINED" && isPlayerState(message.player)) {
			return { type: "PLAYER_JOINED", player: message.player };
		}

		if (message.type === "PORTAL_AVAILABLE" && typeof message.portalId === "string" && message.portalId.length > 0) return { type: "PORTAL_AVAILABLE", portalId: message.portalId };
		if (message.type === "CREATURE_MOVED" && typeof message.creatureId === "string" && isPlayerMovementState({ ...message, finalStep: true }) && isNonNegativeInteger(message.serverTime)) return message as unknown as CreatureMovedMessage;
		if (message.type === "MAP_CHANGED" && typeof message.mapId === "string" && message.map && typeof message.map === "object" && isPlayerState(message.player) && Array.isArray(message.players) && message.players.every(isPlayerState) && Array.isArray(message.creatures) && message.creatures.every((creature) => {
			if (!creature || typeof creature !== "object") return false;
			const value = creature as Record<string, unknown>;

			return typeof value.id === "string" && value.species === "stag" && isGridRow(value.row) && isGridColumn(value.column) && isNonNegativeInteger(value.sequence);
		})) return message as unknown as MapChangedMessage;

		if (message.type === "PLAYER_LEFT" && Number.isSafeInteger(message.playerId) && Number(message.playerId) > 0) {
			return { type: "PLAYER_LEFT", playerId: Number(message.playerId) };
		}

		if (
			message.type === "PLAYER_MOVED"
			&& isPositiveInteger(message.playerId)
			&& isPlayerMovementState(message)
			&& isNonNegativeInteger(message.serverTime)
		) {
			return {
				type: "PLAYER_MOVED",
				playerId: message.playerId,
				fromRow: message.fromRow,
				fromColumn: message.fromColumn,
				row: message.row,
				column: message.column,
				sequence: message.sequence,
				startedAt: message.startedAt,
				endsAt: message.endsAt,
				serverTime: message.serverTime,
				finalStep: message.finalStep,
			};
		}

		if (message.type === "PLAYERS_RESYNC" && isNonNegativeInteger(message.serverTime)
			&& Array.isArray(message.players) && message.players.every(isPlayerResyncState)) {
			return { type: "PLAYERS_RESYNC", serverTime: message.serverTime, players: message.players };
		}

		if (message.type === "SESSION_REPLACED") {
			return { type: "SESSION_REPLACED" };
		}

		if (message.type === "SESSION_REVOKED") {
			return { type: "SESSION_REVOKED" };
		}

		if (
			message.type === "ENTER_CHANNEL_REJECTED"
			&& typeof message.reason === "string"
			&& rejectionReasons.includes(message.reason as EnterChannelRejectionReason)
		) {
			return {
				type: "ENTER_CHANNEL_REJECTED",
				reason: message.reason as EnterChannelRejectionReason,
			};
		}
	} catch {
		return null;
	}

	return null;
}
