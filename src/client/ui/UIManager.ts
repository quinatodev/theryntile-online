import { Backpack, type InventoryPosition } from "./inventory/Backpack.js";
import { InventoryButton } from "./inventory/InventoryButton.js";
import { CharacterButton } from "./character/CharacterButton.js";
import { type CharacterPosition, CharacterWindow } from "./character/CharacterWindow.js";

/**
 * Lang: pt-BR
 * Compõe os componentes de topo e possui somente o lifecycle da árvore da HUD.
 *
 * Lang: en-US
 * Composes top-level components and owns only the HUD tree lifecycle.
 */
export class UIManager {
	private readonly backpack: Backpack;
	private readonly characterButton: CharacterButton;
	private readonly characterWindow: CharacterWindow;
	private readonly inventoryButton: InventoryButton;
	private readonly element: HTMLDivElement;
	private disposed = false;

	constructor(
		root: HTMLElement,
		initialInventoryColumns: number,
		initialInventoryPosition: InventoryPosition | null,
		onInventoryColumnsChange: (columns: number) => void,
		onInventoryPositionChange: (position: InventoryPosition) => void,
		initialCharacterPosition: CharacterPosition | null,
		onCharacterPositionChange: (position: CharacterPosition) => void,
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
		this.characterWindow = new CharacterWindow({
			initialPosition: initialCharacterPosition,
			onPositionChange: onCharacterPositionChange,
		});
		this.characterButton = new CharacterButton(() => this.characterWindow.toggle());
		const backpackRegion = document.createElement("div");
		backpackRegion.className = "game-ui__backpack-region";
		backpackRegion.append(this.backpack.element);
		const characterRegion = document.createElement("div");
		characterRegion.className = "game-ui__character-region";
		characterRegion.append(this.characterWindow.element);
		const controls = document.createElement("div");
		controls.className = "game-ui__controls";
		controls.append(this.characterButton.element, this.inventoryButton.element);
		this.element.append(backpackRegion, characterRegion, controls);
		root.append(this.element);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.inventoryButton.dispose();
		this.backpack.dispose();
		this.characterButton.dispose();
		this.characterWindow.dispose();
		this.element.remove();
	}
}
