const CHARACTER_ICON_SOURCE = "/assets/textures/hud/icons/character.png";

export class CharacterButton {
	readonly element: HTMLDivElement;
	private readonly button: HTMLButtonElement;
	private readonly handleClick: () => void;

	constructor(onClick: () => void) {
		this.element = document.createElement("div");
		this.element.className = "character-control";
		this.button = document.createElement("button");
		this.button.className = "character-button";
		this.button.type = "button";
		this.button.setAttribute("aria-label", "Personagem");
		const image = document.createElement("img");
		image.alt = "";
		image.draggable = false;
		image.src = CHARACTER_ICON_SOURCE;
		this.button.append(image);
		const label = document.createElement("span");
		label.className = "character-button__label";
		label.textContent = "Personagem";
		this.element.append(this.button, label);
		this.handleClick = onClick;
		this.button.addEventListener("click", this.handleClick);
	}

	dispose(): void {
		this.button.removeEventListener("click", this.handleClick);
		this.element.remove();
	}
}
