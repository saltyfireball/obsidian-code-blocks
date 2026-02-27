import type { Plugin } from "obsidian";
import { MarkdownView } from "obsidian";
import type { CodeBlocksSettings } from "../settings";
import {
	createHighlighterEditorExtension,
	createHighlighterReadingViewProcessor,
	initHighlighterState,
	getHighlighterState,
	destroyHighlighterState,
	generateThemeCSS,
	incrementDecorationVersion,
	highlightToTokens,
} from "./index";

type CodeBlocksPluginType = Plugin & {
	settings: CodeBlocksSettings;
	highlighterStyleEl?: HTMLStyleElement;
	refreshActiveMarkdownPreview(): void;
};

function createManagedStyleEl(id: string): HTMLStyleElement {
	document.getElementById(id)?.remove();
	const styleEl = document.createElement("style");
	styleEl.id = id;
	document.head.appendChild(styleEl);
	return styleEl;
}

export function registerHighlighter(plugin: CodeBlocksPluginType): void {
	const state = initHighlighterState(plugin.settings.highlighter);

	plugin.registerMarkdownPostProcessor(
		createHighlighterReadingViewProcessor(plugin.settings.highlighter),
	);

	plugin.registerEditorExtension([
		createHighlighterEditorExtension(plugin.settings.highlighter),
	]);

	if (!plugin.settings.highlighter.enabled) {
		return;
	}

	plugin.highlighterStyleEl = createManagedStyleEl("codeblocks-highlighter");
	plugin.highlighterStyleEl.textContent = generateThemeCSS(
		plugin.settings.highlighter.theme,
	);

	state.start();

	plugin.register(() => {
		if (plugin.highlighterStyleEl) {
			plugin.highlighterStyleEl.remove();
		}
		destroyHighlighterState();
	});

	(plugin as any).syntaxHighlight = {
		highlightToTokens,
		getState() {
			const state = getHighlighterState();
			if (!state || !state.active) return null;
			return {
				settings: state.settings,
				styleMap: state.styleMap,
				combinedOverrides: state.combinedOverrides,
				foregroundColor: state.foregroundColor,
			};
		},
		subscribe(listener: () => void): () => void {
			const state = getHighlighterState();
			if (state) {
				return state.subscribe(listener);
			}
			return () => {};
		},
	};
}

export function stopHighlighter(plugin: CodeBlocksPluginType): void {
	const state = getHighlighterState();
	if (state) {
		state.stop();
	}
	if (plugin.highlighterStyleEl) {
		plugin.highlighterStyleEl.remove();
		plugin.highlighterStyleEl = undefined;
	}
}

export function reloadHighlighter(plugin: CodeBlocksPluginType): void {
	const state = getHighlighterState();
	if (!state) return;

	state.updateSettings(plugin.settings.highlighter);

	if (plugin.highlighterStyleEl) {
		plugin.highlighterStyleEl.textContent = generateThemeCSS(
			plugin.settings.highlighter.theme,
		);
	} else if (plugin.settings.highlighter.enabled) {
		plugin.highlighterStyleEl = createManagedStyleEl("codeblocks-highlighter");
		plugin.highlighterStyleEl.textContent = generateThemeCSS(
			plugin.settings.highlighter.theme,
		);
	}

	if (plugin.settings.highlighter.enabled && !state.active) {
		state.start();
	} else if (!plugin.settings.highlighter.enabled && state.active) {
		state.stop();
	}

	incrementDecorationVersion();

	plugin.refreshActiveMarkdownPreview();
}
