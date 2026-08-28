/**
 * Lang: pt-BR
 * Possui o runtime visual preparado do gameplay e aplica estados autoritativos recebidos do server.
 * Não decide identidade, membership ou posições de jogadores.
 *
 * Lang: en-US
 * Owns the prepared visual gameplay runtime and applies authoritative state received from the server.
 * It does not decide player identity, membership, or positions.
 */
import { changeCameraZoom, type Camera } from "../engine/Camera.js";
import { resizeCanvasToViewport } from "../engine/Canvas.js";
import { gridToIsometric } from "../engine/Isometric.js";
import { createLobbyRenderer } from "./Lobby.js";
import { type Player } from "./Player.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;

export interface Game {
	dispose(): void;
	playerJoined(player: Player): void;
	playerLeft(playerId: number): void;
	start(): void;
}

/**
 * Lang: pt-BR
 * Prepara assets e estado interno sem registrar listeners ou renderizar.
 * O chamador deve validar se este prepare ainda é atual antes de chamar start().
 *
 * Lang: en-US
 * Prepares a visual runtime without installing listeners or rendering.
 * Its caller decides whether this preparation is still current before invoking start().
 */
export async function startGame(canvas: HTMLCanvasElement, localPlayer: Player, initialRemotePlayers: readonly Player[]): Promise<Game> {
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Canvas 2D is not available.");
	}

	const surface = { element: canvas, context };
	const lobby = await createLobbyRenderer(surface);
	const localWorld = gridToIsometric(localPlayer.column, localPlayer.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
	const camera: Camera = { x: localWorld.x, y: localWorld.y + TILE_FOOTPRINT_HEIGHT, zoom: 1 };

	// Lang: pt-BR
	// Este Map espelha presença fornecida pelo server; Game nunca escolhe identity, row ou column.
	// Lang: en-US
	// This Map mirrors server-provided presence; Game never chooses identity, row, or column.
	const players = new Map<number, Player>([[localPlayer.id, localPlayer]]);

	let disposed = false;
	let started = false;

	for (const player of initialRemotePlayers) players.set(player.id, player);

	/**
	 * Lang: pt-BR
	 * Renderiza o snapshot visual atual somente depois de start() e antes de dispose().
	 *
	 * Lang: en-US
	 * Renders the current visual snapshot only after start() and before dispose().
	 */
	const render = () => {
		if (started && !disposed) {
			lobby.render([...players.values()], camera);
		}
	};

	/**
	 * Lang: pt-BR
	 * Recalcula o buffer lógico antes de redesenhar o estado visual preservado.
	 *
	 * Lang: en-US
	 * Recalculates the logical buffer before redrawing the preserved visual state.
	 */
	const resizeAndRender = () => { resizeCanvasToViewport(surface); render(); };

	/**
	 * Lang: pt-BR
	 * Aplica zoom puramente visual e impede que o wheel role a página durante interação com o canvas.
	 *
	 * Lang: en-US
	 * Applies purely visual zoom and prevents wheel events from scrolling the page during canvas interaction.
	 */
	const zoomAndRender = (event: WheelEvent) => { event.preventDefault(); changeCameraZoom(camera, event.deltaY); render(); };

	return {
		/**
		 * Lang: pt-BR
		 * Encerra listeners e estado visual. É idempotente para permitir cleanup por qualquer caminho de lifecycle.
		 *
		 * Lang: en-US
		 * Ends listeners and visual state. It is idempotent so any lifecycle path can perform cleanup safely.
		 */
		dispose() {
			if (disposed) {
				return;
			}

			disposed = true;
			window.removeEventListener("resize", resizeAndRender);
			canvas.removeEventListener("wheel", zoomAndRender);
			players.clear();
		},

		/**
		 * Lang: pt-BR
		 * Adiciona ou atualiza o mirror visual de um jogador usando dados já decididos pelo server.
		 *
		 * Lang: en-US
		 * Adds or updates a player's visual mirror using data already decided by the server.
		 */
		playerJoined(player) {
			if (!disposed) {
				players.set(player.id, player);
				render();
			}
		},

		/**
		 * Lang: pt-BR
		 * Remove um jogador remoto do mirror visual sem permitir a remoção do jogador local por evento remoto.
		 *
		 * Lang: en-US
		 * Removes a remote player from the visual mirror without allowing a remote event to remove the local player.
		 */
		playerLeft(playerId) {
			if (!disposed && playerId !== localPlayer.id && players.delete(playerId)) render();
		},

		/**
		 * Lang: pt-BR
		 * Ativa listeners e a primeira renderização após o composition root validar a geração de Loading.
		 *
		 * Lang: en-US
		 * Activates listeners and the first render after the composition root validates the Loading generation.
		 */
		start() {
			if (disposed || started) {
				return;
			}

			started = true;
			window.addEventListener("resize", resizeAndRender);
			canvas.addEventListener("wheel", zoomAndRender, { passive: false });
			resizeAndRender();
		},
	};
}
