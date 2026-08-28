/**
 * Lang: pt-BR
 * Produz um dist independente de src ao limpar, compilar o runtime e copiar views/assets estáticos.
 *
 * Lang: en-US
 * Produces a dist independent from src by cleaning, compiling runtime code, and copying views/static assets.
 */
import process from "node:process";

import { cp, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Lang: pt-BR
// A limpeza garante que arquivos removidos ou excluídos do build não sobrevivam de um deploy anterior.
// Lang: en-US
// Cleanup ensures files removed or excluded from the build do not survive from a previous deployment.
await rm("dist", { recursive: true, force: true });

execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--project", "tsconfig.build.json"], {
	stdio: "inherit",
});

await mkdir("dist", { recursive: true });

await Promise.all([
	cp("src/views", "dist/views", { recursive: true }),
	cp("public", "dist/public", { recursive: true }),
]);
