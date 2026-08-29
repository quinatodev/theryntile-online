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
import { createGameBootstrapPayload, isAllowedZoom } from "./game/GameConfig.js";

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
const accountLoginAttempts = new Map<number, number>();

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

		try {
			const result = await authenticate(login.data.username, login.data.password);
			if (!result) {
				return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
			}

			const attempt = (accountLoginAttempts.get(result.player.id) ?? 0) + 1;

			accountLoginAttempts.set(result.player.id, attempt);

			const releaseLogin = await waitForAccountLogin(result.player.id);

			try {
				const session = await createSession(result.player.id);

				// Lang: pt-BR
				// Uma tentativa superada retorna 409 sem instalar seu cookie obsoleto.
				// Lang: en-US
				// A superseded attempt returns 409 without installing its obsolete cookie.
				if (accountLoginAttempts.get(result.player.id) !== attempt || !await isCurrentSession(result.player.id, session.sessionId)) {
					return reply.code(409).send({ error: "SESSION_REPLACED" });
				}

				accountLoginAttempts.delete(result.player.id);

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
			const result = await database.query<{ zoom: number }>("SELECT zoom FROM accounts WHERE id = $1", [session.accountId]);
			const zoom = result.rows[0]?.zoom;
			if (!Number.isInteger(zoom)) throw new Error("Account zoom is unavailable.");

			return createGameBootstrapPayload(zoom);
		} catch (error) {
			request.log.error({ err: error }, "Game configuration failed unexpectedly");

			return reply.code(500).send({ error: "INTERNAL_ERROR" });
		}
	});

	/**
	 * Lang: pt-BR
	 * Persiste apenas um nÃ­vel discreto permitido, sem aceitar accountId escolhido pelo client.
	 *
	 * Lang: en-US
	 * Persists only an allowed discrete level without accepting a client-selected accountId.
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
		},
	}, (socket, request) => {
		if (!request.sessionPlayer || !request.sessionId) {
			socket.close(1008, "UNAUTHENTICATED");

			return;
		}

		addLobbySocket(socket, request.sessionPlayer, request.sessionId);
	});

	return server;
}

declare module "fastify" {
	interface FastifyRequest {
		sessionId?: string;
		sessionPlayer?: { id: number; name: string };
	}
}
