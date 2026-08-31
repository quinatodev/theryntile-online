/**
 * Lang: pt-BR
 * Bootstrap do processo: valida host/porta, compõe o server, inicia o listener e trata falhas fatais.
 *
 * Lang: en-US
 * Process bootstrap: validates host/port, composes the server, starts listening, and handles fatal failures.
 */
import { createServer } from "./Server.js";

interface ParamsServerConfig {
	readonly defaultPort: number;
	readonly defaultHost: string;
}

interface ResonseServerConfig {
	readonly port: number;
	readonly host: string;
}

/** Lang: pt-BR - Resolve host e porta validados com fallback. Lang: en-US - Resolves validated host and port with fallback. */
function ServerConfig(params: ParamsServerConfig): ResonseServerConfig {
	/** Lang: pt-BR - Lê uma porta HTTP válida. Lang: en-US - Reads a valid HTTP port. */
	const getPortFromEnv = () => {
		const portFromEnv = Number(process.env.PORT_HTTP);
		if (Number.isSafeInteger(portFromEnv) && portFromEnv >= 1 && portFromEnv <= 65_535) {
			return portFromEnv;
		}

		console.warn("PORT_HTTP from env file is not correct or missing.");
		console.warn("The server has set a new default port.");

		return params.defaultPort;
	};

	/** Lang: pt-BR - Lê um host HTTP não vazio. Lang: en-US - Reads a non-empty HTTP host. */
	const getHostFromEnv = () => {
		const hostFromEnv = process.env.HOST_HTTP;
		if (hostFromEnv) {
			return hostFromEnv;
		}

		console.warn("HOST_HTTP from env file is not configured.");
		console.warn("The server has set a new default host.");

		return params.defaultHost;
	};

	return {
		port: getPortFromEnv(),
		host: getHostFromEnv(),
	};
}

try {
	const server = await createServer();
	await server.listen(ServerConfig({ defaultPort: 3000, defaultHost: "localhost" }));
} catch (error) {
	console.error("Failed to start the Theryntile server.", error);
	process.exit(1);
}
