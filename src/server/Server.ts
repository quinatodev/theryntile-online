/**
 * Lang: pt-BR
 * Composition root Fastify que integra HTTP, autenticação, sessão persistente, WebSocket e Channels.
 * Coordena fronteiras e ordem de lifecycle; regras específicas permanecem nos módulos importados.
 *
 * Lang: en-US
 * Fastify composition root integrating HTTP, authentication, persistent sessions, WebSocket, and Channels.
 * It coordinates boundaries and lifecycle order; specific rules remain in imported modules.
 */
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
import fastifyWebsocket from "@fastify/websocket";
import path from "node:path";
import pug from "pug";

import { fileURLToPath } from "node:url";
import { authenticate } from "./auth/Authenticate.js";
import { LoginSchema } from "./auth/LoginSchema.js";
import {
	SESSION_COOKIE_NAME,
	clearSessionCookieOptions,
	createSession,
	isCurrentSession,
	restoreSession,
	restoreSessionDetails,
	revokeSession,
	sessionCookieOptions,
} from "./auth/Session.js";
import { addLobbySocket, initializeChannels, replaceAccountConnections, revokeSessionConnections } from "./game/Channels.js";
import { database } from "./database/Database.js";
import { createGameBootstrapPayload, isAllowedCharacterCoordinate, isAllowedInventoryColumns, isAllowedInventoryCoordinate, isAllowedZoom } from "./game/GameConfig.js";

const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const developmentSource = path.basename(sourceRoot) === "src";
const runtimeRoot = developmentSource ? path.resolve(sourceRoot, "..") : sourceRoot;
const clientRoot = developmentSource ? path.join(runtimeRoot, "dist", "client") : path.join(runtimeRoot, "client");
const publicRoot = path.join(runtimeRoot, "public");
const viewsRoot = developmentSource ? path.join(sourceRoot, "views") : path.join(runtimeRoot, "views");

// Lang: pt-BR
// Estas estruturas process-local serializam a finalização por account e identificam a tentativa concorrente mais nova.
// Lang: en-US
// These process-local structures serialize finalization per account and identify the newest concurrent attempt.
const accountLoginQueues = new Map<number, Promise<void>>();
const loginRequestAttempts = new Map<string, number>();

/**
 * Lang: pt-BR
 * Serializa a fase de criação/finalização de sessão para uma account dentro deste processo.
 * O release retornado preserva a fila de tentativas posteriores e remove o índice somente quando ele é o tail atual.
 *
 * Lang: en-US
 * Serializes session creation/finalization for one account within this process.
 * The returned release preserves later attempts and removes the index only when it is the current tail.
 */
const waitForAccountLogin = async (accountId: number): Promise<() => void> => {
	const previous = accountLoginQueues.get(accountId) ?? Promise.resolve();

	/** Lang: pt-BR - Referência antecipada para liberar a fila da account. Lang: en-US - Forward reference for releasing the account queue. */
	let releaseQueue = () => {};

	const current = new Promise<void>((resolve) => { releaseQueue = resolve; });
	const queued = previous.then(() => current);

	accountLoginQueues.set(accountId, queued);

	await previous;

	return () => {
		releaseQueue();

		if (accountLoginQueues.get(accountId) === queued) {
			accountLoginQueues.delete(accountId);
		}
	};
};

/**
 * Lang: pt-BR
 * Cria e configura a aplicação Fastify sem iniciar o listener, permitindo bootstrap e testes separados.
 *
 * Lang: en-US
 * Creates and configures the Fastify application without starting its listener, keeping bootstrap and tests separate.
 */
export async function createServer(): Promise<FastifyInstance> {
	const server = Fastify({ logger: true });

	await server.register(fastifyCookie);
	await server.register(fastifyWebsocket);
	await initializeChannels();

	await server.register(fastifyView, {
		engine: { pug },
		root: viewsRoot,
		options: {
			cache: process.env.NODE_ENV === "production",
		},
	});

	await server.register(fastifyStatic, {
		root: publicRoot,
		prefix: "/",
	});

	await server.register(fastifyStatic, {
		root: clientRoot,
		prefix: "/client/",
		decorateReply: false,
	});

	server.get("/", (_request, reply) => reply.view("login/index.pug"));

	/**
	 * Lang: pt-BR
	 * Coordena validação, credenciais, sessão única, replacement de sockets e instalação do cookie vencedor.
	 *
	 * Lang: en-US
	 * Coordinates validation, credentials, single-session creation, socket replacement, and winning-cookie installation.
	 */
	server.post("/auth/login", async (request, reply) => {
		const login = LoginSchema.safeParse(request.body);

		if (!login.success) {
			return reply.code(400).send({ error: "INVALID_REQUEST" });
		}
		// Lang: pt-BR
		// A geração nasce antes do Argon2 para que uma requisição concorrente mais nova possa superar a anterior.
		// Lang: en-US
		// The generation starts before Argon2 so a newer concurrent request can supersede the earlier one.
		const attempt = (loginRequestAttempts.get(login.data.username) ?? 0) + 1;
		loginRequestAttempts.set(login.data.username, attempt);

		try {
			const result = await authenticate(login.data.username, login.data.password);
			if (!result) {
				return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
			}

			const releaseLogin = await waitForAccountLogin(result.player.id);

			try {
				const session = await createSession(result.player.id);

				// Lang: pt-BR
				// Uma tentativa superada retorna 409 sem instalar seu cookie obsoleto.
				// Lang: en-US
				// A superseded attempt returns 409 without installing its obsolete cookie.
				if (loginRequestAttempts.get(login.data.username) !== attempt || !await isCurrentSession(result.player.id, session.sessionId)) {
					return reply.code(409).send({ error: "SESSION_REPLACED" });
				}

				loginRequestAttempts.delete(login.data.username);

				// Lang: pt-BR
				// Sockets de sids antigos são retirados antes que o cookie da sessão vencedora seja exposto.
				// Lang: en-US
				// Sockets from older sids are retired before the winning session cookie is exposed.
				replaceAccountConnections(result.player.id, session.sessionId);
				reply.setCookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions);

				return result;
			} finally {
				releaseLogin();
			}
		} catch (error) {
			request.log.error({ err: error }, "Authentication failed unexpectedly");

			return reply.code(500).send({ error: "INTERNAL_ERROR" });
		}
	});

	/**
	 * Lang: pt-BR
	 * Restaura a identidade pública somente quando cookie, JWT e linha persistida continuam válidos.
	 *
	 * Lang: en-US
	 * Restores the public identity only while cookie, JWT, and persisted row remain valid.
	 */
	server.get("/auth/session", async (request, reply) => {
		const token = request.cookies[SESSION_COOKIE_NAME];

		if (!token) {
			return reply.code(401).send({ error: "UNAUTHENTICATED" });
		}

		try {
			const session = await restoreSession(token);

			if (!session) {
				return reply.code(401).send({ error: "UNAUTHENTICATED" });
			}

			return session;
		} catch (error) {
			request.log.error({ err: error }, "Session restoration failed unexpectedly");

			return reply.code(500).send({ error: "INTERNAL_ERROR" });
		}
	});

	/**
	 * Lang: pt-BR
	 * Entrega o contrato autoritativo do mapa e o zoom normalizado apenas para a Account derivada da sessÃ£o.
	 *
	 * Lang: en-US
	 * Delivers the authoritative map contract and normalized zoom only for the Account derived from the session.
	 */
	server.get("/game/config", async (request, reply) => {
		const token = request.cookies[SESSION_COOKIE_NAME];
		try {
			const session = token ? await restoreSessionDetails(token) : null;
			if (!session) return reply.code(401).send({ error: "UNAUTHENTICATED" });
			const result = await database.query<{ character_x: number | null; character_y: number | null; inventory_columns: number; inventory_x: number | null; inventory_y: number | null; zoom: number }>(
				"SELECT zoom, inventory_x, inventory_y, inventory_columns, character_x, character_y FROM accounts WHERE id = $1",
				[session.accountId],
			);
			const account = result.rows[0];
			const zoom = account?.zoom;
			if (!Number.isFinite(zoom)) throw new Error("Account zoom is unavailable.");
			if (!isAllowedInventoryColumns(account?.inventory_columns)) throw new Error("Account inventory columns are invalid.");
			const inventoryX = account?.inventory_x;
			const inventoryY = account?.inventory_y;
			let inventoryPosition = null;
			if (inventoryX !== null || inventoryY !== null) {
				if (!isAllowedInventoryCoordinate(inventoryX) || !isAllowedInventoryCoordinate(inventoryY)) {
					throw new Error("Account inventory position is invalid.");
				}
				inventoryPosition = { x: inventoryX, y: inventoryY };
			}
			const characterX = account?.character_x;
			const characterY = account?.character_y;
			let characterPosition = null;
			if (characterX !== null || characterY !== null) {
				if (!isAllowedCharacterCoordinate(characterX) || !isAllowedCharacterCoordinate(characterY)) {
					throw new Error("Account character position is invalid.");
				}
				characterPosition = { x: characterX, y: characterY };
			}

			return createGameBootstrapPayload(zoom, inventoryPosition, account.inventory_columns, characterPosition);
		} catch (error) {
			request.log.error({ err: error }, "Game configuration failed unexpectedly");

			return reply.code(500).send({ error: "INTERNAL_ERROR" });
		}
	});

	/**
	 * Lang: pt-BR
	 * Persiste uma posição de Inventory defensivamente limitada para a Account autenticada.
	 *
	 * Lang: en-US
	 * Persists a defensively bounded Inventory position for the authenticated Account.
	 */
	server.put("/game/preferences/inventory-position", async (request, reply) => {
		const token = request.cookies[SESSION_COOKIE_NAME];
		const body = request.body;
		if (!body || typeof body !== "object" || Array.isArray(body)) return reply.code(400).send({ error: "INVALID_INVENTORY_POSITION" });
		const position = body as Record<string, unknown>;
		if (
			Object.keys(position).length !== 2
			|| !isAllowedInventoryCoordinate(position.x)
			|| !isAllowedInventoryCoordinate(position.y)
		) return reply.code(400).send({ error: "INVALID_INVENTORY_POSITION" });
		try {
			const session = token ? await restoreSessionDetails(token) : null;
			if (!session) return reply.code(401).send({ error: "UNAUTHENTICATED" });
			await database.query("UPDATE accounts SET inventory_x = $1, inventory_y = $2 WHERE id = $3", [position.x, position.y, session.accountId]);

			return { success: true };
		} catch (error) {
			request.log.error({ err: error }, "Inventory position persistence failed unexpectedly");

			return reply.code(500).send({ error: "INTERNAL_ERROR" });
		}
	});

	/** Lang: pt-BR - Persiste a posiÃ§Ã£o de Character somente para a Account autenticada. Lang: en-US - Persists the Character position only for the authenticated Account. */
	server.put("/game/preferences/character-position", async (request, reply) => {
		const token = request.cookies[SESSION_COOKIE_NAME];
		const body = request.body;
		if (!body || typeof body !== "object" || Array.isArray(body)) return reply.code(400).send({ error: "INVALID_CHARACTER_POSITION" });
		const position = body as Record<string, unknown>;
		if (
			Object.keys(position).length !== 2
			|| !isAllowedCharacterCoordinate(position.x)
			|| !isAllowedCharacterCoordinate(position.y)
		) return reply.code(400).send({ error: "INVALID_CHARACTER_POSITION" });
		try {
			const session = token ? await restoreSessionDetails(token) : null;
			if (!session) return reply.code(401).send({ error: "UNAUTHENTICATED" });
			await database.query("UPDATE accounts SET character_x = $1, character_y = $2 WHERE id = $3", [position.x, position.y, session.accountId]);

			return { success: true };
		} catch (error) {
			request.log.error({ err: error }, "Character position persistence failed unexpectedly");

			return reply.code(500).send({ error: "INTERNAL_ERROR" });
		}
	});

	/** Lang: pt-BR - Persiste somente uma largura discreta da Backpack para a Account autenticada. Lang: en-US - Persists only one discrete Backpack width for the authenticated Account. */
	server.put("/game/preferences/inventory-columns", async (request, reply) => {
		const token = request.cookies[SESSION_COOKIE_NAME];
		const body = request.body;
		if (!body || typeof body !== "object" || Array.isArray(body)) return reply.code(400).send({ error: "INVALID_INVENTORY_COLUMNS" });
		const preference = body as Record<string, unknown>;
		if (Object.keys(preference).length !== 1 || !isAllowedInventoryColumns(preference.columns)) {
			return reply.code(400).send({ error: "INVALID_INVENTORY_COLUMNS" });
		}
		try {
			const session = token ? await restoreSessionDetails(token) : null;
			if (!session) return reply.code(401).send({ error: "UNAUTHENTICATED" });
			await database.query("UPDATE accounts SET inventory_columns = $1 WHERE id = $2", [preference.columns, session.accountId]);

			return { success: true };
		} catch (error) {
			request.log.error({ err: error }, "Inventory columns persistence failed unexpectedly");

			return reply.code(500).send({ error: "INTERNAL_ERROR" });
		}
	});

	/**
	 * Lang: pt-BR
	 * Persiste apenas um zoom finito dentro dos limites, sem aceitar accountId escolhido pelo client.
	 *
	 * Lang: en-US
	 * Persists only a finite zoom within bounds without accepting a client-selected accountId.
	 */
	server.put("/game/preferences/zoom", async (request, reply) => {
		const token = request.cookies[SESSION_COOKIE_NAME];
		const zoom = (request.body as { zoom?: unknown } | null)?.zoom;
		if (typeof zoom !== "number" || !isAllowedZoom(zoom)) return reply.code(400).send({ error: "INVALID_ZOOM" });
		try {
			const session = token ? await restoreSessionDetails(token) : null;
			if (!session) return reply.code(401).send({ error: "UNAUTHENTICATED" });
			await database.query("UPDATE accounts SET zoom = $1 WHERE id = $2", [zoom, session.accountId]);

			return { success: true };
		} catch (error) {
			request.log.error({ err: error }, "Zoom persistence failed unexpectedly");

			return reply.code(500).send({ error: "INTERNAL_ERROR" });
		}
	});

	/**
	 * Lang: pt-BR
	 * Revoga o sid do cookie, propaga SESSION_REVOKED aos sockets exatos e limpa o cookie HTTP.
	 *
	 * Lang: en-US
	 * Revokes the cookie sid, propagates SESSION_REVOKED to exact sockets, and clears the HTTP cookie.
	 */
	server.post("/auth/logout", async (request, reply) => {
		const token = request.cookies[SESSION_COOKIE_NAME];

		try {
			if (token) {
				const session = await restoreSessionDetails(token);
				await revokeSession(token);

				if (session) {
					revokeSessionConnections(session.sessionId);
				}
			}

			reply.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions);

			return { success: true };
		} catch (error) {
			request.log.error({ err: error }, "Logout failed unexpectedly");

			return reply.code(500).send({ error: "INTERNAL_ERROR" });
		}
	});

	/**
	 * Lang: pt-BR
	 * Autentica o upgrade por sessão persistida e entrega identity/sid derivados pelo server a Channels.
	 *
	 * Lang: en-US
	 * Authenticates the upgrade through the persisted session and hands server-derived identity/sid to Channels.
	 */
	server.get("/ws", {
		websocket: true,
		preValidation: async (request, reply) => {
			const token = request.cookies[SESSION_COOKIE_NAME];
			const session = token ? await restoreSessionDetails(token) : null;

			if (!session) {
				return reply.code(401).send({ error: "UNAUTHENTICATED" });
			}

			request.sessionPlayer = session.player;
			request.sessionId = session.sessionId;
			request.sessionExpiresAt = session.expiresAt;
		},
	}, (socket, request) => {
		if (!request.sessionPlayer || !request.sessionId || !request.sessionExpiresAt) {
			socket.close(1008, "UNAUTHENTICATED");

			return;
		}

		addLobbySocket(socket, request.sessionPlayer, request.sessionId, request.sessionExpiresAt);
	});

	return server;
}

declare module "fastify" {
	interface FastifyRequest {
		sessionExpiresAt?: Date;
		sessionId?: string;
		sessionPlayer?: { id: number; name: string };
	}
}
