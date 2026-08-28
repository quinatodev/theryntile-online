/**
 * Lang: pt-BR
 * Mantém primitivas de canvas independentes do gameplay e preserva uma base lógica 640x360
 * enquanto expande um eixo para acompanhar a proporção do viewport.
 *
 * Lang: en-US
 * Provides gameplay-independent canvas primitives and preserves a 640x360 logical base
 * while expanding one axis to match the viewport aspect ratio.
 */
export const BASE_WIDTH = 640;
export const BASE_HEIGHT = 360;

export interface CanvasSurface {
	element: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
}

export interface LogicalCanvasSize {
	width: number;
	height: number;
}

/**
 * Lang: pt-BR
 * Calcula dimensões lógicas positivas que cobrem o viewport sem distorcer a proporção base.
 *
 * Lang: en-US
 * Calculates positive logical dimensions that cover the viewport without distorting the base aspect ratio.
 */
export function getLogicalCanvasSize(viewportWidth: number, viewportHeight: number): LogicalCanvasSize {
	if (viewportWidth <= 0 || viewportHeight <= 0) {
		throw new Error("Viewport dimensions must be positive.");
	}

	const baseAspect = BASE_WIDTH / BASE_HEIGHT;
	const viewportAspect = viewportWidth / viewportHeight;

	if (viewportAspect > baseAspect) {
		return {
			width: Math.round(BASE_HEIGHT * viewportAspect),
			height: BASE_HEIGHT,
		};
	}

	if (viewportAspect < baseAspect) {
		return {
			width: BASE_WIDTH,
			height: Math.round(BASE_WIDTH / viewportAspect),
		};
	}

	return { width: BASE_WIDTH, height: BASE_HEIGHT };
}

/**
 * Lang: pt-BR
 * Redimensiona o buffer lógico do canvas para o viewport e restaura opções adequadas a pixel art.
 * Alterar width/height limpa o contexto, portanto esta função também prepara a próxima renderização.
 *
 * Lang: en-US
 * Resizes the canvas logical buffer to the viewport and restores pixel-art rendering options.
 * Changing width/height clears the context, so this function also prepares the next render.
 */
export function resizeCanvasToViewport(
	{ element, context }: CanvasSurface,
	viewportWidth = window.innerWidth,
	viewportHeight = window.innerHeight,
): void {
	const size = getLogicalCanvasSize(viewportWidth, viewportHeight);

	element.width = size.width;
	element.height = size.height;
	context.imageSmoothingEnabled = false;
	context.clearRect(0, 0, size.width, size.height);
}

/**
 * Lang: pt-BR
 * Obtém o contexto 2D e prepara imediatamente uma CanvasSurface dimensionada para o viewport.
 *
 * Lang: en-US
 * Obtains the 2D context and immediately prepares a CanvasSurface sized for the viewport.
 */
export function prepareCanvas(element: HTMLCanvasElement): CanvasSurface {
	const context = element.getContext("2d");

	if (!context) {
		throw new Error("Canvas 2D is not available.");
	}

	const surface = { element, context };
	resizeCanvasToViewport(surface);

	return surface;
}
