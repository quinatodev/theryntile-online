/**
 * Lang: pt-BR
 * Seleciona uma posição livre sem conhecer ou mutar channels, sockets ou banco de dados.
 * A escolha aleatória é a política simples atual e pode ser injetada para testes determinísticos.
 *
 * Lang: en-US
 * Selects a free position without knowing about or mutating channels, sockets, or the database.
 * Random selection is the current simple policy and can be injected for deterministic tests.
 */
export interface SpawnPosition {
	row: number;
	column: number;
}

export const LOBBY_ROWS = 5;
export const LOBBY_COLUMNS = 5;

/**
 * Lang: pt-BR
 * Retorna uma posição desocupada do mapa atual ou undefined quando nenhuma posição está disponível.
 *
 * Lang: en-US
 * Returns an unoccupied position in the current map or undefined when no position is available.
 */
export function getRandomSpawn(
	occupiedPositions: readonly SpawnPosition[],
	random: () => number = Math.random,
): SpawnPosition | undefined {
	const availablePositions: SpawnPosition[] = [];

	for (let row = 0; row < LOBBY_ROWS; row += 1) {
		for (let column = 0; column < LOBBY_COLUMNS; column += 1) {
			const occupied = occupiedPositions.some((position) => position.row === row && position.column === column);

			if (!occupied) {
				availablePositions.push({ row, column });
			}
		}
	}

	return availablePositions[Math.floor(random() * availablePositions.length)];
}
