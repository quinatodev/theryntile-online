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
import { getRandomSpawn } from "./Spawn.js";

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
	socket: ChannelSocket;
}

export interface RuntimeChannel extends ChannelRow {
	members: Set<ChannelSocket>;
	players: ChannelPlayer[];
}

type RejectionReason = "CHANNEL_NOT_FOUND" | "CHANNEL_FULL" | "ALREADY_IN_CHANNEL" | "INVALID_REQUEST" | "NO_SPAWN_AVAILABLE";

const channels: RuntimeChannel[] = [];

// Lang: pt-BR
// members/players são presença admitida; lobbySockets podem pedir admissão; accountSockets indexa sockets vivos.
// Lang: en-US
// members/players are admitted presence; lobbySockets may request admission; accountSockets indexes live sockets.
const lobbySockets = new Set<ChannelSocket>();
const accountSockets = new Map<number, Set<ChannelSocket>>();
const OPEN_SOCKET_STATE = 1;

const serializePlayer = ({ id, name, row, column }: ChannelPlayer) => ({ id, name, row, column });

/**
 * Lang: pt-BR
 * Envia uma mensagem aos members OPEN, com exclusão opcional do originador.
 *
 * Lang: en-US
 * Sends a message to OPEN members, optionally excluding its originator.
 */
const sendToChannel = (channel: RuntimeChannel, message: object, except?: ChannelSocket) => {
	const data = JSON.stringify(message);

	for (const member of channel.members) {
		if (member !== except && member.readyState === OPEN_SOCKET_STATE) {
			member.send(data);
		}
	}
};

const channelState = (channel: RuntimeChannel) => ({
	id: channel.id,
	name: channel.name,
	population: channel.members.size,
	capacity: channel.capacity,
});

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

	const existingPlayers = channel.players.map(serializePlayer);

	// Lang: pt-BR
	// Spawn é resolvido antes da mutation para impedir admissão parcial quando não existe posição livre.
	// Lang: en-US
	// Spawn is resolved before mutation to prevent partial admission when no position is available.
	const spawn = getRandomSpawn(channel.players);
	if (!spawn) {
		rejectEntry(socket, "NO_SPAWN_AVAILABLE");

		return;
	}

	const player: ChannelPlayer = { ...identity, ...spawn, socket };

	channel.members.add(socket);
	channel.players.push(player);
	lobbySockets.delete(socket);

	socket.send(JSON.stringify({
		type: "ENTER_CHANNEL_SUCCESS",
		channelId: channel.id,
		player: serializePlayer(player),
		players: existingPlayers,
	}));

	sendToChannel(channel, { type: "PLAYER_JOINED", player: serializePlayer(player) }, socket);

	broadcastChannelPopulation(channel.id);
};

/**
 * Lang: pt-BR
 * Valida estritamente a única intenção client -> server atual antes de encaminhá-la à admissão.
 *
 * Lang: en-US
 * Strictly validates the current client -> server intent before forwarding it to admission.
 */
const handleMessage = (socket: ChannelSocket, identity: AuthenticatedPlayer, data: unknown) => {
	try {
		const message = JSON.parse(String(data)) as Record<string, unknown>;
		const keys = Object.keys(message);

		if (
			message.type !== "ENTER_CHANNEL"
			|| !Number.isSafeInteger(message.channelId)
			|| Number(message.channelId) <= 0
			|| keys.length !== 2
			|| !keys.includes("type")
			|| !keys.includes("channelId")
		) {
			rejectEntry(socket, "INVALID_REQUEST");

			return;
		}

		enterChannel(socket, identity, Number(message.channelId));
	} catch {
		rejectEntry(socket, "INVALID_REQUEST");
	}
};

/**
 * Lang: pt-BR
 * Centraliza o cleanup final: remove índices e presença, então publica PLAYER_LEFT e população.
 * Replacement/revocation deixam este handler como único owner do cleanup completo.
 *
 * Lang: en-US
 * Centralizes final cleanup: removes indexes and presence, then publishes PLAYER_LEFT and population.
 * Replacement/revocation leave this handler as the sole owner of complete cleanup.
 */
const handleClose = (socket: ChannelSocket, accountId: number) => {
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
			sendToChannel(channel, { type: "PLAYER_LEFT", playerId: player.id });
		}

		broadcastChannelPopulation(channel.id);
	}
};

/**
 * Lang: pt-BR
 * Carrega o catálogo persistido e inicializa presença vazia para cada channel no runtime.
 *
 * Lang: en-US
 * Loads the persisted catalog and initializes empty presence for each runtime channel.
 */
export async function initializeChannels(): Promise<void> {
	const result = await database.query<ChannelRow>(
		"SELECT id, name, capacity FROM game_servers ORDER BY id",
	);

	channels.splice(0, channels.length, ...result.rows.map((channel) => ({
		...channel,
		members: new Set<ChannelSocket>(),
		players: [],
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
export function addLobbySocket(socket: ChannelSocket, identity: AuthenticatedPlayer, sessionId: string): void {
	// Lang: pt-BR
	// sid permite targeting de lifecycle; validade persistente permanece responsabilidade de Session.ts.
	// Lang: en-US
	// sid enables lifecycle targeting; persistent validity remains Session.ts responsibility.
	socket.sessionId = sessionId;

	const sockets = accountSockets.get(identity.id) ?? new Set<ChannelSocket>();

	sockets.add(socket);
	accountSockets.set(identity.id, sockets);
	lobbySockets.add(socket);

	socket.send(JSON.stringify({
		type: "CHANNELS_STATE",
		channels: channels.map(channelState),
	}));

	socket.on("message", (data) => handleMessage(socket, identity, data));

	socket.on("error", (error) => console.error("Authenticated WebSocket error.", error));

	socket.once("close", () => handleClose(socket, identity.id));
}

/**
 * Lang: pt-BR
 * Retira elegibilidade, notifica o motivo e inicia o close; handleClose preserva o cleanup final único.
 *
 * Lang: en-US
 * Removes eligibility, reports the reason, and starts close; handleClose preserves single final cleanup.
 */
const closeSocketWithMessage = (socket: ChannelSocket, type: "SESSION_REPLACED" | "SESSION_REVOKED") => {
	const message = JSON.stringify({ type });
	const closeCode = type === "SESSION_REPLACED" ? 4001 : 4002;

	// Lang: pt-BR
	// Remover antes de send faz ENTER_CHANNEL falhar mesmo enquanto o socket continua OPEN.
	// Lang: en-US
	// Removing before send makes ENTER_CHANNEL fail even while the socket remains OPEN.
	lobbySockets.delete(socket);

	if (socket.readyState === OPEN_SOCKET_STATE) {
		try {
			socket.send(message, () => socket.close(closeCode, type));
		} catch {
			socket.close(closeCode, type);
		}
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
