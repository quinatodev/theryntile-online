/**
 * Lang: pt-BR
 * Possui o transporte WebSocket client-side, seu lifecycle e o dispatch de mensagens validadas.
 * Transporta estado autoritativo, mas não decide nenhuma regra de gameplay.
 *
 * Lang: en-US
 * Owns client-side WebSocket transport, its lifecycle, and validated message dispatch.
 * It transports authoritative state but does not decide any gameplay rule.
 */
import {
	isMoveMessage,
	parseRealtimeMessage,
	type ChannelState,
	type EnterChannelMessage,
	type EnterChannelRejectionReason,
	type EnterChannelSuccessMessage,
	type MoveMessage,
	type PlayerMovedMessage,
	type PlayersResyncMessage,
	type PlayerState,
} from "./Protocol.js";

const RECONNECT_DELAY_MS = 2_000;

interface RealtimeCallbacks {
	onChannelsState(channels: ChannelState[]): void;
	onChannelPopulation(channelId: number, population: number): void;
	onDisconnected(): void;
	onEnterChannelRejected(reason: EnterChannelRejectionReason): void;
	onEnterChannelSuccess(message: EnterChannelSuccessMessage): void;
	onPlayerJoined(player: PlayerState): void;
	onPlayerLeft(playerId: number): void;
	onPlayerMoved(message: PlayerMovedMessage): void;
	onPlayersResync?(message: PlayersResyncMessage): void;
	onSessionReplaced(): void;
	onSessionRevoked(): void;
	onUnauthenticated(): void;
}

export interface Realtime {
	connect(): void;
	close(): void;
	enterChannel(channelId: number): boolean;
	move(row: number, column: number): boolean;
	requestPlayersResync(): boolean;
}

/**
 * Lang: pt-BR
 * Cria um owner de transporte com no máximo um socket atual e reconexão controlada no lobby.
 *
 * Lang: en-US
 * Creates a transport owner with at most one current socket and controlled lobby reconnection.
 */
export function createRealtime(callbacks: RealtimeCallbacks): Realtime {
	let socket: WebSocket | null = null;
	let reconnectTimer: number | null = null;
	let enabled = false;

	// Lang: pt-BR
	// Após admissão, disconnect exige encerramento do Game; reconexão transparente só é segura no lobby.
	// Lang: en-US
	// After admission, disconnect requires ending the Game; transparent reconnection is only safe in the lobby.
	let enteredChannel = false;

	// Lang: pt-BR
	// Invalida trabalho assíncrono de reconnect pertencente a um lifecycle connect/close anterior.
	// Lang: en-US
	// Invalidates asynchronous reconnect work belonging to an earlier connect/close lifecycle.
	let connectionGeneration = 0;

	/**
	 * Lang: pt-BR
	 * Abre o socket da sessão autenticada atual sem permitir conexões OPEN/CONNECTING duplicadas.
	 * Mensagens só são despachadas enquanto nextSocket continuar sendo o socket possuído pela instância.
	 *
	 * Lang: en-US
	 * Opens the current authenticated session socket without allowing duplicate OPEN/CONNECTING connections.
	 * Messages are dispatched only while nextSocket remains the socket owned by this instance.
	 */
	const openSocket = () => {
		if (!enabled || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
			return;
		}

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const nextSocket = new WebSocket(`${protocol}//${window.location.host}/ws`);
		socket = nextSocket;

		nextSocket.addEventListener("message", (event) => {
			// Lang: pt-BR
			// Um socket substituído ainda pode entregar eventos enfileirados depois que outro se torna atual.
			// Lang: en-US
			// A replaced socket may still deliver queued events after a newer socket becomes current.
			if (socket !== nextSocket || typeof event.data !== "string") {
				return;
			}

			const message = parseRealtimeMessage(event.data);

			if (message?.type === "CHANNELS_STATE") {
				callbacks.onChannelsState(message.channels);
			} else if (message?.type === "CHANNEL_POPULATION") {
				callbacks.onChannelPopulation(message.channelId, message.population);
			} else if (message?.type === "ENTER_CHANNEL_SUCCESS") {
				enteredChannel = true;
				callbacks.onEnterChannelSuccess(message);
			} else if (message?.type === "ENTER_CHANNEL_REJECTED") {
				callbacks.onEnterChannelRejected(message.reason);
			} else if (message?.type === "PLAYER_JOINED") {
				callbacks.onPlayerJoined(message.player);
			} else if (message?.type === "PLAYER_LEFT") {
				callbacks.onPlayerLeft(message.playerId);
			} else if (message?.type === "PLAYER_MOVED") {
				callbacks.onPlayerMoved(message);
			} else if (message?.type === "PLAYERS_RESYNC") {
				callbacks.onPlayersResync?.(message);
			} else if (message?.type === "SESSION_REPLACED") {
				callbacks.onSessionReplaced();
			} else if (message?.type === "SESSION_REVOKED") {
				callbacks.onSessionRevoked();
			}
		});

		nextSocket.addEventListener("close", () => {
			if (socket !== nextSocket) {
				return;
			}

			socket = null;
			callbacks.onDisconnected();

			// Lang: pt-BR
			// Conexões de lobby podem se recuperar; um Game admitido exige que seu owner trate o disconnect.
			// Lang: en-US
			// Lobby connections may recover; an admitted Game requires its owner to handle disconnect.
			if (!enteredChannel) {
				scheduleReconnect();
			}
		});

		nextSocket.addEventListener("error", (error) => {
			if (socket === nextSocket) {
				console.error("Realtime WebSocket error.", error);
			}
		});
	};

	/**
	 * Lang: pt-BR
	 * Agenda uma única tentativa e confirma /auth/session antes de reabrir o transporte.
	 * Respostas tardias são descartadas pela geração para não ressuscitar um lifecycle encerrado.
	 *
	 * Lang: en-US
	 * Schedules one attempt and confirms /auth/session before reopening transport.
	 * Late responses are discarded by generation so they cannot revive a closed lifecycle.
	 */
	const scheduleReconnect = () => {
		if (!enabled || reconnectTimer !== null) {
			return;
		}

		reconnectTimer = window.setTimeout(async () => {
			reconnectTimer = null;
			const generation = connectionGeneration;

			try {
				const response = await fetch("/auth/session");

				// Lang: pt-BR
				// Uma resposta tardia não pode reabrir o transporte após close explícito ou um connect mais novo.
				// Lang: en-US
				// A late response cannot reopen transport after explicit close or a newer connect lifecycle.
				if (!enabled || generation !== connectionGeneration) {
					return;
				}

				if (response.status === 401) {
					enabled = false;
					callbacks.onUnauthenticated();

					return;
				}

				if (response.ok) {
					openSocket();

					return;
				}
			} catch {
				// Lang: pt-BR
				// Falha transitória não revoga a sessão HTTP; uma nova tentativa controlada permanece permitida.
				// Lang: en-US
				// A transient failure does not revoke the HTTP session; another controlled attempt remains allowed.
			}

			if (enabled && generation === connectionGeneration) {
				scheduleReconnect();
			}
		}, RECONNECT_DELAY_MS);
	};

	/**
	 * Lang: pt-BR
	 * Inicia explicitamente um novo lifecycle de conexão para a sessão atual.
	 *
	 * Lang: en-US
	 * Explicitly starts a new connection lifecycle for the current session.
	 */
	const connect = () => {
		if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
			return;
		}

		enabled = true;
		connectionGeneration += 1;

		openSocket();
	};

	/**
	 * Lang: pt-BR
	 * Encerra o socket atual, cancela timers e invalida fetches de reconnect já iniciados.
	 *
	 * Lang: en-US
	 * Closes the current socket, cancels timers, and invalidates reconnect fetches already in flight.
	 */
	const close = () => {
		enabled = false;
		enteredChannel = false;

		// Lang: pt-BR
		// Incrementar antes do close torna timers e continuações de fetch obsoletos imediatamente.
		// Lang: en-US
		// Incrementing before close makes timers and fetch continuations obsolete immediately.
		connectionGeneration += 1;

		if (reconnectTimer !== null) {
			window.clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}

		const activeSocket = socket;
		socket = null;

		activeSocket?.close();
	};

	/**
	 * Lang: pt-BR
	 * Envia apenas a intenção de entrar em um channel; o server decide admissão, spawn e membership.
	 *
	 * Lang: en-US
	 * Sends only the intent to enter a channel; the server decides admission, spawn, and membership.
	 */
	const enterChannel = (channelId: number) => {
		if (enteredChannel || socket?.readyState !== WebSocket.OPEN) {
			return false;
		}

		const message: EnterChannelMessage = { type: "ENTER_CHANNEL", channelId };
		socket.send(JSON.stringify(message));

		return true;
	};

	/**
	 * Lang: pt-BR
	 * Envia uma intenção de destino lógico somente após admissão; posição final continua autoritativa no server.
	 *
	 * Lang: en-US
	 * Sends a logical-destination intent only after admission; final position remains authoritative on the server.
	 */
	const move = (row: number, column: number) => {
		if (!enteredChannel || socket?.readyState !== WebSocket.OPEN) {
			return false;
		}

		const message: MoveMessage = { type: "MOVE", row, column };
		if (!isMoveMessage(message)) {
			return false;
		}

		socket.send(JSON.stringify(message));

		return true;
	};

	/** Lang: pt-BR - Solicita uma reconciliação pontual pelo socket admitido. Lang: en-US - Requests one admitted-socket reconciliation. */
	const requestPlayersResync = () => {
		if (!enteredChannel || socket?.readyState !== WebSocket.OPEN) return false;
		socket.send(JSON.stringify({ type: "RESYNC_PLAYERS" }));

		return true;
	};

	return { connect, close, enterChannel, move, requestPlayersResync };
}
