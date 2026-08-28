/**
 * Lang: pt-BR
 * Valida credenciais contra accounts e devolve a identidade autenticada com o catálogo inicial.
 * Este módulo verifica Argon2, mas não cria nem persiste sessões.
 *
 * Lang: en-US
 * Validates credentials against accounts and returns the authenticated identity with the initial catalog.
 * This module verifies Argon2 but does not create or persist sessions.
 */
import argon2 from "argon2";

import { database } from "../database/Database.js";

interface AccountRow {
	id: number;
	password_hash: string;
	display_name: string;
}

interface GameServerRow {
	id: number;
	name: string;
}

export interface AuthenticationResult {
	player: { id: number; name: string };
	servers: GameServerRow[];
}

/**
 * Lang: pt-BR
 * Autentica username/password e retorna null sem revelar se a conta ou a senha falhou.
 *
 * Lang: en-US
 * Authenticates username/password and returns null without revealing whether the account or password failed.
 */
export async function authenticate(username: string, password: string): Promise<AuthenticationResult | null> {
	const accountResult = await database.query<AccountRow>(
		"SELECT id, password_hash, display_name FROM accounts WHERE username = $1",
		[username],
	);

	const account = accountResult.rows[0];

	if (!account || !await argon2.verify(account.password_hash, password)) {
		return null;
	}

	const serversResult = await database.query<GameServerRow>(
		"SELECT id, name FROM game_servers ORDER BY id",
	);

	return {
		player: { id: account.id, name: account.display_name },
		servers: serversResult.rows,
	};
}
