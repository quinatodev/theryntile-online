import { Backpack, type InventoryPosition } from "./inventory/Backpack.js";
import { InventoryButton } from "./inventory/InventoryButton.js";

/**
 * Lang: pt-BR
 * Compõe os componentes de topo e possui somente o lifecycle da árvore da HUD.
 *
 * Lang: en-US
 * Composes top-level components and owns only the HUD tree lifecycle.
 */
export class UIManager {
	private readonly backpack: Backpack;
	private readonly inventoryButton: InventoryButton;
	private readonly element: HTMLDivElement;
	private disposed = false;

	constructor(
		root: HTMLElement,
		initialInventoryColumns: number,
		initialInventoryPosition: InventoryPosition | null,
		onInventoryColumnsChange: (columns: number) => void,
		onInventoryPositionChange: (position: InventoryPosition) => void,
	) {
		this.element = document.createElement("div");
		this.element.className = "game-ui__layout";
		this.backpack = new Backpack({
			initialColumns: initialInventoryColumns,
			initialPosition: initialInventoryPosition,
			onColumnsChange: onInventoryColumnsChange,
			onPositionChange: onInventoryPositionChange,
		});
		this.inventoryButton = new InventoryButton(() => this.backpack.toggle());
		const backpackRegion = document.createElement("div");
		backpackRegion.className = "game-ui__backpack-region";
		backpackRegion.append(this.backpack.element);
		const inventoryControl = document.createElement("div");
		inventoryControl.className = "game-ui__inventory-control";
		inventoryControl.append(this.inventoryButton.element);
		this.element.append(backpackRegion, inventoryControl);
		root.append(this.element);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.inventoryButton.dispose();
		this.backpack.dispose();
		this.element.remove();
	}
}
