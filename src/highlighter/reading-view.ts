import { MarkdownPostProcessorContext } from "obsidian";
import { highlightCode, isLanguageSupported } from "./highlighter";
import type { HighlighterSettings } from "./types";
import { getHighlighterState } from "./state";

function processCodeBlock(codeEl: HTMLElement) {
	const state = getHighlighterState();

	if (!state || !state.active) {
		return;
	}

	const settings = state.settings;
	const language = extractLanguage(codeEl);

	if (!language && !settings.autoDetect) {
		return;
	}

	const code = codeEl.textContent ?? "";
	if (!code) return;

	const html = highlightCode(code, language, settings.autoDetect);
	codeEl.innerHTML = html;
	codeEl.classList.add("hljs");
}

export function createHighlighterReadingViewProcessor(settings: HighlighterSettings) {
	return (el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
		const state = getHighlighterState();

		if (!state || !state.active) {
			return;
		}

		const codeBlocks = el.querySelectorAll("pre > code");
		for (let i = 0; i < codeBlocks.length; i++) {
			const codeEl = codeBlocks[i] as HTMLElement;

			if (codeEl.classList.contains("is-loaded")) {
				processCodeBlock(codeEl);
			} else {
				const observer = new MutationObserver(() => {
					if (codeEl.classList.contains("is-loaded")) {
						observer.disconnect();
						processCodeBlock(codeEl);
					}
				});
				observer.observe(codeEl, {
					attributes: true,
					attributeFilter: ["class"],
				});
			}
		}
	};
}

function extractLanguage(codeEl: HTMLElement): string | undefined {
	const classes = Array.from(codeEl.classList);
	for (let i = 0; i < classes.length; i++) {
		const cls = classes[i]!;
		if (cls.startsWith("language-")) {
			const lang = cls.slice("language-".length);
			if (isLanguageSupported(lang)) {
				return lang;
			}
		}
	}
	return undefined;
}
