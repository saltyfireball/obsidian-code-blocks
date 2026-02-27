import { MarkdownView, TFile } from "obsidian";
import type { Plugin } from "obsidian";
import type { CodeBlocksSettings } from "./settings";
import {
	CodeblockParameters,
	extractCalloutFenceEntries,
	findFenceLineByLine,
	findFenceLineForCodeBlock,
	isFrontmatterCodeBlock,
	normalizeCodeContentLoose,
	parseCodeblockParameters,
} from "./params";
import {
	createCodeBlockHeader,
	copyCodeToClipboard,
	updateCodeBlockHeaderStyles,
} from "./header";
import {
	getIconForLanguage,
	LanguageIcon,
	resolveLanguageConfig,
} from "./languages";

type CodeBlocksPlugin = Plugin & { settings: CodeBlocksSettings };

interface SectionInfo {
	text: string;
	fenceLine?: string | null;
}

export function decorateReadingViewCodeBlock(
	preEl: HTMLElement,
	codeEl: HTMLElement,
	plugin: CodeBlocksPlugin,
	sourcePath?: string,
	sectionInfo?: SectionInfo | null,
): void {
	const settings = plugin.settings;

	if (preEl.classList.contains("sf-codeblock-decorated")) {
		return;
	}

	if (isFrontmatterCodeBlock(preEl, codeEl)) {
		return;
	}

	let language = "";
	const langClass = Array.from(codeEl.classList).find((c) =>
		c.startsWith("language-"),
	);
	if (langClass) {
		language = langClass.replace("language-", "");
	}

	let params: CodeblockParameters = {
		language,
		title: "",
		lineNumbers: { enabled: null, offset: 1 },
		highlights: [],
		langColor: "",
		titleColor: "",
	};

	if (sectionInfo?.text) {
		let fenceLine = sectionInfo.fenceLine || null;
		if (!fenceLine) {
			fenceLine = findFenceLineForCodeBlock(
				sectionInfo.text,
				codeEl.textContent || "",
				params.language || language,
				settings.languages,
			);
		}
		if (fenceLine) {
			params = parseCodeblockParameters(fenceLine);
		}
	}

	const resolvedLanguage = (params.language || language).toLowerCase();
	if (settings.ignoreLanguages.includes(resolvedLanguage)) {
		return;
	}

	const titleAttr = preEl.getAttribute("data-title");
	if (titleAttr && !params.title) {
		params.title = titleAttr;
	}

	const langConfig = resolveLanguageConfig(
		params.language || language,
		settings.languages,
	);
	const iconsList = (window.SFIconManager?.getIcons() ?? []) as LanguageIcon[];
	const icon = langConfig?.config?.icon
		? getIconForLanguage(langConfig.config.icon, iconsList)
		: null;

	const baseLanguageColor =
		langConfig?.config?.languageColor ||
		langConfig?.config?.color ||
		"#6c757d";
	const languageColor = params.langColor || baseLanguageColor;
	const borderColor = langConfig?.config?.borderColor || languageColor;

	const wrapper = document.createElement("div");
	wrapper.className = "sf-codeblock-wrapper";
	wrapper.setAttribute("data-lang", params.language || language);
	wrapper.style.setProperty("--sf-cb-border-color", borderColor);

	const header = createCodeBlockHeader(params, langConfig, icon, settings);
	wrapper.appendChild(header);

	preEl.parentNode?.insertBefore(wrapper, preEl);
	wrapper.appendChild(preEl);

	preEl.classList.add("sf-codeblock-decorated", "sf-codeblock-pre");

	const copyBtn = header.querySelector<HTMLElement>(".sf-codeblock-copy");
	if (copyBtn) {
		copyBtn.addEventListener("click", () => {
			const code = codeEl.textContent || "";
			void copyCodeToClipboard(copyBtn, code);
		});
	}

	const isCallout = Boolean(preEl.closest(".callout"));
	const showLineNumbers =
		!isCallout &&
		(params.lineNumbers.enabled !== null
			? params.lineNumbers.enabled
			: settings.showLineNumbers);

	if (!isCallout && (showLineNumbers || params.highlights.length > 0)) {
		processCodeBlockLines(codeEl, params, showLineNumbers);
	}
}

export function processCodeBlockLines(
	codeEl: HTMLElement,
	params: CodeblockParameters,
	showLineNumbers: boolean,
): void {
	const textContent = codeEl.textContent || "";
	const lines = textContent.split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") {
		lines.pop();
	}
	const lineCount = lines.length;
	const offset = params.lineNumbers.offset || 1;

	codeEl.classList.add("sf-codeblock-code");

	if (showLineNumbers) {
		const gutter = document.createElement("div");
		gutter.className = "sf-codeblock-gutter";
		gutter.setAttribute("aria-hidden", "true");

		const lineNumbers: string[] = [];
		for (let i = 0; i < lineCount; i++) {
			lineNumbers.push((i + offset).toString());
		}
		gutter.textContent = lineNumbers.join("\n");

		const pre = codeEl.closest("pre");
		if (pre) {
			pre.classList.add("sf-codeblock-with-gutter");
			pre.insertBefore(gutter, codeEl);

			const codeStyles = window.getComputedStyle(codeEl);
			gutter.style.fontSize = codeStyles.fontSize;
			gutter.style.lineHeight = codeStyles.lineHeight;
			gutter.style.paddingTop = codeStyles.paddingTop;
			gutter.style.paddingBottom = codeStyles.paddingBottom;
		}
	}

	if (params.highlights.length > 0) {
		applyLineHighlights(codeEl, params.highlights, offset);
	}
}

function applyLineHighlights(
	codeEl: HTMLElement,
	highlights: number[],
	offset: number,
): void {
	const textContent = codeEl.textContent || "";
	const lines = textContent.split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") {
		lines.pop();
	}

	const highlightSet = new Set(highlights);
	const highlightLines: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		const lineNum = i + offset;
		if (highlightSet.has(lineNum)) {
			highlightLines.push(i);
		}
	}

	if (highlightLines.length > 0) {
		codeEl.setAttribute("data-highlight-lines", highlightLines.join(","));
		codeEl.classList.add("sf-codeblock-has-highlights");
	}
}

export function setupCalloutCodeBlockObserver(plugin: CodeBlocksPlugin) {
	const scanCalloutCodeBlocks = async (
		root: HTMLElement | Document | Element | null,
	) => {
		if (!root || !root.querySelectorAll) {
			return;
		}
		if (!plugin.settings.enabled) {
			return;
		}

		const activeView =
			plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const isSourceMode = activeView?.getMode
			? activeView.getMode() === "source"
			: false;

		const sourcePath = plugin.app.workspace.getActiveFile()?.path || "";
		let text =
			isSourceMode && activeView?.getViewData
				? activeView.getViewData()
				: "";

		if (!text && sourcePath) {
			const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
			if (file && file instanceof TFile) {
				text = await plugin.app.vault.cachedRead(file);
			}
		}

		const preElements = Array.from(
			root.querySelectorAll(".callout pre"),
		) as HTMLElement[];
		const calloutEntries = text ? extractCalloutFenceEntries(text) : [];

		preElements.forEach((preEl, index) => {
			const codeEl = preEl.querySelector("code");
			if (!codeEl) {
				return;
			}

			const codeText = normalizeCodeContentLoose(
				codeEl.textContent || "",
			);
			if (!codeText) {
				return;
			}

			let fenceLine: string | null = null;
			if (calloutEntries.length) {
				const matchingEntry = calloutEntries.find(
					(entry) =>
						normalizeCodeContentLoose(entry.content) === codeText,
				);
				if (matchingEntry) {
					fenceLine = matchingEntry.fenceLine;
				} else if (calloutEntries[index]) {
					fenceLine = calloutEntries[index].fenceLine;
				} else if (calloutEntries.length === 1) {
					const singleEntry = calloutEntries[0];
					if (singleEntry) {
						fenceLine = singleEntry.fenceLine;
					}
				}
			}

			if (!fenceLine) {
				const lineAttr =
					preEl.getAttribute("data-line") ||
					preEl.getAttribute("data-source-line");
				const lineNumber = lineAttr ? parseInt(lineAttr, 10) : null;
				if (lineNumber) {
					fenceLine = findFenceLineByLine(text, lineNumber);
				}
			}

			const wrapper = preEl.closest<HTMLElement>(".sf-codeblock-wrapper");
			const header = wrapper?.querySelector<HTMLElement>(
				".sf-codeblock-header",
			);
			if (!wrapper || !header) {
				preEl.classList.remove("sf-codeblock-decorated");
				return;
			}

			if (!preEl.classList.contains("sf-codeblock-decorated")) {
				preEl.classList.add("sf-codeblock-pending");
				decorateReadingViewCodeBlock(
					preEl,
					codeEl,
					plugin,
					sourcePath,
					{
						text,
						fenceLine,
					},
				);
				preEl.classList.remove("sf-codeblock-pending");
				return;
			}

			if (fenceLine) {
				const params = parseCodeblockParameters(fenceLine);
				const langConfig = resolveLanguageConfig(
					params.language,
					plugin.settings.languages,
				);
				updateCodeBlockHeaderStyles(
					wrapper,
					header,
					langConfig,
					params,
					plugin.settings,
				);
			}
		});
	};

	const observer = new MutationObserver((mutations) => {
		for (let mi = 0; mi < mutations.length; mi++) {
			const mutation = mutations[mi];
			if (!mutation) {
				continue;
			}
			const nodes = mutation.addedNodes;
			for (let ni = 0; ni < nodes.length; ni++) {
				const node = nodes[ni];
				if (!node || node.nodeType !== Node.ELEMENT_NODE) {
					continue;
				}

				const element = node as HTMLElement;
				const preElements = element.querySelectorAll
					? element.querySelectorAll(
							".callout pre:not(.sf-codeblock-decorated):not(.sf-codeblock-pending)",
						)
					: [];

				if (preElements.length > 0) {
					void scanCalloutCodeBlocks(element);
				}

				if (
					element.matches(
						".callout pre:not(.sf-codeblock-decorated):not(.sf-codeblock-pending)",
					)
				) {
					const calloutRoot =
						element.closest<HTMLElement>(".callout") || element;
					void scanCalloutCodeBlocks(calloutRoot);
				}
			}
		}
	});

	(
		observer as MutationObserver & {
			scanCalloutCodeBlocks?: typeof scanCalloutCodeBlocks;
		}
	).scanCalloutCodeBlocks = scanCalloutCodeBlocks;
	return observer as MutationObserver & {
		scanCalloutCodeBlocks?: typeof scanCalloutCodeBlocks;
	};
}

export async function decorateCalloutCodeBlock(
	preEl: HTMLElement,
	codeEl: HTMLElement,
	plugin: CodeBlocksPlugin,
): Promise<void> {
	if (preEl.classList.contains("sf-codeblock-decorated")) {
		return;
	}
	if (!preEl.classList.contains("sf-codeblock-pending")) {
		preEl.classList.add("sf-codeblock-pending");
	}

	const codeText = (codeEl.textContent || "").trim();
	if (!codeText) {
		preEl.classList.remove("sf-codeblock-pending");
		return;
	}

	const sourcePath = plugin.app.workspace.getActiveFile()?.path || "";
	let sectionInfo: SectionInfo | null = null;

	if (sourcePath) {
		try {
			const activeView =
				plugin.app.workspace.getActiveViewOfType(MarkdownView);
			let text = activeView?.getViewData ? activeView.getViewData() : "";

			if (!text) {
				const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
				if (file && file instanceof TFile) {
					text = await plugin.app.vault.cachedRead(file);
				}
			}

			if (text) {
				const lineAttr =
					preEl.getAttribute("data-line") ||
					preEl.getAttribute("data-source-line");
				const lineNumber = lineAttr ? parseInt(lineAttr, 10) : null;
				let fenceLine = lineNumber
					? findFenceLineByLine(text, lineNumber)
					: null;

				if (!fenceLine) {
					const calloutEntries = extractCalloutFenceEntries(text);
					const targetContent = normalizeCodeContentLoose(
						codeEl.textContent || "",
					);
					const matchingEntry = calloutEntries.find(
						(entry) =>
							normalizeCodeContentLoose(entry.content) ===
							targetContent,
					);

					if (matchingEntry) {
						fenceLine = matchingEntry.fenceLine;
					} else {
						const viewRoot =
							preEl.closest(".markdown-source-view") ||
							preEl.closest(".markdown-rendered") ||
							document;
						const calloutPres = Array.from(
							viewRoot.querySelectorAll(".callout pre"),
						);
						const index = calloutPres.indexOf(preEl);
						if (index !== -1 && calloutEntries[index]) {
							fenceLine = calloutEntries[index].fenceLine;
						} else if (calloutEntries.length === 1) {
							const singleEntry = calloutEntries[0];
							if (singleEntry) {
								fenceLine = singleEntry.fenceLine;
							}
						}
					}
				}

				sectionInfo = { text, fenceLine };
			}
		} catch (error) {
			console.warn(
				"CodeBlocks: failed to read source for callout code block",
				error,
			);
		}
	}

	decorateReadingViewCodeBlock(
		preEl,
		codeEl,
		plugin,
		sourcePath,
		sectionInfo,
	);
	preEl.classList.remove("sf-codeblock-pending");
}
