const INVENTORY_ICON_SOURCE = "/assets/textures/hud/icons/inventory.png";

export class InventoryButton {
	readonly element: HTMLDivElement;
	private readonly button: HTMLButtonElement;
	private readonly handleClick: () => void;

	constructor(onClick: () => void) {
		this.element = document.createElement("div");
		this.element.className = "inventory-control";
		this.button = document.createElement("button");
		this.button.className = "inventory-button";
		this.button.type = "button";
		this.button.setAttribute("aria-label", "Inventário");
		const image = document.createElement("img");
		image.alt = "";
		image.draggable = false;
		image.src = INVENTORY_ICON_SOURCE;
		this.button.append(image);
		const label = document.createElement("span");
		label.className = "inventory-button__label";
		label.textContent = "Inventário";
		this.element.append(this.button, label);
		this.handleClick = onClick;
		this.button.addEventListener("click", this.handleClick);
	}

	dispose(): void {
		this.button.removeEventListener("click", this.handleClick);
		this.element.remove();
	}
}
