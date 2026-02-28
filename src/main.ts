import { MarkdownView, Plugin } from "obsidian";
import { CodeBlocksSettings, DEFAULT_SETTINGS } from "./settings";
import { CodeBlocksSettingTab } from "./settings-tab";
import { registerCodeBlocks, updateCodeBlockCSS } from "./register";
import { registerHighlighter } from "./highlighter/register";
import { deepMerge } from "./utils";

declare global {
	interface Window {
		SFIconManager?: {
			getIcons(): Array<{
				id: string;
				dataUrl: string;
				isColored?: boolean;
				backgroundSize?: string;
			}>;
			onIconsChanged?(listener: () => void): () => void;
		};
	}
}

export default class CodeBlocksPlugin extends Plugin {
	settings!: CodeBlocksSettings;
	settingsTab?: CodeBlocksSettingTab;
	codeBlockStyleEl?: CSSStyleSheet;
	highlighterStyleEl?: CSSStyleSheet;
	calloutCodeBlockObserver?: MutationObserver;
	private _iconManagerUnsubscribe: (() => void) | null = null;

	async onload() {
		await this.loadSettings();

		// Register code block styling
		registerCodeBlocks(this);

		// Register syntax highlighting
		registerHighlighter(this);

		// Add settings tab
		this.settingsTab = new CodeBlocksSettingTab(this.app, this);
		this.addSettingTab(this.settingsTab);

		// Subscribe to Icon Manager changes if available
		if (window.SFIconManager?.onIconsChanged) {
			this._iconManagerUnsubscribe = window.SFIconManager.onIconsChanged(() => {
				this.updateCSS();
			});
		}
	}

	onunload() {
		if (this._iconManagerUnsubscribe) {
			this._iconManagerUnsubscribe();
			this._iconManagerUnsubscribe = null;
		}
	}

	updateCSS() {
		updateCodeBlockCSS(this);
	}

	refreshActiveMarkdownPreview() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.previewMode) return;
		if (view.getMode && view.getMode() !== "preview") return;
		if (typeof view.previewMode.rerender === "function") {
			view.previewMode.rerender(true);
		}
	}

	async loadSettings() {
		const savedData = (await this.loadData()) as Partial<CodeBlocksSettings> | null;
		this.settings = deepMerge(DEFAULT_SETTINGS, savedData ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
