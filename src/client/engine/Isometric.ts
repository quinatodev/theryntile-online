/**
 * Lang: pt-BR
 * Converte column/row do grid em um ponto no mundo isométrico antes da transformação da Camera.
 *
 * Lang: en-US
 * Converts grid column/row into an isometric world point before the Camera transformation.
 */
export interface IsometricPoint {
	x: number;
	y: number;
}

/**
 * Lang: pt-BR
 * Projeta uma posição discreta do grid no plano isométrico usando as dimensões do tile.
 *
 * Lang: en-US
 * Projects a discrete grid position onto the isometric plane using tile dimensions.
 */
export function gridToIsometric(
	column: number,
	row: number,
	tileWidth: number,
	tileFootprintHeight: number,
): IsometricPoint {
	return {
		x: (column - row) * (tileWidth / 2),
		y: (column + row) * (tileFootprintHeight / 2),
	};
}
