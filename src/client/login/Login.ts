/**
 * Lang: pt-BR
 * Composition/lifecycle root do client: coordena DOM, autenticação, lobby, Loading e ativação do Game.
 * Realtime possui o transporte, Game possui o runtime visual e o server mantém autoridade de gameplay.
 *
 * Lang: en-US
 * Client composition/lifecycle root: coordinates DOM, authentication, lobby, Loading, and Game activation.
 * Realtime owns transport, Game owns the visual runtime, and the server retains gameplay authority.
 */
import { type ChannelState, type EnterChannelRejectionReason, type PlayerMovedMessage, type PlayerState } from "../realtime/Protocol.js";
import { startGame, type Game } from "../game/Game.js";
import { createRealtime } from "../realtime/Realtime.js";
import { parseGameBootstrapConfig } from "../game/MapConfig.js";
import { UIManager } from "../ui/UIManager.js";
import { type InventoryPosition } from "../ui/inventory/Backpack.js";

interface LoginResponse {
	player: { id: number; name: string };
	servers: Array<{ id: number; name: string }>;
}

const CONNECTION_LOST_MESSAGE = "A conexão com o servidor foi perdida.";
const GAME_START_FAILED_MESSAGE = "Não foi possível iniciar o jogo. Tente novamente.";
const INVALID_CREDENTIALS_MESSAGE = "Usuário ou senha inválidos.";
const LOGOUT_FAILED_MESSAGE = "Não foi possível encerrar sua sessão. Tente novamente.";
const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Entre novamente.";
const SESSION_REPLACED_MESSAGE = "Sua conta foi conectada em outro local.";
const SESSION_REVOKED_MESSAGE = "Sua sessão foi encerrada.";

const root = document.querySelector<HTMLElement>("#game-entry");
const loginSection = root?.querySelector<HTMLElement>("[data-view='login']");
const authenticatedSection = root?.querySelector<HTMLElement>("[data-view='authenticated']");
const form = root?.querySelector<HTMLFormElement>("[data-role='login-form']");
const errorMessage = root?.querySelector<HTMLElement>("[data-role='login-error']");
const playerName = root?.querySelector<HTMLElement>("[data-value='player-name']");
const serverList = root?.querySelector<HTMLElement>("[data-role='server-list']");
const submitButton = form?.querySelector<HTMLButtonElement>("button[type='submit']");
const playButton = root?.querySelector<HTMLButtonElement>("[data-action='play']");
const logoutLink = root?.querySelector<HTMLAnchorElement>("[data-action='logout']");
const loadingSection = root?.querySelector<HTMLElement>("[data-view='loading']");
const loadingMessage = root?.querySelector<HTMLElement>("[data-role='loading-message']");
const gameSection = root?.querySelector<HTMLElement>("[data-view='game']");
const gameCanvas = root?.querySelector<HTMLCanvasElement>("[data-role='game-canvas']");
const gameUi = root?.querySelector<HTMLElement>("[data-role='game-ui']");

if (!root || !loginSection || !authenticatedSection || !form || !errorMessage || !playerName || !serverList || !submitButton || !playButton || !logoutLink || !loadingSection || !loadingMessage || !gameSection || !gameCanvas || !gameUi) {
	throw new Error("The login component is incomplete.");
}

const channels = new Map<number, ChannelState>();
let selectedChannelId: number | null = null;
let realtimeConnected = false;
let enterChannelPending = false;
let game: Game | null = null;
let ui: UIManager | null = null;
let loadingPlayerEvents: Array<
	{ type: "joined"; player: PlayerState }
	| { type: "left"; playerId: number }
	| { type: "moved"; message: PlayerMovedMessage }
> = [];

// Lang: pt-BR
// Invalida prepares assíncronos para impedir que um resultado de Loading obsoleto se torne ativo.
// Lang: en-US
// Invalidates asynchronous preparations so an obsolete Loading result cannot become active.
let gameGeneration = 0;

// Lang: pt-BR
// O formulário pode estar visível durante logout, mas não pode criar sessão antes do fim dessa resposta HTTP.
// Lang: en-US
// The form may be visible during logout but cannot create a session before that HTTP response finishes.
let logoutPending = false;

/**
 * Lang: pt-BR
 * Bloqueia ou libera os controles de autenticação de acordo com o lifecycle de logout.
 *
 * Lang: en-US
 * Blocks or releases authentication controls according to the logout lifecycle.
 */
const setLoginAvailability = (available: boolean) => {
	for (const element of form.elements) {
		if (element instanceof HTMLInputElement || element instanceof HTMLButtonElement) {
			element.disabled = !available;
		}
	}
};

/**
 * Lang: pt-BR
 * Invalida qualquer prepare de Game em voo, descarta eventos associados e libera o runtime atual.
 *
 * Lang: en-US
 * Invalidates any in-flight Game preparation, discards its events, and releases the current runtime.
 */
const invalidateGame = () => {
	gameGeneration += 1;

	// Lang: pt-BR
	// Eventos acumulados para um Game anterior nunca podem vazar para seu sucessor.
	// Lang: en-US
	// Events buffered for an older Game must never leak into its successor.
	loadingPlayerEvents = [];

	game?.dispose();
	game = null;
	ui?.dispose();
	ui = null;
};

/** Lang: pt-BR - Habilita Play somente com sessão, conexão e channel válidos. Lang: en-US - Enables Play only with valid session, connection, and channel. */
const updatePlayAvailability = () => {
	const channel = selectedChannelId === null ? undefined : channels.get(selectedChannelId);

	playButton.disabled = !realtimeConnected
		|| enterChannelPending
		|| !channel
		|| channel.population >= channel.capacity;
};

/** Lang: pt-BR - Remove a senha do DOM após uso. Lang: en-US - Removes the password from the DOM after use. */
const clearPassword = () => {
	const passwordInput = form.elements.namedItem("password");

	if (passwordInput instanceof HTMLInputElement) {
		passwordInput.value = "";
	}
};

/** Lang: pt-BR - Limpa a seleção local de channel. Lang: en-US - Clears local channel selection. */
const clearSelection = () => {
	selectedChannelId = null;

	updatePlayAvailability();

	for (const channelButton of serverList.querySelectorAll<HTMLButtonElement>("[data-server-id]")) {
		channelButton.classList.remove("is-selected");
		channelButton.setAttribute("aria-pressed", "false");
	}
};

/**
 * Lang: pt-BR
 * Atualiza somente a seleção visual de um channel elegível; a admissão continua pertencendo ao server.
 *
 * Lang: en-US
 * Updates only the visual selection of an eligible channel; admission continues to belong to the server.
 */
const selectChannel = (channelId: number) => {
	const channel = channels.get(channelId);

	if (!realtimeConnected || !channel || channel.population >= channel.capacity) {
		return;
	}

	selectedChannelId = channelId;

	for (const channelButton of serverList.querySelectorAll<HTMLButtonElement>("[data-server-id]")) {
		const isSelected = Number(channelButton.dataset.serverId) === selectedChannelId;

		channelButton.classList.toggle("is-selected", isSelected);
		channelButton.setAttribute("aria-pressed", String(isSelected));
	}

	updatePlayAvailability();
};

/** Lang: pt-BR - Atualiza população e disponibilidade do botão. Lang: en-US - Updates button population and availability. */
const updateChannelButton = (channel: ChannelState) => {
	const channelButton = [...serverList.querySelectorAll<HTMLButtonElement>("[data-server-id]")]
		.find(({ dataset }) => Number(dataset.serverId) === channel.id);

	if (!channelButton) {
		return;
	}

	const isFull = channel.population >= channel.capacity;

	channelButton.textContent = `${channel.name} ${channel.population}/${channel.capacity}`;
	channelButton.disabled = isFull || !realtimeConnected;

	if (isFull && selectedChannelId === channel.id) {
		clearSelection();
	}
};

/**
 * Lang: pt-BR
 * Substitui o mirror client-side do catálogo e cria seus controles de seleção.
 *
 * Lang: en-US
 * Replaces the client-side catalog mirror and creates its selection controls.
 */
const renderChannels = (channelStates: ChannelState[]) => {
	channels.clear();

	clearSelection();

	serverList.replaceChildren(...channelStates.map((channel) => {
		channels.set(channel.id, channel);

		const channelButton = document.createElement("button");
		const isFull = channel.population >= channel.capacity;

		channelButton.type = "button";
		channelButton.textContent = `${channel.name} ${channel.population}/${channel.capacity}`;
		channelButton.dataset.serverId = String(channel.id);
		channelButton.disabled = isFull;
		channelButton.setAttribute("aria-pressed", "false");
		channelButton.addEventListener("click", () => selectChannel(channel.id));

		return channelButton;
	}));
};

/** Lang: pt-BR - Invalida o estado dependente da conexão realtime. Lang: en-US - Invalidates state dependent on the realtime connection. */
const markRealtimeDisconnected = () => {
	realtimeConnected = false;
	enterChannelPending = false;

	clearSelection();

	for (const channelButton of serverList.querySelectorAll<HTMLButtonElement>("[data-server-id]")) {
		channelButton.disabled = true;
	}
};

/**
 * Lang: pt-BR
 * Transiciona para Login e encerra qualquer estado autenticado, Loading ou Game ainda possuído pelo client.
 *
 * Lang: en-US
 * Transitions to Login and ends any authenticated, Loading, or Game state still owned by the client.
 */
const showLogin = (message?: string) => {
	invalidateGame();

	realtimeConnected = false;
	enterChannelPending = false;

	channels.clear();

	serverList.replaceChildren();
	playerName.textContent = "";

	clearPassword();

	authenticatedSection.hidden = true;
	loadingSection.hidden = true;
	gameSection.hidden = true;

	errorMessage.textContent = message ?? INVALID_CREDENTIALS_MESSAGE;
	errorMessage.hidden = !message;
	loginSection.hidden = false;

	root.dataset.state = "login";
};

const realtime = createRealtime({
	/** Lang: pt-BR - Substitui a lista pelo snapshot do servidor. Lang: en-US - Replaces the list with the server snapshot. */
	onChannelsState(channelStates) {
		realtimeConnected = true;
		enterChannelPending = false;

		renderChannels(channelStates);
	},

	/** Lang: pt-BR - Aplica atualização incremental de população. Lang: en-US - Applies an incremental population update. */
	onChannelPopulation(channelId, population) {
		const channel = channels.get(channelId);

		if (channel) {
			channel.population = population;

			updateChannelButton(channel);
		}
	},

	/** Lang: pt-BR - Reflete perda do transporte conforme a tela ativa. Lang: en-US - Reflects transport loss according to the active view. */
	onDisconnected() {
		// Lang: pt-BR
		// Lobby pode aguardar reconnect; Loading/Game não podem continuar sem sua presença autoritativa.
		// Lang: en-US
		// Lobby may wait for reconnect; Loading/Game cannot continue without authoritative presence.
		if (root.dataset.state === "loading" || root.dataset.state === "game") {
			realtime.close();
			showLogin(CONNECTION_LOST_MESSAGE);
		} else {
			markRealtimeDisconnected();
		}
	},

	/** Lang: pt-BR - Restaura o lobby após rejeição autoritativa. Lang: en-US - Restores the lobby after authoritative rejection. */
	onEnterChannelRejected(reason: EnterChannelRejectionReason) {
		enterChannelPending = false;

		if (reason === "CHANNEL_FULL") {
			clearSelection();
		} else {
			updatePlayAvailability();
		}
	},

	/** Lang: pt-BR - Inicia o Game somente após admission autoritativa. Lang: en-US - Starts Game only after authoritative admission. */
	async onEnterChannelSuccess(message) {
		// Lang: pt-BR
		// A admissão do server inicia um novo Loading e invalida qualquer runtime visual anterior.
		// Lang: en-US
		// Server admission starts a new Loading lifecycle and invalidates any previous visual runtime.
		enterChannelPending = false;

		invalidateGame();

		const currentGeneration = gameGeneration;

		authenticatedSection.hidden = true;
		loadingSection.hidden = false;
		loadingMessage.textContent = "Carregando...";
		root.dataset.state = "loading";

		try {
			const configResponse = await fetch("/game/config");
			if (!configResponse.ok) {
				const responseBody = await configResponse.text();
				throw new Error(`GAME_CONFIG_FAILED: HTTP ${configResponse.status}; ${responseBody}`);
			}
			const bootstrap = parseGameBootstrapConfig(await configResponse.json());
			let lastPersistedInventoryColumns = bootstrap.inventoryColumns;
			let inventoryColumnsSave = Promise.resolve();
			const saveInventoryColumns = (columns: number): void => {
				inventoryColumnsSave = inventoryColumnsSave.then(async () => {
					if (columns === lastPersistedInventoryColumns) return;
					const response = await fetch("/game/preferences/inventory-columns", {
						body: JSON.stringify({ columns }),
						headers: { "Content-Type": "application/json" },
						method: "PUT",
					});
					if (!response.ok) throw new Error("INVENTORY_COLUMNS_SAVE_FAILED");
					lastPersistedInventoryColumns = columns;
				}).catch((error: unknown) => {
					console.error("Unable to persist Inventory columns.", error);
				});
			};
			let lastPersistedInventoryPosition = bootstrap.inventoryPosition;
			let inventoryPositionSave = Promise.resolve();
			const saveInventoryPosition = (position: InventoryPosition): void => {
				inventoryPositionSave = inventoryPositionSave.then(async () => {
					if (
						position.x === lastPersistedInventoryPosition?.x
						&& position.y === lastPersistedInventoryPosition.y
					) return;
					const response = await fetch("/game/preferences/inventory-position", {
						body: JSON.stringify(position),
						headers: { "Content-Type": "application/json" },
						method: "PUT",
					});
					if (!response.ok) throw new Error("INVENTORY_POSITION_SAVE_FAILED");
					lastPersistedInventoryPosition = position;
				}).catch((error: unknown) => {
					console.error("Unable to persist Inventory position.", error);
				});
			};
			const startedGame = await startGame(
				gameCanvas,
				message.player,
				message.players,
				(row, column) => realtime.move(row, column),
				bootstrap,
				async (zoom) => {
					const response = await fetch("/game/preferences/zoom", {
						body: JSON.stringify({ zoom }),
						headers: { "Content-Type": "application/json" },
						method: "PUT",
					});
					if (!response.ok) throw new Error("ZOOM_SAVE_FAILED");
				},
				(error) => {
					console.error("Game runtime failed.", error);
					realtime.close();
					showLogin(GAME_START_FAILED_MESSAGE);
				},
				() => realtime.requestPlayersResync(),
			);

			// Lang: pt-BR
			// startGame prepara sem efeitos; somente a geração de Loading ainda atual pode ativá-lo.
			// Lang: en-US
			// startGame prepares without effects; only the still-current Loading generation may activate it.
			if (currentGeneration !== gameGeneration) {
				startedGame.dispose();

				return;
			}

			// Lang: pt-BR
			// Mudanças de presença recebidas durante assets são reconciliadas antes do primeiro frame.
			// Lang: en-US
			// Presence changes received while assets load are reconciled before the first frame.
			for (const event of loadingPlayerEvents) {
				if (event.type === "joined") startedGame.playerJoined(event.player);
				else if (event.type === "left") startedGame.playerLeft(event.playerId);
				else startedGame.playerMoved(event.message);
			}

			loadingPlayerEvents = [];
			game = startedGame;
			ui = new UIManager(
				gameUi,
				bootstrap.inventoryColumns,
				bootstrap.inventoryPosition,
				saveInventoryColumns,
				saveInventoryPosition,
			);

			startedGame.start();

			loadingSection.hidden = true;
			gameSection.hidden = false;

			root.dataset.state = "game";
		} catch (error) {
			console.error("Game initialization failed.", error);

			if (currentGeneration === gameGeneration) {
				// Lang: pt-BR
				// Falha de assets/init encerra a presença para não deixar um Game parcialmente ativo.
				// Lang: en-US
				// Asset/init failure ends presence so no partially active Game remains.
				realtime.close();

				showLogin(GAME_START_FAILED_MESSAGE);
			}
		}
	},

	/** Lang: pt-BR - Encaminha ou enfileira o join. Lang: en-US - Forwards or queues the join. */
	onPlayerJoined(player) {
		if (game) game.playerJoined(player);
		else if (root.dataset.state === "loading") loadingPlayerEvents.push({ type: "joined", player });
	},

	/** Lang: pt-BR - Encaminha ou enfileira o leave. Lang: en-US - Forwards or queues the leave. */
	onPlayerLeft(playerId) {
		if (game) game.playerLeft(playerId);
		else if (root.dataset.state === "loading") loadingPlayerEvents.push({ type: "left", playerId });
	},
	/** Lang: pt-BR - Encaminha ou enfileira o step autoritativo. Lang: en-US - Forwards or queues the authoritative step. */
	onPlayerMoved(message) {
		if (game) game.playerMoved(message);
		else if (root.dataset.state === "loading") loadingPlayerEvents.push({ type: "moved", message });
	},
	/** Lang: pt-BR - Encaminha o resync pontual somente ao Game ativo. Lang: en-US - Forwards one-shot resync only to the active Game. */
	onPlayersResync(message) {
		game?.playersResync(message);
	},

	// Lang: pt-BR
	// O close explícito faz estes motivos específicos prevalecerem sobre o callback genérico de disconnect.
	// Lang: en-US
	// Explicit close makes these specific reasons take precedence over the generic disconnect callback.
	onSessionReplaced() {
		realtime.close();

		showLogin(SESSION_REPLACED_MESSAGE);
	},

	/** Lang: pt-BR - Encerra runtime após revogação. Lang: en-US - Stops runtime after revocation. */
	onSessionRevoked() {
		realtime.close();

		showLogin(SESSION_REVOKED_MESSAGE);
	},

	/** Lang: pt-BR - Descarta estado após rejeição de autenticação. Lang: en-US - Discards state after authentication rejection. */
	onUnauthenticated() {
		realtime.close();

		showLogin(SESSION_EXPIRED_MESSAGE);
	},
});

/**
 * Lang: pt-BR
 * Instala a identidade autenticada, mostra o lobby e inicia o lifecycle Realtime dessa sessão.
 *
 * Lang: en-US
 * Installs the authenticated identity, shows the lobby, and starts that session's Realtime lifecycle.
 */
const showAuthenticated = (result: LoginResponse) => {
	invalidateGame();

	playerName.textContent = result.player.name;

	channels.clear();
	serverList.replaceChildren();

	clearSelection();
	clearPassword();

	loginSection.hidden = true;
	loadingSection.hidden = true;
	gameSection.hidden = true;
	authenticatedSection.hidden = false;

	root.dataset.state = "authenticated";

	realtime.connect();
};

/**
 * Lang: pt-BR
 * O submit cria uma sessão somente quando não existe logout pendente e instala a UI após resposta bem-sucedida.
 *
 * Lang: en-US
 * Submit creates a session only when no logout is pending and installs the UI after a successful response.
 */
form.addEventListener("submit", async (event) => {
	event.preventDefault();

	if (logoutPending || submitButton.disabled) {
		return;
	}

	const formData = new FormData(form);
	const username = formData.get("username");
	const password = formData.get("password");

	if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
		return;
	}

	errorMessage.hidden = true;
	errorMessage.textContent = INVALID_CREDENTIALS_MESSAGE;
	submitButton.disabled = true;
	submitButton.textContent = "Entrando...";

	try {
		const response = await fetch("/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, password }),
		});

		if (!response.ok) {
			throw new Error("LOGIN_FAILED");
		}

		showAuthenticated(await response.json() as LoginResponse);
	} catch {
		errorMessage.textContent = INVALID_CREDENTIALS_MESSAGE;
		errorMessage.hidden = false;
	} finally {
		submitButton.disabled = false;
		submitButton.textContent = "Entrar";
	}
});

/**
 * Lang: pt-BR
 * Envia ENTER_CHANNEL uma vez por tentativa; a seleção local não concede membership.
 *
 * Lang: en-US
 * Sends ENTER_CHANNEL once per attempt; local selection does not grant membership.
 */
playButton.addEventListener("click", () => {
	if (selectedChannelId === null || enterChannelPending) {
		return;
	}

	if (realtime.enterChannel(selectedChannelId)) {
		enterChannelPending = true;

		updatePlayAvailability();
	}
});

/**
 * Lang: pt-BR
 * Encerra Game/Realtime imediatamente e bloqueia novo login até a resposta antiga de logout ser consumida.
 * Essa ordem impede que clearCookie ou erro tardio interfira em uma sessão posterior.
 *
 * Lang: en-US
 * Ends Game/Realtime immediately and blocks new login until the old logout response is consumed.
 * This order prevents a late clearCookie or error from interfering with a later session.
 */
logoutLink.addEventListener("click", async (event) => {
	event.preventDefault();

	if (logoutLink.getAttribute("aria-disabled") === "true") {
		return;
	}

	logoutLink.setAttribute("aria-disabled", "true");
	logoutPending = true;

	setLoginAvailability(false);

	// Lang: pt-BR
	// Lifecycles visual/socket terminam agora, mas Login permanece bloqueado até o cookie antigo ser resolvido.
	// Lang: en-US
	// Visual/socket lifecycles end now, but Login remains blocked until the old cookie is resolved.
	invalidateGame();

	realtime.close();
	showLogin();

	let logoutFailed = false;

	try {
		const response = await fetch("/auth/logout", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});

		if (!response.ok) throw new Error("LOGOUT_FAILED");
	} catch {
		logoutFailed = true;
	} finally {
		logoutPending = false;

		setLoginAvailability(true);

		logoutLink.removeAttribute("aria-disabled");

		if (logoutFailed) {
			showLogin(LOGOUT_FAILED_MESSAGE);
		}
	}
});

/**
 * Lang: pt-BR
 * Restaura o shell autenticado a partir do cookie existente sem competir com um logout em andamento.
 * Falha transitória ou sessão inválida retorna a UI ao Login.
 *
 * Lang: en-US
 * Restores the authenticated shell from the existing cookie without racing an ongoing logout.
 * A transient failure or invalid session returns the UI to Login.
 */
const restore = async () => {
	if (logoutPending) {
		return;
	}

	try {
		const response = await fetch("/auth/session");

		if (response.ok) {
			showAuthenticated(await response.json() as LoginResponse);

			return;
		}
	} catch {
		// Lang: pt-BR
		// Uma falha transitória de restore retorna ao formulário sem criar lifecycle autenticado parcial.
		// Lang: en-US
		// A transient restore failure returns to the form without creating a partial authenticated lifecycle.
	}

	showLogin();
};

void restore();
