/**
 * Modal for adding or editing code block language configurations.
 *
 * Provides form fields for language ID, display name, aliases, icon selection,
 * and color pickers (with opacity) for language, title, and border colors.
 */

import { App, Modal, Plugin } from "obsidian";
import type { CodeBlocksSettings } from "./settings";
import type { CodeBlockLanguageConfig } from "./languages";
import { renderColorPicker, type ColorPickerControls } from "./color-picker";
import { renderIconPickerGrid } from "./ui-components";

// ---------------------------------------------------------------------------
// Plugin type expected by this modal
// ---------------------------------------------------------------------------

type CodeBlocksPluginType = Plugin & {
	settings: CodeBlocksSettings;
	settingsTab?: any;
	saveSettings(): Promise<void>;
	updateCSS(): void;
};

// SFIconManager global type is declared in main.ts

// ---------------------------------------------------------------------------
// Helper: create a labelled text input row
// ---------------------------------------------------------------------------

function createInputRow(
	container: HTMLElement,
	label: string,
	opts?: {
		value?: string;
		placeholder?: string;
		required?: boolean;
	},
): HTMLInputElement {
	const row = container.createDiv("sf-form-row");
	row.createEl("label", { text: label });
	const input = row.createEl("input", {
		type: "text",
		placeholder: opts?.placeholder ?? "",
		value: opts?.value ?? "",
	}) as HTMLInputElement;
	if (opts?.required) {
		input.required = true;
	}
	return input;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export class CodeBlockLanguageModal extends Modal {
	private plugin: CodeBlocksPluginType;
	private editingLanguage: string | undefined;

	constructor(app: App, plugin: CodeBlocksPluginType, language?: string) {
		super(app);
		this.plugin = plugin;
		this.editingLanguage = language;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-codeblock-lang-modal");

		const isEditing = !!this.editingLanguage;
		const existing: CodeBlockLanguageConfig | undefined = isEditing
			? this.plugin.settings.languages[this.editingLanguage!]
			: undefined;

		contentEl.createEl("h2", {
			text: isEditing ? "Edit Language" : "Add Language",
		});

		// -- Language ID --
		const langInput = createInputRow(contentEl, "Language ID", {
			value: this.editingLanguage ?? "",
			placeholder: "e.g. python",
			required: true,
		});

		// -- Display name --
		const displayNameInput = createInputRow(contentEl, "Display name", {
			value: existing?.displayName ?? "",
			placeholder: "e.g. Python (optional)",
		});

		// -- Aliases --
		const aliasesInput = createInputRow(contentEl, "Aliases (comma-separated)", {
			value: existing?.aliases?.join(", ") ?? "",
			placeholder: "e.g. py, python3",
		});

		// -- Icon picker --
		let selectedIconId: string | null = existing?.icon ?? null;
		const iconRow = contentEl.createDiv("sf-form-row");
		iconRow.createEl("label", { text: "Icon" });
		const iconContainer = iconRow.createDiv();

		const icons = window.SFIconManager?.getIcons() ?? [];
		renderIconPickerGrid({
			container: iconContainer,
			icons,
			selectedId: selectedIconId,
			onChange: (id: string | null) => {
				selectedIconId = id;
			},
		});

		// -- Icon size --
		const iconSizeInput = createInputRow(contentEl, "Icon size", {
			value: existing?.iconSize != null ? String(existing.iconSize) : "",
			placeholder: 'e.g. 120% or 1.1 (optional)',
		});

		// -- Color pickers --
		let languageColorPicker: ColorPickerControls;
		let titleColorPicker: ColorPickerControls;
		let borderColorPicker: ColorPickerControls;

		languageColorPicker = renderColorPicker({
			container: contentEl,
			label: "Language color",
			value: existing?.languageColor ?? existing?.color ?? "",
			onChange: () => {},
			placeholder: "#RRGGBB or #RRGGBBAA",
			cssPrefix: "cb",
		});

		titleColorPicker = renderColorPicker({
			container: contentEl,
			label: "Title color",
			value: existing?.titleColor ?? "",
			onChange: () => {},
			placeholder: "#RRGGBB or #RRGGBBAA",
			cssPrefix: "cb",
		});

		borderColorPicker = renderColorPicker({
			container: contentEl,
			label: "Border color",
			value: existing?.borderColor ?? "",
			onChange: () => {},
			placeholder: "#RRGGBB or #RRGGBBAA",
			cssPrefix: "cb",
		});

		// -- Action buttons --
		const actions = contentEl.createDiv("sf-modal-actions");

		const cancelBtn = actions.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		const saveBtn = actions.createEl("button", {
			text: isEditing ? "Save" : "Add",
			cls: "mod-cta",
		});
		saveBtn.addEventListener("click", async () => {
			const rawKey = langInput.value.trim().toLowerCase();
			if (!rawKey) {
				langInput.focus();
				return;
			}

			// Parse aliases
			const aliasStr = aliasesInput.value.trim();
			const aliases: string[] = aliasStr
				? aliasStr
						.split(",")
						.map((a) => a.trim().toLowerCase())
						.filter((a) => a.length > 0)
				: [];

			const newConfig: CodeBlockLanguageConfig = {
				languageColor: languageColorPicker.getValue() || null,
				titleColor: titleColorPicker.getValue() || null,
				borderColor: borderColorPicker.getValue() || null,
				icon: selectedIconId || null,
				displayName: displayNameInput.value.trim() || null,
				aliases,
				iconSize: iconSizeInput.value.trim() || null,
				color: languageColorPicker.getValue() || null,
			};

			// If editing and the key changed, remove the old entry
			if (
				isEditing &&
				this.editingLanguage &&
				this.editingLanguage !== rawKey
			) {
				delete this.plugin.settings.languages[this.editingLanguage];
			}

			this.plugin.settings.languages[rawKey] = newConfig;
			await this.plugin.saveSettings();
			this.plugin.updateCSS();
			this.close();

			if (this.plugin.settingsTab) {
				this.plugin.settingsTab.display();
			}
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
