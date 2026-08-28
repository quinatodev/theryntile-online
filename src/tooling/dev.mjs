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
	spawn(process.execPath, [tsc, "--watch", "--preserveWatchOutput", "--project", "tsconfig.build.json"], { stdio: "inherit" }),
	spawn(process.execPath, [tsx, "watch", "src/server/index.ts"], { stdio: "inherit" }),
];

const stop = () => {
	for (const child of children) {
		child.kill();
	}
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

for (const child of children) {
	child.on("exit", (code) => {
		if (code && code !== 0) {
			stop();
			process.exit(code);
		}
	});
}
