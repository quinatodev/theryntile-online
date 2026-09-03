/**
 * Lang: pt-BR
 * Possui o runtime autoritativo process-local de lobby, channels, presença, jogadores e população.
 * O sid é metadata operacional de sockets; persistência de sessão continua em Session.ts.
 *
 * Lang: en-US
 * Owns the process-local authoritative runtime for lobby, channels, presence, players, and population.
 * sid is operational socket metadata; session persistence remains in Session.ts.
 */
import { database } from "../database/Database.js";
import { closeSocketAfterSend, createInitializationGuard, isValidChannelCapacity } from "./ChannelLifecycle.js";
import { getAuthorizedPath } from "./Navigation.js";
import { getRandomSpawn } from "./Spawn.js";
import { RouteState } from "./RouteState.js";
import { GAME_CONFIG } from "./GameConfig.js";
import { authorizePortalUse, findPortal, getRoamingCandidates, resolvePortalInstanceId, type PortalDestination } from "./Portals.js";

interface ChannelRow {
	id: number;
	name: string;
	capacity: number;
}

interface ChannelSocket {
	readyState: number;
	sessionId?: string;
	close(code?: number, reason?: string): void;
	send(data: string, callback?: (error?: Error) => void): void;
	on(event: "message", listener: (data: unknown) => void): void;
	on(event: "error", listener: (error: Error) => void): void;
	once(event: "close", listener: () => void): void;
}

export interface AuthenticatedPlayer {
	id: number;
	name: string;
}

interface ChannelPlayer extends AuthenticatedPlayer {
	row: number;
	column: number;
	sequence: number;
	movement: AuthoritativeMovementStep | null;
	socket: ChannelSocket;
	mapId: keyof typeof GAME_CONFIG.maps;
	instanceId: string;
}

interface CreatureState { id: string; species: "stag"; row: number; column: number; sequence: number; }
interface MapInstance { id: string; mapId: PortalDestination; creatures: CreatureState[]; timer: ReturnType<typeof setTimeout> | null; }

interface AuthoritativeMovementStep {
	fromRow: number; fromColumn: number; row: number; column: number;
	sequence: number; startedAt: number; endsAt: number; finalStep: boolean;
}

export interface RuntimeChannel extends ChannelRow {
	members: Set<ChannelSocket>;
	players: ChannelPlayer[];
	instances: Map<string, MapInstance>;
}

type RejectionReason = "CHANNEL_NOT_FOUND" | "CHANNEL_FULL" | "ALREADY_IN_CHANNEL" | "INVALID_REQUEST" | "NO_SPAWN_AVAILABLE";

const channels: RuntimeChannel[] = [];

// Lang: pt-BR
// members/players são presença admitida; lobbySockets podem pedir admissão; accountSockets indexa sockets vivos.
// Lang: en-US
// members/players are admitted presence; lobbySockets may request admission; accountSockets indexes live sockets.
const lobbySockets = new Set<ChannelSocket>();
const accountSockets = new Map<number, Set<ChannelSocket>>();
const sessionExpirationTimers = new Map<ChannelSocket, ReturnType<typeof setTimeout>>();
const closingSockets = new WeakSet<ChannelSocket>();
const OPEN_SOCKET_STATE = 1;
const MOVEMENT_STEP_MS = 500;
const CREATURE_STEP_MS = 500;
const CREATURE_PAUSE_MS = 1_500;
const activeRoutes = new RouteState<ChannelSocket>();
const claimInitialization = createInitializationGuard();

/** Lang: pt-BR - Limita o snapshot público aos campos de presença. Lang: en-US - Restricts the public snapshot to presence fields. */
const serializePlayer = ({ id, name, row, column, sequence }: ChannelPlayer) => ({ id, name, row, column, sequence });

/** Lang: pt-BR - Expõe somente estado lógico e passo temporal atual no resync. Lang: en-US - Exposes only logical state and the current temporal step during resync. */
const serializePlayerResync = (player: ChannelPlayer) => ({ ...serializePlayer(player), movement: player.movement });

const sendToInstance = (channel: RuntimeChannel, instanceId: string, message: object, except?: ChannelSocket) => {
	const data = JSON.stringify(message);
	for (const player of channel.players) if (player.instanceId === instanceId && player.socket !== except && player.socket.readyState === OPEN_SOCKET_STATE) player.socket.send(data);
};

const playersInInstance = (channel: RuntimeChannel, instanceId: string) => channel.players.filter((player) => player.instanceId === instanceId);

/** Lang: pt-BR - Projeta o estado público e sua população atual. Lang: en-US - Projects public state and current population. */
const channelState = (channel: RuntimeChannel) => ({
	id: channel.id,
	name: channel.name,
	population: channel.members.size,
	capacity: channel.capacity,
});

/** Lang: pt-BR - Responde a rejeição de admission sem mutar presença. Lang: en-US - Replies to admission rejection without mutating presence. */
const rejectEntry = (socket: ChannelSocket, reason: RejectionReason) => {
	socket.send(JSON.stringify({ type: "ENTER_CHANNEL_REJECTED", reason }));
};

/**
 * Lang: pt-BR
 * Executa admissão autoritativa de forma síncrona para não abrir await-gap entre validação e mutation.
 * Elegibilidade, duplicidade, channel, capacidade e spawn são confirmados antes de alterar presença.
 *
 * Lang: en-US
 * Performs authoritative admission synchronously to avoid an await gap between validation and mutation.
 * Eligibility, duplication, channel, capacity, and spawn are confirmed before changing presence.
 */
const enterChannel = (socket: ChannelSocket, identity: AuthenticatedPlayer, channelId: number) => {
	// Lang: pt-BR
	// OPEN + lobby juntos impedem que um socket revogado ainda fisicamente aberto seja admitido.
	// Lang: en-US
	// OPEN + lobby together prevent a revoked but still physically open socket from being admitted.
	if (socket.readyState !== OPEN_SOCKET_STATE || !lobbySockets.has(socket)) {
		return;
	}

	if (channels.some(({ members, players }) => members.has(socket) || players.some(({ id }) => id === identity.id))) {
		rejectEntry(socket, "ALREADY_IN_CHANNEL");

		return;
	}

	const channel = channels.find(({ id }) => id === channelId);

	if (!channel) {
		rejectEntry(socket, "CHANNEL_NOT_FOUND");

		return;
	}

	if (channel.members.size >= channel.capacity) {
		rejectEntry(socket, "CHANNEL_FULL");

		return;
	}

	const existingPlayers = playersInInstance(channel, "lobby").map(serializePlayer);

	// Lang: pt-BR
	// Spawn é resolvido antes da mutation; tiles livres são preferidos, mas stacking é um fallback válido.
	// Lang: en-US
	// Spawn is resolved before mutation; free tiles are preferred, but stacking is a valid fallback.
	const spawn = getRandomSpawn(channel.players);

	const player: ChannelPlayer = { ...identity, ...spawn, sequence: 0, movement: null, socket, mapId: "lobby", instanceId: "lobby" };

	channel.members.add(socket);
	channel.players.push(player);
	lobbySockets.delete(socket);

	socket.send(JSON.stringify({
		type: "ENTER_CHANNEL_SUCCESS",
		channelId: channel.id,
		player: serializePlayer(player),
		players: existingPlayers,
	}));

	sendToInstance(channel, player.instanceId, { type: "PLAYER_JOINED", player: serializePlayer(player) }, socket);

	broadcastChannelPopulation(channel.id);
};

/**
 * Lang: pt-BR
 * Localiza a presença pelo socket, valida o destino e publica a mutation lógica autoritativa no channel.
 * O client fornece somente a intenção; playerId, origem e resultado são derivados do runtime do server.
 *
 * Lang: en-US
 * Locates presence by socket, validates the destination, and publishes the authoritative logical mutation.
 * The client supplies only intent; playerId, origin, and result are derived from server runtime.
 */
const movePlayer = (socket: ChannelSocket, row: number, column: number) => {
	const channel = channels.find(({ members }) => members.has(socket));
	const player = channel?.players.find((candidate) => candidate.socket === socket);
	if (!channel || !player || activeRoutes.has(socket)) {
		return;
	}
	const path = getAuthorizedPath(player, { row, column }, GAME_CONFIG.maps[player.mapId]);
	if (!path) return;
	const steps = [...path];
	if (!activeRoutes.begin(socket)) return;

	// Lang: pt-BR
	// O server possui a rota e emite um único step autoritativo a cada 500 ms; o lock só termina após o último step visual.
	// Lang: en-US
	// The server owns the route and emits one authoritative step every 500 ms; the lock ends only after the final visual step.
	const emitNextStep = () => {
		if (!activeRoutes.has(socket) || !channel.members.has(socket)) return;
		const step = steps.shift();
		if (!step) return;
		const fromRow = player.row;
		const fromColumn = player.column;
		const startedAt = Date.now();
		const movement: AuthoritativeMovementStep = {
			fromRow, fromColumn, row: step.row, column: step.column,
			sequence: player.sequence + 1, startedAt, endsAt: startedAt + MOVEMENT_STEP_MS,
			finalStep: steps.length === 0,
		};
		player.sequence = movement.sequence;
		player.movement = movement;
		sendToInstance(channel, player.instanceId, {
			type: "PLAYER_MOVED", playerId: player.id, ...movement, serverTime: startedAt,
		});
		const timer = setTimeout(() => {
			if (!activeRoutes.has(socket) || player.movement?.sequence !== movement.sequence) return;
			player.row = movement.row;
			player.column = movement.column;
			player.movement = null;
			if (movement.finalStep) {
				activeRoutes.cancel(socket);
				const portal = findPortal(player.mapId, player.row, player.column);
				if (portal) socket.send(JSON.stringify({ type: "PORTAL_AVAILABLE", portalId: portal.id }));
			}
			else emitNextStep();
		}, MOVEMENT_STEP_MS);
		activeRoutes.setTimer(socket, timer);
	};

	emitNextStep();
};

const scheduleCreature = (channel: RuntimeChannel, instance: MapInstance) => {
	if (instance.timer || playersInInstance(channel, instance.id).length === 0) return;
	instance.timer = setTimeout(() => {
		instance.timer = null;
		const creature = instance.creatures[0];
		if (!creature || playersInInstance(channel, instance.id).length === 0) return;
		const candidates = getRoamingCandidates(creature.row, creature.column, 10, 10);
		const next = candidates[Math.floor(Math.random() * candidates.length)];
		if (next) {
			const startedAt = Date.now();
			const message = { type: "CREATURE_MOVED", creatureId: creature.id, fromRow: creature.row, fromColumn: creature.column, ...next, sequence: ++creature.sequence, startedAt, endsAt: startedAt + CREATURE_STEP_MS, serverTime: startedAt };
			creature.row = next.row; creature.column = next.column;
			sendToInstance(channel, instance.id, message);
		}
		scheduleCreature(channel, instance);
	}, CREATURE_PAUSE_MS);
	instance.timer.unref();
};

const usePortal = (socket: ChannelSocket, portalId: string) => {
	const channel = channels.find(({ members }) => members.has(socket));
	const player = channel?.players.find((candidate) => candidate.socket === socket);
	if (!channel || !player || activeRoutes.has(socket)) return;
	const portal = authorizePortalUse(player.mapId, player.row, player.column, portalId);
	if (!portal) return;
	const previousInstance = player.instanceId;
	const instanceId = resolvePortalInstanceId(portal, player.id);
	let instance = channel.instances.get(instanceId);
	if (!instance) {
		instance = { id: instanceId, mapId: portal.destinationMapId, creatures: [{ id: `stag:${instanceId}`, species: "stag", row: 5, column: 5, sequence: 0 }], timer: null };
		channel.instances.set(instanceId, instance);
	}
	sendToInstance(channel, previousInstance, { type: "PLAYER_LEFT", playerId: player.id }, socket);
	player.mapId = portal.destinationMapId;
	player.instanceId = instanceId;
	player.row = 4; player.column = 4; player.sequence = 0; player.movement = null;
	const peers = playersInInstance(channel, instanceId).filter((candidate) => candidate !== player);
	socket.send(JSON.stringify({ type: "MAP_CHANGED", mapId: instance.mapId, map: GAME_CONFIG.maps[instance.mapId], player: serializePlayer(player), players: peers.map(serializePlayer), creatures: instance.creatures }));
	sendToInstance(channel, instanceId, { type: "PLAYER_JOINED", player: serializePlayer(player) }, socket);
	scheduleCreature(channel, instance);
};

/**
 * Lang: pt-BR
 * Valida estritamente a única intenção client -> server atual antes de encaminhá-la à admissão.
 *
 * Lang: en-US
 * Strictly validates the current client -> server intent before forwarding it to admission.
 */
const handleMessage = (socket: ChannelSocket, identity: AuthenticatedPlayer, data: unknown) => {
	if (!accountSockets.get(identity.id)?.has(socket)) return;

	try {
		const message = JSON.parse(String(data)) as Record<string, unknown>;
		const keys = Object.keys(message);

		if (message.type === "ENTER_CHANNEL") {
			if (
				!Number.isSafeInteger(message.channelId)
				|| Number(message.channelId) <= 0
				|| keys.length !== 2
				|| !keys.includes("channelId")
			) {
				rejectEntry(socket, "INVALID_REQUEST");

				return;
			}

			enterChannel(socket, identity, Number(message.channelId));

			return;
		}

		if (
			message.type === "MOVE"
			&& Number.isSafeInteger(message.row)
			&& Number.isSafeInteger(message.column)
			&& keys.length === 3
			&& keys.includes("row")
			&& keys.includes("column")
		) {
			movePlayer(socket, Number(message.row), Number(message.column));

			return;
		}

		if (message.type === "USE_PORTAL" && typeof message.portalId === "string" && message.portalId.length > 0 && keys.length === 2 && keys.includes("portalId")) {
			usePortal(socket, message.portalId);

			return;
		}

		if (message.type === "RESYNC_PLAYERS" && keys.length === 1) {
			const channel = channels.find(({ members }) => members.has(socket));
			if (!channel) return;
			socket.send(JSON.stringify({
				type: "PLAYERS_RESYNC",
				serverTime: Date.now(),
				players: playersInInstance(channel, channel.players.find((candidate) => candidate.socket === socket)?.instanceId ?? "").map(serializePlayerResync),
			}));
		}
	} catch {
		rejectEntry(socket, "INVALID_REQUEST");
	}
};

/**
 * Lang: pt-BR
 * Centraliza o cleanup idempotente: cancela rota/timer, remove índices e presença, então publica PLAYER_LEFT e população.
 * Replacement, revocation e close físico convergem para este mesmo cleanup.
 *
 * Lang: en-US
 * Centralizes idempotent cleanup: cancels route/timer, removes indexes and presence, then publishes PLAYER_LEFT and population.
 * Replacement, revocation, and physical close converge on this same cleanup.
 */
const handleClose = (socket: ChannelSocket, accountId: number) => {
	const expirationTimer = sessionExpirationTimers.get(socket);
	if (expirationTimer) clearTimeout(expirationTimer);
	sessionExpirationTimers.delete(socket);
	activeRoutes.cancel(socket);
	lobbySockets.delete(socket);
	const sockets = accountSockets.get(accountId);
	sockets?.delete(socket);

	if (sockets?.size === 0) {
		accountSockets.delete(accountId);
	}

	const channel = channels.find(({ members }) => members.delete(socket));

	if (channel) {
		const playerIndex = channel.players.findIndex((player) => player.socket === socket);
		const [player] = playerIndex === -1 ? [] : channel.players.splice(playerIndex, 1);

		if (player) {
			sendToInstance(channel, player.instanceId, { type: "PLAYER_LEFT", playerId: player.id });
			if (playersInInstance(channel, player.instanceId).length === 0) {
				const instance = channel.instances.get(player.instanceId);
				if (instance?.timer) clearTimeout(instance.timer);
				channel.instances.delete(player.instanceId);
			}
		}

		broadcastChannelPopulation(channel.id);
	}
};

/**
 * Lang: pt-BR
 * Executa uma única vez por processo, carrega o catálogo validado e inicializa presença vazia para cada channel.
 * Uma segunda chamada falha antes de substituir qualquer estado process-local.
 *
 * Lang: en-US
 * Runs once per process, loads the validated catalog, and initializes empty presence for each channel.
 * A second call fails before replacing any process-local state.
 */
export async function initializeChannels(): Promise<void> {
	claimInitialization();
	activeRoutes.clear();
	for (const channel of channels) for (const instance of channel.instances.values()) if (instance.timer) clearTimeout(instance.timer);
	const result = await database.query<ChannelRow>(
		"SELECT id, name, capacity FROM game_servers ORDER BY id",
	);
	if (result.rows.some(({ capacity }) => !isValidChannelCapacity(capacity))) {
		throw new Error("Every channel capacity must be a positive safe integer.");
	}

	channels.splice(0, channels.length, ...result.rows.map((channel) => ({
		...channel,
		members: new Set<ChannelSocket>(),
		players: [],
		instances: new Map<string, MapInstance>(),
	})));
}

/**
 * Lang: pt-BR
 * Expõe uma visão readonly do runtime sem transferir ownership de mutation.
 *
 * Lang: en-US
 * Exposes a readonly runtime view without transferring mutation ownership.
 */
export function getRuntimeChannels(): readonly RuntimeChannel[] {
	return channels;
}

/**
 * Lang: pt-BR
 * Registra um WebSocket autenticado no lobby, indexa-o por account e envia o catálogo inicial.
 *
 * Lang: en-US
 * Registers an authenticated WebSocket in the lobby, indexes it by account, and sends the initial catalog.
 */
export function addLobbySocket(socket: ChannelSocket, identity: AuthenticatedPlayer, sessionId: string, expiresAt: Date): void {
	// Lang: pt-BR
	// sid permite targeting de lifecycle; validade persistente permanece responsabilidade de Session.ts.
	// Lang: en-US
	// sid enables lifecycle targeting; persistent validity remains Session.ts responsibility.
	socket.sessionId = sessionId;
	socket.on("message", (data) => handleMessage(socket, identity, data));
	socket.on("error", (error) => console.error("Authenticated WebSocket error.", error));
	socket.once("close", () => handleClose(socket, identity.id));

	const expirationDelay = expiresAt.getTime() - Date.now();
	if (expirationDelay <= 0) {
		closeSocketWithMessage(socket, "SESSION_REVOKED", identity.id);

		return;
	}

	const sockets = accountSockets.get(identity.id) ?? new Set<ChannelSocket>();

	sockets.add(socket);
	accountSockets.set(identity.id, sockets);
	lobbySockets.add(socket);

	socket.send(JSON.stringify({
		type: "CHANNELS_STATE",
		channels: channels.map(channelState),
	}));

	const expirationTimer = setTimeout(() => {
		closeSocketWithMessage(socket, "SESSION_REVOKED", identity.id);
	}, expirationDelay);
	expirationTimer.unref();
	sessionExpirationTimers.set(socket, expirationTimer);
}

/**
 * Lang: pt-BR
 * Retira elegibilidade e presença antes de notificar e fechar; chamadas concorrentes convergem uma única vez.
 *
 * Lang: en-US
 * Removes eligibility and presence before reporting and closing; concurrent calls converge exactly once.
 */
const closeSocketWithMessage = (socket: ChannelSocket, type: "SESSION_REPLACED" | "SESSION_REVOKED", accountId?: number) => {
	if (closingSockets.has(socket)) return;
	closingSockets.add(socket);

	if (accountId !== undefined) handleClose(socket, accountId);
	else {
		for (const [candidateAccountId, sockets] of accountSockets) {
			if (sockets.has(socket)) {
				handleClose(socket, candidateAccountId);

				break;
			}
		}
	}
	const message = JSON.stringify({ type });
	const closeCode = type === "SESSION_REPLACED" ? 4001 : 4002;

	// Lang: pt-BR
	// Remover antes de send faz ENTER_CHANNEL falhar mesmo enquanto o socket continua OPEN.
	// Lang: en-US
	// Removing before send makes ENTER_CHANNEL fail even while the socket remains OPEN.
	if (socket.readyState === OPEN_SOCKET_STATE) {
		closeSocketAfterSend(socket, message, closeCode, type);
	} else {
		socket.close(closeCode, type);
	}
};

/**
 * Lang: pt-BR
 * Envia SESSION_REPLACED somente a sockets cujo sid difere da sessão vencedora.
 *
 * Lang: en-US
 * Sends SESSION_REPLACED only to sockets whose sid differs from the winning session.
 */
export function replaceAccountConnections(accountId: number, currentSessionId: string): void {
	const sockets = accountSockets.get(accountId);

	if (!sockets) {
		return;
	}

	for (const socket of [...sockets]) {
		// Lang: pt-BR
		// Sockets autenticados pelo sid vencedor devem ser preservados.
		// Lang: en-US
		// Sockets authenticated by the winning sid must be preserved.
		if (socket.sessionId !== currentSessionId) {
			closeSocketWithMessage(socket, "SESSION_REPLACED");
		}
	}
}

/**
 * Lang: pt-BR
 * Envia SESSION_REVOKED somente a sockets ligados ao sid explicitamente revogado.
 *
 * Lang: en-US
 * Sends SESSION_REVOKED only to sockets bound to the explicitly revoked sid.
 */
export function revokeSessionConnections(sessionId: string): void {
	for (const sockets of accountSockets.values()) {
		for (const socket of [...sockets]) {
			// Lang: pt-BR
			// O sid exato impede que logout antigo feche sessão mais nova da mesma account.
			// Lang: en-US
			// The exact sid prevents an old logout from closing a newer session for the same account.
			if (socket.sessionId === sessionId) {
				closeSocketWithMessage(socket, "SESSION_REVOKED");
			}
		}
	}
}

/**
 * Lang: pt-BR
 * Publica a população autoritativa atual para sockets que permanecem no lobby.
 *
 * Lang: en-US
 * Publishes current authoritative population to sockets that remain in the lobby.
 */
export function broadcastChannelPopulation(channelId: number): void {
	const channel = channels.find(({ id }) => id === channelId);

	if (!channel) {
		return;
	}

	const message = JSON.stringify({
		type: "CHANNEL_POPULATION",
		channelId: channel.id,
		population: channel.members.size,
	});

	for (const socket of lobbySockets) {
		if (socket.readyState === OPEN_SOCKET_STATE) {
			socket.send(message);
		}
	}
}
