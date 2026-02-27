import { PluginSettingTab, App, Notice, Setting } from "obsidian";
import type { Plugin } from "obsidian";
import type { CodeBlocksSettings } from "./settings";
import type { CodeBlockLanguageConfig, CodeBlockLanguages, LanguageIcon } from "./languages";
import { isHexColor } from "./utils";
import { applyIconZoomStyles, getCodeBlockIconSizeValue } from "./header";
import { renderHighlighterTab } from "./highlighter/settings-ui";
import { reloadHighlighter } from "./highlighter/register";

type CodeBlocksPluginType = Plugin & {
	settings: CodeBlocksSettings;
	settingsTab?: CodeBlocksSettingTab;
	codeBlockStyleEl?: HTMLStyleElement;
	highlighterStyleEl?: HTMLStyleElement;
	calloutCodeBlockObserver?: MutationObserver;
	saveSettings(): Promise<void>;
	updateCSS(): void;
	refreshActiveMarkdownPreview(): void;
};

type TabId = "general" | "languages" | "css" | "highlighting";

interface TabDefinition {
	id: TabId;
	label: string;
}

const TABS: TabDefinition[] = [
	{ id: "general", label: "General" },
	{ id: "languages", label: "Languages" },
	{ id: "css", label: "Custom CSS" },
	{ id: "highlighting", label: "Syntax Highlighting" },
];

export class CodeBlocksSettingTab extends PluginSettingTab {
	plugin: CodeBlocksPluginType;
	private activeTab: TabId = "general";

	constructor(app: App, plugin: CodeBlocksPluginType) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Tab bar
		const tabBar = containerEl.createDiv("sf-tab-bar");
		for (const tab of TABS) {
			const btn = tabBar.createEl("button", {
				text: tab.label,
				cls: "sf-tab-button",
			});
			if (tab.id === this.activeTab) {
				btn.addClass("sf-tab-button-active");
			}
			btn.addEventListener("click", () => {
				this.activeTab = tab.id;
				this.display();
			});
		}

		// Tab content
		const contentEl = containerEl.createDiv("sf-tab-content");

		switch (this.activeTab) {
			case "general":
				this.renderGeneralTab(contentEl);
				break;
			case "languages":
				this.renderLanguagesTab(contentEl);
				break;
			case "css":
				this.renderCustomCSSTab(contentEl);
				break;
			case "highlighting":
				renderHighlighterTab({
					plugin: this.plugin,
					contentEl,
					rerender: () => this.display(),
				});
				break;
		}
	}

	// -----------------------------------------------------------------------
	// General Tab
	// -----------------------------------------------------------------------

	private renderGeneralTab(contentEl: HTMLElement): void {
		const plugin = this.plugin;
		const settings = plugin.settings;

		new Setting(contentEl).setName("General settings").setHeading();
		contentEl.createEl("p", {
			text: "Core options for code block decoration in reading and live preview modes.",
			cls: "sf-hint",
		});

		new Setting(contentEl)
			.setName("Enable Code Blocks")
			.setDesc("Enable the code blocks plugin to decorate fenced code blocks in reading and live preview modes. Requires a restart to fully apply.")
			.addToggle((toggle) =>
				toggle.setValue(settings.enabled).onChange(async (value) => {
					settings.enabled = value;
					await plugin.saveSettings();
					plugin.updateCSS();
					new Notice(`Code Blocks plugin ${value ? "enabled" : "disabled"}. Restart Obsidian for full effect.`);
				})
			);

		new Setting(contentEl)
			.setName("Show Line Numbers")
			.setDesc("Display line numbers alongside code blocks.")
			.addToggle((toggle) =>
				toggle.setValue(settings.showLineNumbers).onChange(async (value) => {
					settings.showLineNumbers = value;
					await plugin.saveSettings();
					document.body.classList.toggle("sf-show-line-numbers", value);
				})
			);

		new Setting(contentEl)
			.setName("Show Copy Button")
			.setDesc("Display a copy-to-clipboard button in the code block header.")
			.addToggle((toggle) =>
				toggle.setValue(settings.showCopyButton).onChange(async (value) => {
					settings.showCopyButton = value;
					await plugin.saveSettings();
					plugin.updateCSS();
				})
			);

		// Background color
		new Setting(contentEl).setName("Background color").setHeading();

		let colorInput: HTMLInputElement;
		let textInput: HTMLInputElement;

		new Setting(contentEl)
			.setName("Code Block Background")
			.setDesc("Set a custom background color for all code blocks. Leave empty to use the theme default.")
			.addColorPicker((picker) => {
				picker.setValue(isHexColor(settings.backgroundColor) ? settings.backgroundColor : "#282a36");
				picker.onChange(async (value) => {
					settings.backgroundColor = value;
					if (textInput) textInput.value = value;
					await plugin.saveSettings();
					plugin.updateCSS();
				});
			})
			.addText((text) => {
				textInput = text.inputEl;
				text.setPlaceholder("#RRGGBB")
					.setValue(settings.backgroundColor || "")
					.onChange(async (value) => {
						const val = value.trim();
						if (val === "" || isHexColor(val)) {
							settings.backgroundColor = val;
							await plugin.saveSettings();
							plugin.updateCSS();
						}
					});
				text.inputEl.style.width = "100px";
				text.inputEl.style.fontFamily = "var(--font-monospace)";
			})
			.addButton((btn) =>
				btn.setButtonText("Reset").onClick(async () => {
					settings.backgroundColor = "";
					if (textInput) textInput.value = "";
					await plugin.saveSettings();
					plugin.updateCSS();
					this.display();
				})
			);

		// Ignore languages
		new Setting(contentEl).setName("Ignore languages").setHeading();

		let ignoreInput: HTMLInputElement;

		new Setting(contentEl)
			.setName("Ignored Languages")
			.setDesc("Comma-separated list of languages to exclude from decoration (e.g., mermaid, my-toc).")
			.addText((text) => {
				ignoreInput = text.inputEl;
				text.setPlaceholder("mermaid, my-toc")
					.setValue(settings.ignoreLanguages.join(", "));
				text.inputEl.style.width = "180px";
			})
			.addButton((btn) =>
				btn.setButtonText("Save").onClick(async () => {
					const raw = ignoreInput.value;
					const parsed = raw
						.split(",")
						.map((s) => s.trim())
						.filter((s) => s.length > 0);
					settings.ignoreLanguages = parsed;
					ignoreInput.value = parsed.join(", ");
					await plugin.saveSettings();
					renderIgnoreTags();
					new Notice("Ignored languages updated.");
				})
			);

		// Tags container for current ignore list
		const tagsContainer = contentEl.createDiv("sf-tags-container");

		const renderIgnoreTags = (): void => {
			tagsContainer.empty();
			for (const lang of settings.ignoreLanguages) {
				const tag = tagsContainer.createDiv("sf-tag");
				tag.createSpan({ text: lang, cls: "sf-tag-text" });
				const deleteBtn = tag.createEl("button", {
					text: "x",
					cls: "sf-tag-delete",
					attr: { type: "button", "aria-label": `Remove ${lang}` },
				});
				deleteBtn.addEventListener("click", async () => {
					settings.ignoreLanguages = settings.ignoreLanguages.filter(
						(l) => l !== lang,
					);
					ignoreInput.value = settings.ignoreLanguages.join(", ");
					await plugin.saveSettings();
					renderIgnoreTags();
				});
			}
		};

		renderIgnoreTags();
	}

	// -----------------------------------------------------------------------
	// Languages Tab
	// -----------------------------------------------------------------------

	private renderLanguagesTab(contentEl: HTMLElement): void {
		const plugin = this.plugin;
		const settings = plugin.settings;

		new Setting(contentEl).setName("Language configuration").setHeading();
		contentEl.createEl("p", {
			text: "Configure display names, colors, icons, and aliases for each language.",
			cls: "sf-hint",
		});

		// Add language button
		const toolbar = contentEl.createDiv("sf-lang-toolbar");
		const addBtn = toolbar.createEl("button", {
			text: "Add Language",
			cls: "sf-add-btn",
			attr: { type: "button" },
		});
		addBtn.addEventListener("click", () => {
			const langKey = prompt("Enter the language key (e.g., python, javascript):");
			if (!langKey) return;
			const key = langKey.trim().toLowerCase();
			if (!key) return;
			if (settings.languages[key]) {
				new Notice(`Language "${key}" already exists.`);
				return;
			}
			settings.languages[key] = {
				languageColor: "#6c757d",
				titleColor: null,
				borderColor: null,
				icon: null,
				displayName: key.charAt(0).toUpperCase() + key.slice(1),
				aliases: [],
			};
			plugin.saveSettings().then(() => {
				plugin.updateCSS();
				this.display();
			});
		});

		// Search input
		const searchContainer = contentEl.createDiv("sf-lang-search-container");
		const searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search languages...",
			cls: "sf-lang-search",
		}) as HTMLInputElement;

		// Language list container
		const listContainer = contentEl.createDiv("sf-lang-list-container");

		const renderLanguageList = (filter: string): void => {
			listContainer.empty();

			const entries = Object.entries(settings.languages);
			const filterLower = filter.toLowerCase();
			const filtered = filter
				? entries.filter(([key, config]) => {
						const displayName = (config.displayName || key).toLowerCase();
						const aliases = (config.aliases || []).join(" ").toLowerCase();
						return (
							key.toLowerCase().includes(filterLower) ||
							displayName.includes(filterLower) ||
							aliases.includes(filterLower)
						);
					})
				: entries;

			if (filtered.length === 0) {
				listContainer.createEl("p", {
					text: filter ? "No languages match your search." : "No languages configured.",
					cls: "sf-empty-message",
				});
				return;
			}

			const countEl = listContainer.createEl("p", {
				cls: "sf-lang-count",
			});
			countEl.setText(`Showing ${filtered.length} of ${entries.length} languages`);

			for (const [key, config] of filtered) {
				const item = listContainer.createDiv("sf-lang-item");

				// Icon preview
				const iconPreview = item.createDiv("sf-lang-icon-preview");
				const iconsList = (
					(window as any).SFIconManager?.getIcons() ?? []
				) as LanguageIcon[];
				if (config.icon) {
					const icon = iconsList.find((i) => i.id === config.icon);
					if (icon) {
						const iconSizeRaw = config.iconSize || icon.backgroundSize || null;
						const iconSizeValue = getCodeBlockIconSizeValue(iconSizeRaw);
						if (icon.isColored) {
							iconPreview.style.backgroundImage = icon.dataUrl;
							iconPreview.style.backgroundSize = iconSizeValue;
							iconPreview.style.backgroundRepeat = "no-repeat";
							iconPreview.style.backgroundPosition = "center";
						} else {
							iconPreview.style.setProperty("-webkit-mask-image", icon.dataUrl);
							iconPreview.style.setProperty("mask-image", icon.dataUrl);
							iconPreview.style.setProperty("-webkit-mask-size", iconSizeValue);
							iconPreview.style.setProperty("mask-size", iconSizeValue);
							iconPreview.style.setProperty("-webkit-mask-repeat", "no-repeat");
							iconPreview.style.setProperty("mask-repeat", "no-repeat");
							iconPreview.style.setProperty("-webkit-mask-position", "center");
							iconPreview.style.setProperty("mask-position", "center");
							iconPreview.style.backgroundColor =
								config.languageColor || config.color || "#6c757d";
						}
						applyIconZoomStyles(iconPreview, iconSizeRaw);
					}
				}

				// Info section
				const infoSection = item.createDiv("sf-lang-info");

				const nameRow = infoSection.createDiv("sf-lang-name-row");
				nameRow.createEl("strong", {
					text: config.displayName || key,
				});
				if (config.aliases && config.aliases.length > 0) {
					nameRow.createSpan({
						text: ` (${config.aliases.join(", ")})`,
						cls: "sf-lang-aliases",
					});
				}

				const detailRow = infoSection.createDiv("sf-lang-detail-row");

				// Language color swatch
				const langColor = config.languageColor || config.color || "#6c757d";
				const langSwatch = detailRow.createSpan("sf-color-swatch-small");
				langSwatch.style.backgroundColor = langColor;
				detailRow.createSpan({
					text: langColor,
					cls: "sf-lang-color-hex",
				});

				// Border color swatch
				const borderColor = config.borderColor || langColor;
				const borderSwatch = detailRow.createSpan("sf-color-swatch-small sf-border-swatch");
				borderSwatch.style.backgroundColor = borderColor;
				detailRow.createSpan({
					text: `border: ${borderColor}`,
					cls: "sf-lang-color-hex",
				});

				// Icon name
				if (config.icon) {
					detailRow.createSpan({
						text: `icon: ${config.icon}`,
						cls: "sf-lang-icon-name",
					});
				}

				// Action buttons
				const actions = item.createDiv("sf-lang-actions");

				const editBtn = actions.createEl("button", {
					text: "Edit",
					cls: "sf-edit-btn",
					attr: { type: "button" },
				});
				editBtn.addEventListener("click", () => {
					this.openLanguageEditor(key, config);
				});

				const deleteBtn = actions.createEl("button", {
					text: "Delete",
					cls: "sf-delete-btn",
					attr: { type: "button" },
				});
				deleteBtn.addEventListener("click", async () => {
					const confirmed = confirm(
						`Delete language "${config.displayName || key}"? This cannot be undone.`,
					);
					if (!confirmed) return;
					delete settings.languages[key];
					await plugin.saveSettings();
					plugin.updateCSS();
					renderLanguageList(searchInput.value);
				});
			}
		};

		searchInput.addEventListener("input", () => {
			renderLanguageList(searchInput.value);
		});

		renderLanguageList("");
	}

	private openLanguageEditor(key: string, config: CodeBlockLanguageConfig): void {
		// Dynamic import to avoid circular dependency issues at load time.
		// The CodeBlockLanguageModal is expected to be available in language-modal.ts.
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const { CodeBlockLanguageModal } = require("./language-modal");
			const modal = new CodeBlockLanguageModal(this.app, this.plugin, {
				key,
				config,
				onSave: async (updatedConfig: CodeBlockLanguageConfig) => {
					this.plugin.settings.languages[key] = updatedConfig;
					await this.plugin.saveSettings();
					this.plugin.updateCSS();
					this.display();
				},
			});
			modal.open();
		} catch {
			// Fallback: if the modal module is not available yet, show a notice
			new Notice("Language editor modal is not available. Edit the language configuration manually.");
		}
	}

	// -----------------------------------------------------------------------
	// Custom CSS Tab
	// -----------------------------------------------------------------------

	private renderCustomCSSTab(contentEl: HTMLElement): void {
		const plugin = this.plugin;
		const settings = plugin.settings;

		new Setting(contentEl).setName("Custom CSS").setHeading();
		contentEl.createEl("p", {
			text: "Add custom CSS to override code block styles. Changes are applied when you click Save.",
			cls: "sf-hint",
		});

		// Help toggle
		const helpToggle = contentEl.createEl("button", {
			text: "Show CSS Variables Reference",
			cls: "sf-help-toggle",
			attr: { type: "button" },
		});

		const helpContent = contentEl.createDiv("sf-help-content");
		helpContent.style.display = "none";

		new Setting(helpContent).setName("Available CSS variables").setHeading();
		const varList = helpContent.createEl("ul", { cls: "sf-css-var-list" });
		const cssVars: [string, string][] = [
			["--sf-cb-language-color", "The primary color for the language (header text, icon tint)"],
			["--sf-cb-title-color", "Color for the title text in the header"],
			["--sf-cb-border-color", "Left border color of the code block"],
			["--sf-cb-background", "Background color of the code block"],
		];
		for (const [varName, desc] of cssVars) {
			const li = varList.createEl("li");
			li.createEl("code", { text: varName });
			li.createSpan({ text: ` - ${desc}` });
		}

		new Setting(helpContent).setName("Useful selectors").setHeading();
		const selectorList = helpContent.createEl("ul", { cls: "sf-css-selector-list" });
		const selectors: [string, string][] = [
			[".sf-codeblock-wrapper", "Outer wrapper for each decorated code block"],
			[".sf-codeblock-header", "The header bar containing language name and copy button"],
			[".sf-codeblock-language", "The language name text element"],
			[".sf-codeblock-title", "The title text element"],
			[".sf-codeblock-icon", "The language icon element"],
			[".sf-codeblock-pre", "The pre element containing code"],
			[".sf-codeblock-line", "Individual line wrapper"],
			[".sf-codeblock-line-number", "Line number element"],
			[".sf-codeblock-line-highlighted", "Highlighted line"],
			[".sf-codeblock-copy", "Copy button element"],
		];
		for (const [sel, desc] of selectors) {
			const li = selectorList.createEl("li");
			li.createEl("code", { text: sel });
			li.createSpan({ text: ` - ${desc}` });
		}

		let helpVisible = false;
		helpToggle.addEventListener("click", () => {
			helpVisible = !helpVisible;
			helpContent.style.display = helpVisible ? "block" : "none";
			helpToggle.textContent = helpVisible
				? "Hide CSS Variables Reference"
				: "Show CSS Variables Reference";
		});

		// CSS textarea
		const textarea = contentEl.createEl("textarea", {
			cls: "sf-css-textarea",
			attr: {
				rows: "20",
				spellcheck: "false",
				placeholder: "/* Enter your custom CSS here */",
			},
		}) as HTMLTextAreaElement;
		textarea.value = settings.customCSS || "";

		// Action buttons
		const actionRow = contentEl.createDiv("sf-css-actions");

		const saveBtn = actionRow.createEl("button", {
			text: "Save CSS",
			cls: "sf-save-btn",
			attr: { type: "button" },
		});
		saveBtn.addEventListener("click", async () => {
			settings.customCSS = textarea.value;
			await plugin.saveSettings();
			plugin.updateCSS();
			new Notice("Custom CSS saved and applied.");
		});

		const importBtn = actionRow.createEl("button", {
			text: "Import from Snippet File",
			cls: "sf-import-btn",
			attr: { type: "button" },
		});
		importBtn.addEventListener("click", async () => {
			const fileInput = document.createElement("input");
			fileInput.type = "file";
			fileInput.accept = ".css";
			fileInput.addEventListener("change", async () => {
				const file = fileInput.files?.[0];
				if (!file) return;
				try {
					const text = await file.text();
					textarea.value = text;
					settings.customCSS = text;
					await plugin.saveSettings();
					plugin.updateCSS();
					new Notice(`Imported CSS from ${file.name}.`);
				} catch {
					new Notice("Failed to read the CSS file.");
				}
			});
			fileInput.click();
		});
	}

}
