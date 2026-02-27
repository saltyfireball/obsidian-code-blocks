import { Setting } from "obsidian";
import type { Plugin } from "obsidian";
import type { CodeBlocksSettings } from "../settings";
import { listLanguages, HIGHLIGHTER_THEMES, type HighlighterTheme } from "./index";
import { reloadHighlighter } from "./register";

type CodeBlocksPluginType = Plugin & {
	settings: CodeBlocksSettings;
	highlighterStyleEl?: HTMLStyleElement;
	refreshActiveMarkdownPreview(): void;
	saveSettings(): Promise<void>;
};

interface HighlighterSettingsParams {
	plugin: CodeBlocksPluginType;
	contentEl: HTMLElement;
	rerender: () => void;
}

export function renderHighlighterTab({ plugin, contentEl, rerender }: HighlighterSettingsParams) {
	new Setting(contentEl).setName("Syntax highlighting").setHeading();
	contentEl.createEl("p", {
		text: "Use highlight.js to provide consistent syntax highlighting across preview and live preview modes. Changes apply immediately without restart.",
		cls: "sf-hint",
	});

	const settings = plugin.settings.highlighter;

	new Setting(contentEl)
		.setName("Enable syntax highlighting")
		.setDesc("Replace the default prism.js highlighting with highlight.js.")
		.addToggle((toggle) =>
			toggle
				.setValue(settings.enabled)
				.onChange(async (value) => {
					settings.enabled = value;
					await plugin.saveSettings();
					reloadHighlighter(plugin);
					rerender();
				})
		);

	new Setting(contentEl)
		.setName("Theme")
		.setDesc("Choose a color theme for syntax highlighting. Changes apply immediately.")
		.addDropdown((dropdown) => {
			HIGHLIGHTER_THEMES.forEach((theme) => {
				dropdown.addOption(theme.id, theme.name);
			});
			dropdown.setValue(settings.theme);
			dropdown.onChange(async (value) => {
				settings.theme = value as HighlighterTheme;
				await plugin.saveSettings();
				reloadHighlighter(plugin);
			});
		});

	new Setting(contentEl)
		.setName("Auto-detect language")
		.setDesc("Attempt to detect the language of code blocks that don't specify one. May produce false positives.")
		.addToggle((toggle) =>
			toggle
				.setValue(settings.autoDetect)
				.onChange(async (value) => {
					settings.autoDetect = value;
					await plugin.saveSettings();
					reloadHighlighter(plugin);
				})
		);

	new Setting(contentEl).setName("Supported languages").setHeading();
	contentEl.createEl("p", {
		text: "The following languages are supported by highlight.js. Use these names in your code block fence (e.g., ```javascript).",
		cls: "sf-hint",
	});

	const languages = listLanguages().sort();

	const searchContainer = contentEl.createDiv("sf-lang-search-container");
	const searchInput = searchContainer.createEl("input", {
		type: "text",
		placeholder: "Filter languages...",
		cls: "sf-lang-search",
	});

	const langGrid = contentEl.createDiv("sf-lang-grid");

	const renderLanguages = (filter: string) => {
		langGrid.empty();
		const filtered = filter
			? languages.filter((lang) => lang.toLowerCase().includes(filter.toLowerCase()))
			: languages;

		if (filtered.length === 0) {
			langGrid.createEl("p", {
				text: "No languages match your filter.",
				cls: "sf-empty-message",
			});
			return;
		}

		const countEl = langGrid.createEl("p", {
			cls: "sf-lang-count",
		});
		countEl.setText(`Showing ${filtered.length} of ${languages.length} languages`);

		const grid = langGrid.createDiv("sf-lang-list");
		for (const lang of filtered) {
			const langEl = grid.createDiv("sf-lang-item");
			langEl.createEl("code", { text: lang });
		}
	};

	searchInput.addEventListener("input", () => {
		renderLanguages(searchInput.value);
	});

	renderLanguages("");

	if (settings.enabled) {
		const statusEl = contentEl.createDiv("sf-highlighter-status sf-highlighter-enabled");
		statusEl.createEl("span", { text: "Syntax highlighting is active", cls: "sf-status-text" });
	} else {
		const statusEl = contentEl.createDiv("sf-highlighter-status sf-highlighter-disabled");
		statusEl.createEl("span", { text: "Syntax highlighting is disabled", cls: "sf-status-text" });
	}
}
