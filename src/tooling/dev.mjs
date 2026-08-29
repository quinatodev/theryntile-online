/**
 * Lang: pt-BR
 * Prepara o client emitido e mantém em paralelo o build watch e o server source watch.
 * tsconfig.build.json exclui deliberadamente testes do dist servido durante desenvolvimento.
 *
 * Lang: en-US
 * Prepares the emitted client and runs build watch and source-server watch in parallel.
 * tsconfig.build.json deliberately excludes tests from the dist served during development.
 */
import process from "node:process";

import { spawn, spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";

const tsc = "node_modules/typescript/bin/tsc";
const tsx = "node_modules/tsx/dist/cli.mjs";

// Lang: pt-BR
// A limpeza inicial impede que artefatos obsoletos, inclusive testes emitidos anteriormente, continuem sendo servidos.
// Lang: en-US
// Initial cleanup prevents stale artifacts, including previously emitted tests, from remaining served.
await rm("dist", { recursive: true, force: true });

const initialBuild = spawnSync(process.execPath, [tsc, "--project", "tsconfig.build.json"], { stdio: "inherit" });

if (initialBuild.status !== 0) {
	process.exit(initialBuild.status ?? 1);
}

const children = [
	spawn(process.execPath, [tsc, "--watch", "--preserveWatchOutput", "--project", "tsconfig.build.json"], {
		detached: process.platform !== "win32",
		stdio: "inherit",
	}),
	spawn(process.execPath, [tsx, "watch", "src/server/index.ts"], {
		detached: process.platform !== "win32",
		stdio: "inherit",
	}),
];

let stopping = false;

// Lang: pt-BR
// Encerra a árvore inteira porque watchers criam netos; matar apenas o filho direto deixa o server órfão no Windows.
// Lang: en-US
// Terminates the whole tree because watchers create grandchildren; killing only the direct child orphans the server on Windows.
const stop = (exitCode = 0) => {
	if (stopping) return;
	stopping = true;
	for (const child of children) {
		if (!child.pid) continue;
		if (process.platform === "win32") {
			spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
		} else {
			try {
				process.kill(-child.pid, "SIGTERM");
			} catch {
				// O processo pode ter encerrado antes do sibling disparar o cleanup.
				// The process may have exited before its sibling triggered cleanup.
			}
		}
	}
	process.exit(exitCode);
};

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

for (const child of children) {
	child.on("exit", (code) => {
		if (!stopping) stop(code ?? 0);
	});
	child.on("error", () => stop(1));
}
