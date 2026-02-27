import { PluginSettingTab, App, Notice } from "obsidian";
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

		contentEl.createEl("h2", { text: "General Settings" });

		// Enable toggle
		this.createToggleSetting(contentEl, {
			name: "Enable Code Blocks",
			desc: "Enable the code blocks plugin to decorate fenced code blocks in reading and live preview modes. Requires a restart to fully apply.",
			value: settings.enabled,
			onChange: async (value: boolean) => {
				settings.enabled = value;
				await plugin.saveSettings();
				plugin.updateCSS();
				new Notice(`Code Blocks plugin ${value ? "enabled" : "disabled"}. Restart Obsidian for full effect.`);
			},
		});

		// Line numbers toggle
		this.createToggleSetting(contentEl, {
			name: "Show Line Numbers",
			desc: "Display line numbers alongside code blocks.",
			value: settings.showLineNumbers,
			onChange: async (value: boolean) => {
				settings.showLineNumbers = value;
				await plugin.saveSettings();
				document.body.classList.toggle("sf-show-line-numbers", value);
			},
		});

		// Copy button toggle
		this.createToggleSetting(contentEl, {
			name: "Show Copy Button",
			desc: "Display a copy-to-clipboard button in the code block header.",
			value: settings.showCopyButton,
			onChange: async (value: boolean) => {
				settings.showCopyButton = value;
				await plugin.saveSettings();
				plugin.updateCSS();
			},
		});

		// Background color
		contentEl.createEl("h3", { text: "Background Color" });

		const bgItem = contentEl.createDiv("sf-setting-item");
		const bgInfo = bgItem.createDiv("sf-setting-info");
		bgInfo.createDiv({ text: "Code Block Background", cls: "sf-setting-name" });
		bgInfo.createDiv({
			text: "Set a custom background color for all code blocks. Leave empty to use the theme default.",
			cls: "sf-setting-desc",
		});

		const bgControl = bgItem.createDiv("sf-setting-control");

		const colorInput = bgControl.createEl("input", {
			type: "color",
			cls: "sf-color-input",
		}) as HTMLInputElement;
		colorInput.value = isHexColor(settings.backgroundColor) ? settings.backgroundColor : "#282a36";

		const textInput = bgControl.createEl("input", {
			type: "text",
			cls: "sf-text-input",
			placeholder: "#RRGGBB",
			value: settings.backgroundColor || "",
		}) as HTMLInputElement;

		const resetBtn = bgControl.createEl("button", {
			text: "Reset",
			cls: "sf-reset-btn",
			attr: { type: "button" },
		});

		colorInput.addEventListener("input", async () => {
			const val = colorInput.value;
			textInput.value = val;
			settings.backgroundColor = val;
			await plugin.saveSettings();
			plugin.updateCSS();
		});

		textInput.addEventListener("change", async () => {
			const val = textInput.value.trim();
			if (val === "" || isHexColor(val)) {
				settings.backgroundColor = val;
				if (isHexColor(val)) {
					colorInput.value = val;
				}
				await plugin.saveSettings();
				plugin.updateCSS();
			} else {
				new Notice("Invalid color. Use #RRGGBB format.");
				textInput.value = settings.backgroundColor;
			}
		});

		resetBtn.addEventListener("click", async () => {
			settings.backgroundColor = "";
			textInput.value = "";
			colorInput.value = "#282a36";
			await plugin.saveSettings();
			plugin.updateCSS();
		});

		// Ignore languages
		contentEl.createEl("h3", { text: "Ignore Languages" });

		const ignoreItem = contentEl.createDiv("sf-setting-item");
		const ignoreInfo = ignoreItem.createDiv("sf-setting-info");
		ignoreInfo.createDiv({ text: "Ignored Languages", cls: "sf-setting-name" });
		ignoreInfo.createDiv({
			text: "Comma-separated list of languages to exclude from decoration (e.g., mermaid, my-toc).",
			cls: "sf-setting-desc",
		});

		const ignoreControl = ignoreItem.createDiv("sf-setting-control");

		const ignoreInput = ignoreControl.createEl("input", {
			type: "text",
			cls: "sf-text-input sf-ignore-input",
			placeholder: "mermaid, my-toc",
			value: settings.ignoreLanguages.join(", "),
		}) as HTMLInputElement;

		const ignoreSaveBtn = ignoreControl.createEl("button", {
			text: "Save",
			cls: "sf-save-btn",
			attr: { type: "button" },
		});

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

		ignoreSaveBtn.addEventListener("click", async () => {
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
		});

		renderIgnoreTags();
	}

	// -----------------------------------------------------------------------
	// Languages Tab
	// -----------------------------------------------------------------------

	private renderLanguagesTab(contentEl: HTMLElement): void {
		const plugin = this.plugin;
		const settings = plugin.settings;

		contentEl.createEl("h2", { text: "Language Configuration" });
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

		contentEl.createEl("h2", { text: "Custom CSS" });
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

		helpContent.createEl("h4", { text: "Available CSS Variables" });
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

		helpContent.createEl("h4", { text: "Useful Selectors" });
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

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	private createToggleSetting(
		container: HTMLElement,
		opts: {
			name: string;
			desc: string;
			value: boolean;
			onChange: (value: boolean) => void;
		},
	): void {
		const item = container.createDiv("sf-setting-item");
		const info = item.createDiv("sf-setting-info");
		info.createDiv({ text: opts.name, cls: "sf-setting-name" });
		info.createDiv({ text: opts.desc, cls: "sf-setting-desc" });

		const control = item.createDiv("sf-setting-control");
		const toggle = control.createDiv("sf-toggle");
		if (opts.value) {
			toggle.addClass("sf-toggle-active");
		}
		toggle.setAttribute("role", "switch");
		toggle.setAttribute("tabindex", "0");
		toggle.setAttribute("aria-checked", String(opts.value));
		toggle.setAttribute("aria-label", opts.name);

		toggle.addEventListener("click", () => {
			const newVal = !toggle.hasClass("sf-toggle-active");
			if (newVal) {
				toggle.addClass("sf-toggle-active");
			} else {
				toggle.removeClass("sf-toggle-active");
			}
			toggle.setAttribute("aria-checked", String(newVal));
			opts.onChange(newVal);
		});

		toggle.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				toggle.click();
			}
		});
	}
}
