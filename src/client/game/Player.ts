/**
 * Lang: pt-BR
 * Representa no client um jogador autoritativo recebido do server.
 * Não possui socket nem decide id, row ou column.
 *
 * Lang: en-US
 * Represents an authoritative server-provided player on the client.
 * It owns no socket and does not decide id, row, or column.
 */
export interface Player {
	id: number;
	name: string;
	row: number;
	column: number;
}
