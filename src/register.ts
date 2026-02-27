import { MarkdownView } from "obsidian";
import type { Plugin } from "obsidian";
import type { CodeBlocksSettings } from "./settings";
import { sanitizeCssValue } from "./utils";
import {
	decorateReadingViewCodeBlock,
	setupCalloutCodeBlockObserver,
} from "./decorate";
import { updateCodeBlockHeaderStyles } from "./header";
import {
	findFenceLineForCodeBlock,
	parseCodeblockParameters,
} from "./params";
import { resolveLanguageConfig } from "./languages";
import { createCodeBlockExtensions } from "./widgets";

type CodeBlocksPluginType = Plugin & {
	settings: CodeBlocksSettings;
	codeBlockStyleEl?: HTMLStyleElement;
	calloutCodeBlockObserver?: MutationObserver;
};

type CalloutObserver = MutationObserver & {
	scanCalloutCodeBlocks?: (
		root: HTMLElement | Document | Element | null,
	) => void;
};

type CalloutScrollCleanup = {
	el: Element;
	handler: EventListenerOrEventListenerObject;
};

type IntervalHandle = ReturnType<typeof window.setInterval>;

/**
 * Create a managed style element in the document head.
 * Removes any existing element with the same id before creating a new one.
 */
export function createManagedStyleEl(id: string): HTMLStyleElement {
	document.getElementById(id)?.remove();
	// eslint-disable-next-line obsidianmd/no-forbidden-elements -- dynamic CSS for per-language code block styling requires a managed style element
	const styleEl = document.createElement("style");
	styleEl.id = id;
	document.head.appendChild(styleEl);
	return styleEl;
}

/**
 * Register the codeblocks feature on the plugin.
 * Creates the style element, registers the post-processor, CM6 extensions,
 * callout observer, and all event handlers for callout scanning.
 */
export function registerCodeBlocks(plugin: CodeBlocksPluginType): void {
	// Create and attach the code block style element
	plugin.codeBlockStyleEl = createManagedStyleEl("codeblocks-plugin-styles");
	updateCodeBlockCSS(plugin);

	// Cleanup style element and observer on plugin unload
	plugin.register(() => {
		if (plugin.codeBlockStyleEl) {
			plugin.codeBlockStyleEl.remove();
		}
		if (plugin.calloutCodeBlockObserver) {
			plugin.calloutCodeBlockObserver.disconnect();
		}
	});

	// Apply line numbers body class for CSS-based line numbers in edit mode
	document.body.classList.toggle(
		"sf-show-line-numbers",
		plugin.settings.showLineNumbers,
	);

	if (!plugin.settings.enabled) {
		return;
	}

	// Register markdown post-processor for reading view
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		if (!plugin.settings.enabled) return;

		const preElements = el.querySelectorAll("pre");
		preElements.forEach((preEl) => {
			const codeEl = preEl.querySelector("code");
			if (!codeEl) return;

			// Check if the language is in the ignore list
			const langClass = Array.from(codeEl.classList).find((c) =>
				c.startsWith("language-"),
			);
			if (langClass) {
				const lang = langClass.replace("language-", "");
				if (plugin.settings.ignoreLanguages.includes(lang)) {
					return;
				}
			}

			const sectionInfo = ctx.getSectionInfo(preEl);
			const fenceLine = sectionInfo?.text
				? findFenceLineForCodeBlock(
						sectionInfo.text,
						codeEl.textContent || "",
						"",
						plugin.settings.languages,
					)
				: null;

			if (preEl.classList.contains("sf-codeblock-decorated")) {
				if (fenceLine) {
					const params = parseCodeblockParameters(fenceLine);
					const langConfig = resolveLanguageConfig(
						params.language,
						plugin.settings.languages,
					);
					const wrapperElement = preEl.closest(
						".sf-codeblock-wrapper",
					);
					const wrapper =
						wrapperElement instanceof HTMLElement
							? wrapperElement
							: null;
					const header = wrapper
						? wrapper.querySelector<HTMLElement>(
								".sf-codeblock-header",
							)
						: null;
					updateCodeBlockHeaderStyles(
						wrapper,
						header,
						langConfig,
						params,
						plugin.settings,
					);
				}
				return;
			}

			decorateReadingViewCodeBlock(
				preEl,
				codeEl,
				plugin,
				ctx.sourcePath,
				sectionInfo,
			);
		});
	});

	// Register CM6 editor extensions for live preview
	plugin.registerEditorExtension(createCodeBlockExtensions(plugin));

	// Setup observer for callout code blocks
	plugin.calloutCodeBlockObserver = setupCalloutCodeBlockObserver(plugin);

	// Start observing the workspace for callout code blocks
	const getActiveCalloutRoot = () => {
		const activeView =
			plugin.app.workspace.getActiveViewOfType(MarkdownView);
		return activeView?.contentEl || plugin.app.workspace.containerEl;
	};

	const scanCalloutCodeBlocks = () => {
		const root = getActiveCalloutRoot();
		const observer = plugin.calloutCodeBlockObserver as CalloutObserver | undefined;
		if (root && observer?.scanCalloutCodeBlocks) {
			observer.scanCalloutCodeBlocks(root);
		}
	};

	let calloutScanTimer: ReturnType<typeof window.setInterval> | null =
		null;
	let calloutScanRaf: number | null = null;
	let editorChangeDebounce: number | null = null;

	const hasCalloutCodeBlocks = () => {
		const root = getActiveCalloutRoot();
		return Boolean(root?.querySelector?.(".callout pre"));
	};

	const runCalloutScan = () => {
		if (!hasCalloutCodeBlocks()) {
			return;
		}
		scanCalloutCodeBlocks();
	};

	const queueCalloutScan = () => {
		if (calloutScanRaf !== null) {
			window.cancelAnimationFrame(calloutScanRaf);
		}
		calloutScanRaf = window.requestAnimationFrame(() => {
			calloutScanRaf = null;
			runCalloutScan();
		});
	};

	const startCalloutScanLoop = () => {
		if (!hasCalloutCodeBlocks()) {
			if (calloutScanTimer !== null) {
				window.clearInterval(calloutScanTimer);
				calloutScanTimer = null;
			}
			return;
		}
		if (calloutScanTimer !== null) {
			window.clearInterval(calloutScanTimer);
		}

		let attempts = 0;
		calloutScanTimer = window.setInterval(() => {
			const root = getActiveCalloutRoot();
			if (!root) {
				if (calloutScanTimer !== null) {
					window.clearInterval(calloutScanTimer);
					calloutScanTimer = null;
				}
				return;
			}

			scanCalloutCodeBlocks();
			attempts += 1;

			const remaining = root.querySelectorAll(
				".callout pre:not(.sf-codeblock-decorated)",
			).length;

			// Stop early if all decorated, or after max attempts
			if (remaining === 0 || attempts >= 8) {
				if (calloutScanTimer !== null) {
					window.clearInterval(calloutScanTimer);
					calloutScanTimer = null;
				}
			}
		}, 300) as unknown as IntervalHandle;
	};

	let calloutScrollCleanup: CalloutScrollCleanup | null = null;
	let calloutScrollDebounce: number | null = null;

	const attachCalloutScrollListener = () => {
		const activeView =
			plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const scroller =
			activeView?.contentEl?.querySelector(".cm-scroller");
		if (!scroller) return;

		if (calloutScrollCleanup && calloutScrollCleanup.el === scroller)
			return;

		if (calloutScrollCleanup) {
			calloutScrollCleanup.el.removeEventListener(
				"scroll",
				calloutScrollCleanup.handler,
			);
		}

		const handler = () => {
			if (calloutScrollDebounce !== null) {
				window.clearTimeout(calloutScrollDebounce);
			}
			calloutScrollDebounce = window.setTimeout(() => {
				startCalloutScanLoop();
			}, 120);
		};
		scroller.addEventListener("scroll", handler, { passive: true });
		calloutScrollCleanup = { el: scroller, handler };
	};

	plugin.register(() => {
		if (calloutScrollCleanup) {
			calloutScrollCleanup.el.removeEventListener(
				"scroll",
				calloutScrollCleanup.handler,
			);
		}
		if (calloutScrollDebounce !== null) {
			window.clearTimeout(calloutScrollDebounce);
		}
		if (calloutScanRaf !== null) {
			window.cancelAnimationFrame(calloutScanRaf);
			calloutScanRaf = null;
		}
		if (editorChangeDebounce !== null) {
			window.clearTimeout(editorChangeDebounce);
		}
	});

	plugin.app.workspace.onLayoutReady(() => {
		const workspaceEl = plugin.app.workspace.containerEl;
		const observer = plugin.calloutCodeBlockObserver;
		if (workspaceEl && observer) {
			observer.observe(workspaceEl, {
				childList: true,
				subtree: true,
			});
			startCalloutScanLoop();
			attachCalloutScrollListener();
		}
	});

	plugin.registerEvent(
		plugin.app.workspace.on("active-leaf-change", () => {
			startCalloutScanLoop();
			attachCalloutScrollListener();
		}),
	);
	plugin.registerEvent(
		plugin.app.workspace.on("file-open", () => {
			startCalloutScanLoop();
			attachCalloutScrollListener();
		}),
	);
	plugin.registerEvent(
		plugin.app.workspace.on("layout-change", () => {
			startCalloutScanLoop();
			attachCalloutScrollListener();
		}),
	);

	plugin.registerEvent(
		plugin.app.workspace.on("editor-change", () => {
			const activeView =
				plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView?.getMode || activeView.getMode() !== "source")
				return;
			if (editorChangeDebounce !== null) {
				window.clearTimeout(editorChangeDebounce);
			}
			editorChangeDebounce = window.setTimeout(() => {
				queueCalloutScan();
				attachCalloutScrollListener();
			}, 250);
		}),
	);
}

/**
 * Generate and update code block CSS.
 * Exported so settings UI can call it.
 */
export function updateCodeBlockCSS(plugin: CodeBlocksPluginType): void {
	const settings = plugin.settings;
	const lines = [];

	// Generate global code block background color if set
	if (settings.backgroundColor) {
		const bgColor = sanitizeCssValue(settings.backgroundColor);
		lines.push(`/* Code Block Background */
.sf-codeblock-wrapper {
  --sf-cb-background: ${bgColor};
}
.sf-codeblock-wrapper .sf-codeblock-pre,
.sf-codeblock-wrapper .sf-codeblock-pre code {
  background: ${bgColor} !important;
}`);
	}

	// Generate CSS variables for each language
	lines.push("\n/* Code Block Language Colors */");
	const codeBlockLanguages = settings.languages || {};
	for (const [lang, config] of Object.entries(codeBlockLanguages)) {
		const languageColor =
			sanitizeCssValue(config.languageColor || config.color) ||
			"#6c757d";
		const titleColor =
			sanitizeCssValue(config.titleColor) || languageColor;
		const borderColor =
			sanitizeCssValue(config.borderColor) || languageColor;

		lines.push(`
/* Language: ${lang} */
.sf-codeblock-wrapper[data-lang="${lang}"],
.sf-codeblock-wrapper[data-lang="${lang}"] .sf-codeblock-header {
  --sf-cb-language-color: ${languageColor};
  --sf-cb-title-color: ${titleColor};
  --sf-cb-border-color: ${borderColor};
}
/* Edit mode header for ${lang} */
.sf-codeblock-header-lang-${lang}.sf-codeblock-header-cm6 {
  border-left-color: ${borderColor} !important;
}
.sf-codeblock-header-lang-${lang}.sf-codeblock-header-cm6::after {
  background: ${borderColor} !important;
}
/* Edit mode line decorations for ${lang} */
.cm-line.sf-codeblock-lang-${lang} {
  --sf-cb-border-color: ${borderColor};
  border-left: 4px solid ${borderColor} !important;
}
.cm-line.sf-codeblock-fence-end.sf-codeblock-lang-${lang} {
  border-radius: 0 0 0 8px;
}`);

		// Also generate for aliases
		if (config.aliases) {
			for (const alias of config.aliases) {
				lines.push(`
.sf-codeblock-wrapper[data-lang="${alias}"],
.sf-codeblock-wrapper[data-lang="${alias}"] .sf-codeblock-header {
  --sf-cb-language-color: ${languageColor};
  --sf-cb-title-color: ${titleColor};
  --sf-cb-border-color: ${borderColor};
}
.sf-codeblock-header-lang-${alias}.sf-codeblock-header-cm6 {
  border-left-color: ${borderColor} !important;
}
.sf-codeblock-header-lang-${alias}.sf-codeblock-header-cm6::after {
  background: ${borderColor} !important;
}
.cm-line.sf-codeblock-lang-${alias} {
  --sf-cb-border-color: ${borderColor};
  border-left: 4px solid ${borderColor} !important;
}
.cm-line.sf-codeblock-fence-end.sf-codeblock-lang-${alias} {
  border-radius: 0 0 0 8px;
}`);
			}
		}
	}

	// Add any custom code block CSS
	if (settings.customCSS) {
		lines.push("\n/* Custom Code Block CSS */");
		lines.push(settings.customCSS);
	}

	if (plugin.codeBlockStyleEl) {
		plugin.codeBlockStyleEl.textContent = lines.join("\n");
	}
}
