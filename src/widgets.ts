import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import type { Text } from "@codemirror/state";
import type { Plugin } from "obsidian";
import type { CodeBlocksSettings } from "./settings";
import type { CodeblockParameters } from "./params";
import { parseCodeblockParameters, stripCalloutPrefix } from "./params";
import { createCodeBlockHeader, copyCodeToClipboard } from "./header";
import {
	CodeBlockLanguageConfig,
	getIconForLanguage,
	LanguageIcon,
	resolveLanguageConfig,
} from "./languages";

type CodeBlocksPlugin = Plugin & { settings: CodeBlocksSettings };

class CodeBlockHeaderWidget extends WidgetType {
	private params: CodeblockParameters;
	private langConfig: {
		name: string;
		config: CodeBlockLanguageConfig;
	} | null;
	private icon: LanguageIcon | null;
	private settings: CodeBlocksSettings;
	private borderColor: string;

	constructor(
		params: CodeblockParameters,
		langConfig: { name: string; config: CodeBlockLanguageConfig } | null,
		icon: LanguageIcon | null,
		settings: CodeBlocksSettings,
		borderColor: string,
	) {
		super();
		this.params = params;
		this.langConfig = langConfig;
		this.icon = icon;
		this.settings = settings;
		this.borderColor = borderColor;
	}

	toDOM(_view: EditorView) {
		const header = createCodeBlockHeader(
			this.params,
			this.langConfig,
			this.icon,
			this.settings,
		);
		header.classList.add("sf-codeblock-header-cm6");
		const lang = this.params.language || "unknown";
		header.classList.add(`sf-codeblock-header-lang-${lang}`);
		return header;
	}

	eq(other: CodeBlockHeaderWidget) {
		return (
			this.params.language === other.params.language &&
			this.params.title === other.params.title &&
			this.params.langColor === other.params.langColor &&
			this.params.titleColor === other.params.titleColor &&
			this.langConfig?.name === other.langConfig?.name
		);
	}

	ignoreEvent() {
		return false;
	}
}

export function createCodeBlockExtensions(plugin: CodeBlocksPlugin) {
	const codeBlockViewPlugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildCodeBlockDecorations(view, plugin);
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.transactions.some((tr) => tr.effects.length > 0)
				) {
					this.decorations = buildCodeBlockDecorations(
						update.view,
						plugin,
					);
				}
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);

	const copyButtonPlugin = ViewPlugin.fromClass(
		class {
			private view: EditorView;
			private boundClick: (e: MouseEvent) => void;

			constructor(view: EditorView) {
				this.view = view;
				this.boundClick = this.handleClick.bind(this);
				view.dom.addEventListener("click", this.boundClick);
			}

			private handleClick(e: MouseEvent) {
				const target = e.target as HTMLElement | null;
				const copyBtn = target?.closest(
					".sf-codeblock-copy",
				) as HTMLElement | null;
				if (!copyBtn) {
					return;
				}

				const header = copyBtn.closest(
					".sf-codeblock-header",
				);
				if (!header) {
					return;
				}

				const lineEl = header.closest(".cm-line");
				if (!lineEl) {
					return;
				}

				const pos = this.view.posAtDOM(lineEl);
				const code = this.extractCodeBlockContent(pos);
				if (code) {
					void copyCodeToClipboard(copyBtn, code);
				}
			}

			private extractCodeBlockContent(startPos: number) {
				const state = this.view.state;
				const doc = state.doc;
				const codeLines: string[] = [];
				let fenceChar = "";
				let fenceLineNumber: number | null = null;

				const startLine = doc.lineAt(startPos).number;

				for (let i = startLine; i >= 1; i--) {
					const line = doc.line(i);
					const text = line.text;
					const fenceMatch = text.match(/^([`~]{3,})/);
					if (fenceMatch) {
						const fenceChars = fenceMatch[1] || "";
						fenceChar = fenceChars[0] || "";
						fenceLineNumber = i;
						break;
					}
				}

				if (!fenceLineNumber) {
					for (let i = startLine; i <= doc.lines; i++) {
						const line = doc.line(i);
						const text = line.text;
						const fenceMatch = text.match(/^([`~]{3,})/);
						if (fenceMatch) {
							const fenceChars = fenceMatch[1] || "";
							fenceChar = fenceChars[0] || "";
							fenceLineNumber = i;
							break;
						}
					}
				}

				if (!fenceLineNumber) {
					return "";
				}

				for (let i = fenceLineNumber + 1; i <= doc.lines; i++) {
					const line = doc.line(i);
					const text = line.text;
					const closingFence = new RegExp(`^${fenceChar}{3,}\\s*$`);
					if (closingFence.test(text)) {
						break;
					}
					codeLines.push(text);
				}

				return codeLines.join("\n");
			}

			destroy() {
				this.view.dom.removeEventListener("click", this.boundClick);
			}
		},
	);

	return [codeBlockViewPlugin, copyButtonPlugin];
}

interface CodeBlockInterval {
	/** 1-based line number of the opening fence. */
	start: number;
	/** 1-based line number of the closing fence, or -1 if unterminated. */
	end: number;
	/** Stripped, left-trimmed opening-fence line text (contains parameters). */
	fenceText: string;
	/** Number of content lines (used for gutter width). */
	lineCount: number;
}

/**
 * Single cheap structural pass over the whole document to locate every code
 * block's line interval. Only regex fence matching is done here - no decoration
 * allocation and no per-block language/icon resolution - so the per-keystroke
 * cost stays proportional to document length rather than to the (far more
 * expensive) full decoration rebuild it feeds.
 */
function computeBlockIntervals(doc: Text): CodeBlockInterval[] {
	const blocks: CodeBlockInterval[] = [];
	const lineCount = doc.lines;

	let inBlock = false;
	let fenceChar = "";
	let start = 0;
	let fenceText = "";
	let count = 0;

	for (let i = 1; i <= lineCount; i++) {
		const stripped = stripCalloutPrefix(doc.line(i).text).trimStart();

		if (!inBlock) {
			const fenceMatch = stripped.match(/^([`~]{3,})(.*)$/);
			if (fenceMatch) {
				inBlock = true;
				fenceChar = (fenceMatch[1] || "")[0] || "";
				start = i;
				fenceText = stripped;
				count = 0;
			}
		} else {
			const closingFence = new RegExp(`^${fenceChar}{3,}\\s*$`);
			if (closingFence.test(stripped)) {
				blocks.push({ start, end: i, fenceText, lineCount: count });
				inBlock = false;
				fenceChar = "";
			} else {
				count++;
			}
		}
	}

	if (inBlock) {
		// Unterminated block (fence still open at EOF): matches the previous
		// behavior of decorating every remaining line as content with a line
		// count of 0.
		blocks.push({ start, end: -1, fenceText, lineCount: 0 });
	}

	return blocks;
}

/**
 * Build code block decorations for the visible viewport only. Blocks that do
 * not intersect view.visibleRanges are skipped entirely, and the expensive
 * per-block work (parameter parsing, language resolution, icon lookup, header
 * widget) runs only for blocks on screen.
 */
export function buildCodeBlockDecorations(
	view: EditorView,
	plugin: CodeBlocksPlugin,
): DecorationSet {
	const settings = plugin.settings;
	if (!settings.enabled) {
		return Decoration.none;
	}

	const doc = view.state.doc;
	const ranges = view.visibleRanges;
	if (ranges.length === 0) {
		return Decoration.none;
	}

	const blocks = computeBlockIntervals(doc);
	if (blocks.length === 0) {
		return Decoration.none;
	}

	const startVisLine = doc.lineAt(ranges[0].from).number;
	const endVisLine = doc.lineAt(ranges[ranges.length - 1].to).number;

	const builder = new RangeSetBuilder<Decoration>();

	for (const block of blocks) {
		const blockEnd = block.end === -1 ? doc.lines : block.end;

		// Skip blocks entirely outside the visible span.
		if (block.start > endVisLine || blockEnd < startVisLine) {
			continue;
		}

		const params = parseCodeblockParameters(block.fenceText);
		const currentLang = params.language || "unknown";
		if (settings.ignoreLanguages.includes(currentLang.toLowerCase())) {
			continue;
		}

		const maxDigits = Math.max(2, String(block.lineCount).length);
		const gutterWidth = `${maxDigits + 1}em`;

		// Opening fence line + header widget (only if the fence line is visible).
		if (block.start >= startVisLine && block.start <= endVisLine) {
			const langConfig = resolveLanguageConfig(
				params.language,
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

			const fenceFrom = doc.line(block.start).from;
			builder.add(
				fenceFrom,
				fenceFrom,
				Decoration.line({
					attributes: {
						class: `sf-codeblock-fence-start sf-codeblock-lang-${currentLang}`,
						"data-line-count": String(block.lineCount),
						style: `--sf-gutter-width: ${gutterWidth}`,
					},
				}),
			);
			builder.add(
				fenceFrom,
				fenceFrom,
				Decoration.widget({
					widget: new CodeBlockHeaderWidget(
						params,
						langConfig,
						icon,
						settings,
						borderColor,
					),
					side: 1,
				}),
			);
		}

		// Content lines (visible portion only).
		const lastContentLine = block.end === -1 ? blockEnd : blockEnd - 1;
		const contentStart = Math.max(block.start + 1, startVisLine);
		const contentEnd = Math.min(lastContentLine, endVisLine);
		const lineNumbersEnabled = params.lineNumbers.enabled;

		for (let ln = contentStart; ln <= contentEnd; ln++) {
			let lineClasses = `sf-codeblock-content-line sf-codeblock-lang-${currentLang}`;
			if (lineNumbersEnabled === true) {
				lineClasses += " sf-ln-enabled";
			} else if (lineNumbersEnabled === false) {
				lineClasses += " sf-ln-disabled";
			}

			const from = doc.line(ln).from;
			builder.add(
				from,
				from,
				Decoration.line({
					attributes: {
						class: lineClasses,
						"data-line-num": String(ln - block.start),
						style: `--sf-gutter-width: ${gutterWidth}`,
					},
				}),
			);
		}

		// Closing fence line (only if terminated and visible).
		if (
			block.end !== -1 &&
			block.end >= startVisLine &&
			block.end <= endVisLine
		) {
			const from = doc.line(block.end).from;
			builder.add(
				from,
				from,
				Decoration.line({
					attributes: {
						class: `sf-codeblock-fence-end sf-codeblock-lang-${currentLang}`,
					},
				}),
			);
		}
	}

	return builder.finish();
}
