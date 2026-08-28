import { z } from "zod";

/**
 * Lang: pt-BR
 * Valida a fronteira HTTP do login: normaliza espaços do username, preserva a senha literalmente
 * e rejeita propriedades adicionais. Não representa uma regra de sessão ou gameplay.
 *
 * Lang: en-US
 * Validates the login HTTP boundary: trims the username, preserves the password literally,
 * and rejects additional properties. It is not a session or gameplay rule.
 */
export const LoginSchema = z.strictObject({
	username: z.string().trim().min(1).max(64),
	password: z.string().min(1).max(128),
});
