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

export interface GridPosition {
	row: number;
	column: number;
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

/**
 * Lang: pt-BR
 * Identifica o tile cujo diamond contém o ponto do mundo ou retorna undefined fora do footprint.
 * A inversa usa o centro vertical do diamond para corresponder à origem superior de gridToIsometric().
 *
 * Lang: en-US
 * Identifies the tile whose diamond contains the world point or returns undefined outside its footprint.
 * The inverse uses the diamond vertical center to match gridToIsometric()'s top origin.
 */
export function worldToGrid(
	worldX: number,
	worldY: number,
	tileWidth: number,
	tileFootprintHeight: number,
): GridPosition | undefined {
	const projectedY = worldY - tileFootprintHeight / 2;
	const column = Math.round(worldX / tileWidth + projectedY / tileFootprintHeight);
	const row = Math.round(projectedY / tileFootprintHeight - worldX / tileWidth);
	const candidate = gridToIsometric(column, row, tileWidth, tileFootprintHeight);
	const centerY = candidate.y + tileFootprintHeight / 2;
	const distance = Math.abs(worldX - candidate.x) / (tileWidth / 2)
		+ Math.abs(worldY - centerY) / (tileFootprintHeight / 2);

	return distance <= 1 ? { row, column } : undefined;
}
