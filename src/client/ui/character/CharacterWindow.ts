const EQUIPMENT_SLOT_SOURCE = "/assets/textures/hud/generals/grid_36.png";
const HANA_IDLE_SOURCE = "/assets/textures/characters/hana/idle.png";
const HANA_IDLE_FRAME_COUNT = 8;
const HANA_IDLE_FRAME_DURATION_MS = 125;
const HANA_IDLE_FRAME_WIDTH = 192;
const EQUIPMENT_SLOTS = [
	{ column: 1, label: "Selo", row: 1 },
	{ column: 2, label: "Acess.", row: 1 },
	{ column: 3, label: "Cabeça", row: 1 },
	{ column: 1, label: "Arma", row: 2 },
	{ column: 2, label: "Acess.", row: 2 },
	{ column: 3, label: "Peito", row: 2 },
	{ column: 3, label: "Calça", row: 3 },
	{ column: 3, label: "Botas", row: 4 },
] as const;
const ATTRIBUTE_NAMES = ["Ataque", "Defesa", "Vida"] as const;

export interface CharacterPosition {
	x: number;
	y: number;
}

interface CharacterWindowOptions {
	initialPosition: CharacterPosition | null;
	onPositionChange: (position: CharacterPosition) => void;
}

export class CharacterWindow {
	readonly element: HTMLElement;
	private readonly closeButton: HTMLButtonElement;
	private currentIdleFrame = 0;
	private readonly header: HTMLElement;
	private dragOffsetX = 0;
	private dragOffsetY = 0;
	private draggingPointerId: number | null = null;
	private hasExplicitPosition = false;
	private idleAnimationTimer: ReturnType<typeof setInterval> | null = null;
	private isOpen = false;
	private readonly onPositionChange: (position: CharacterPosition) => void;
	private preferredPosition: CharacterPosition | null;
	private readonly hanaSprite: HTMLDivElement;
	private dragStartX = 0;
	private dragStartY = 0;
	private readonly closeFromButton = (): void => {
		this.close();
	};
	private readonly keepCloseButtonOutOfDrag = (event: PointerEvent): void => {
		event.stopPropagation();
	};
	private readonly keepInsideViewportAfterResize = (): void => {
		if (!this.hasExplicitPosition || this.element.hidden) return;
		this.placePreferredPositionInsideViewport();
	};
	private readonly moveWhileDragging = (event: PointerEvent): void => {
		if (event.pointerId !== this.draggingPointerId) return;
		this.placeInsideViewport(event.clientX - this.dragOffsetX, event.clientY - this.dragOffsetY);
	};
	private readonly startDragging = (event: PointerEvent): void => {
		if (event.button !== 0 || this.draggingPointerId !== null) return;
		const bounds = this.element.getBoundingClientRect();
		this.dragOffsetX = event.clientX - bounds.left;
		this.dragOffsetY = event.clientY - bounds.top;
		this.dragStartX = Math.round(bounds.left);
		this.dragStartY = Math.round(bounds.top);
		this.draggingPointerId = event.pointerId;
		this.hasExplicitPosition = true;
		this.element.style.position = "fixed";
		this.element.style.right = "auto";
		this.placeInsideViewport(bounds.left, bounds.top);
		this.element.classList.add("character-window--dragging");
		this.header.setPointerCapture(event.pointerId);
	};
	private readonly stopDragging = (event?: PointerEvent): void => {
		if (event && event.pointerId !== this.draggingPointerId) return;
		const pointerId = this.draggingPointerId;
		if (pointerId === null) return;
		this.draggingPointerId = null;
		this.element.classList.remove("character-window--dragging");
		if (this.header.hasPointerCapture(pointerId)) this.header.releasePointerCapture(pointerId);
		if (event) {
			const bounds = this.element.getBoundingClientRect();
			const position = { x: Math.round(bounds.left), y: Math.round(bounds.top) };
			if (position.x !== this.dragStartX || position.y !== this.dragStartY) {
				this.preferredPosition = position;
				this.onPositionChange(position);
			}
		}
	};

	constructor(options: CharacterWindowOptions) {
		this.preferredPosition = options.initialPosition;
		this.onPositionChange = options.onPositionChange;
		this.element = document.createElement("section");
		this.element.className = "character-window";
		this.element.hidden = true;
		this.element.setAttribute("aria-label", "Personagem");

		this.header = document.createElement("header");
		this.header.className = "character-window__header";
		const title = document.createElement("span");
		title.className = "character-window__title";
		title.textContent = "Personagem";
		this.closeButton = document.createElement("button");
		this.closeButton.className = "character-window__close";
		this.closeButton.type = "button";
		this.closeButton.setAttribute("aria-label", "Fechar personagem");
		this.closeButton.textContent = "×";
		this.header.append(title, this.closeButton);

		const body = document.createElement("div");
		body.className = "character-window__body";
		const equipment = this.createEquipmentSection();
		this.hanaSprite = equipment.hanaSprite;
		body.append(equipment.section, this.createAttributesSection());
		this.element.append(this.header, body);

		this.closeButton.addEventListener("click", this.closeFromButton);
		this.closeButton.addEventListener("pointerdown", this.keepCloseButtonOutOfDrag);
		this.header.addEventListener("pointerdown", this.startDragging);
		this.header.addEventListener("pointermove", this.moveWhileDragging);
		this.header.addEventListener("pointerup", this.stopDragging);
		this.header.addEventListener("pointercancel", this.stopDragging);
		window.addEventListener("resize", this.keepInsideViewportAfterResize);
	}

	open(): void {
		this.isOpen = true;
		this.element.hidden = false;
		if (!this.hasExplicitPosition && this.preferredPosition) {
			this.hasExplicitPosition = true;
			this.element.style.position = "fixed";
			this.element.style.right = "auto";
			this.placePreferredPositionInsideViewport();
		} else if (this.hasExplicitPosition) this.placePreferredPositionInsideViewport();
		this.startIdleAnimation();
	}

	close(): void {
		this.stopDragging();
		this.stopIdleAnimation();
		this.isOpen = false;
		this.element.hidden = true;
	}

	toggle(): void {
		if (this.isOpen) this.close();
		else this.open();
	}

	dispose(): void {
		this.close();
		this.closeButton.removeEventListener("click", this.closeFromButton);
		this.closeButton.removeEventListener("pointerdown", this.keepCloseButtonOutOfDrag);
		this.header.removeEventListener("pointerdown", this.startDragging);
		this.header.removeEventListener("pointermove", this.moveWhileDragging);
		this.header.removeEventListener("pointerup", this.stopDragging);
		this.header.removeEventListener("pointercancel", this.stopDragging);
		window.removeEventListener("resize", this.keepInsideViewportAfterResize);
		this.element.remove();
	}

	private createEquipmentSection(): { hanaSprite: HTMLDivElement; section: HTMLElement } {
		const section = document.createElement("section");
		section.className = "character-window__section character-window__equipment";
		const title = document.createElement("h2");
		title.textContent = "Equipamentos";
		const grid = document.createElement("div");
		grid.className = "character-window__equipment-grid";
		for (const { column, label: name, row } of EQUIPMENT_SLOTS) {
			const slot = document.createElement("div");
			slot.className = "character-window__equipment-slot";
			slot.style.gridColumn = String(column);
			slot.style.gridRow = String(row);
			const image = document.createElement("img");
			image.alt = "";
			image.draggable = false;
			image.src = EQUIPMENT_SLOT_SOURCE;
			const label = document.createElement("span");
			label.textContent = name;
			slot.append(image, label);
			grid.append(slot);
		}

		const character = document.createElement("div");
		character.className = "character-window__character-preview";
		const hanaSprite = document.createElement("div");
		hanaSprite.className = "character-window__hana-sprite";
		hanaSprite.setAttribute("aria-label", "Hana");
		hanaSprite.setAttribute("role", "img");
		character.append(hanaSprite);
		grid.append(character);

		section.append(title, grid);

		return { hanaSprite, section };
	}

	private createAttributesSection(): HTMLElement {
		const section = document.createElement("section");
		section.className = "character-window__section character-window__attributes";
		const title = document.createElement("h2");
		title.textContent = "Atributos";
		const list = document.createElement("ul");
		for (const name of ATTRIBUTE_NAMES) {
			const attribute = document.createElement("li");
			attribute.textContent = name;
			list.append(attribute);
		}

		section.append(title, list);

		return section;
	}

	private placePreferredPositionInsideViewport(): void {
		if (!this.preferredPosition) return;
		this.placeInsideViewport(this.preferredPosition.x, this.preferredPosition.y);
	}

	private placeInsideViewport(left: number, top: number): void {
		const bounds = this.element.getBoundingClientRect();
		const maximumLeft = Math.max(0, document.documentElement.clientWidth - bounds.width);
		const maximumTop = Math.max(0, document.documentElement.clientHeight - bounds.height);
		this.element.style.left = `${Math.round(Math.min(Math.max(0, left), maximumLeft))}px`;
		this.element.style.top = `${Math.round(Math.min(Math.max(0, top), maximumTop))}px`;
	}

	private startIdleAnimation(): void {
		this.stopIdleAnimation();
		this.currentIdleFrame = 0;
		this.hanaSprite.style.backgroundImage = `url(${HANA_IDLE_SOURCE})`;
		this.hanaSprite.style.backgroundPositionX = "0px";
		this.idleAnimationTimer = setInterval(() => {
			this.currentIdleFrame = (this.currentIdleFrame + 1) % HANA_IDLE_FRAME_COUNT;
			this.hanaSprite.style.backgroundPositionX = `${-this.currentIdleFrame * HANA_IDLE_FRAME_WIDTH}px`;
		}, HANA_IDLE_FRAME_DURATION_MS);
	}

	private stopIdleAnimation(): void {
		if (this.idleAnimationTimer === null) return;
		clearInterval(this.idleAnimationTimer);
		this.idleAnimationTimer = null;
	}
}
