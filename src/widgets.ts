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
					update.viewportChanged
					// No StateEffects dispatched by this plugin; rebuilding on any
					// effect-carrying transaction redecorated the viewport on nearly
					// every cursor move and internal Live Preview render - the main
					// typing-lag source with several code blocks.
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

const BACKTICK = 96; // "`"
const TILDE = 126; // "~"

/**
 * If `text` (already callout-stripped and left-trimmed) opens a fence, return
 * its fence character; otherwise null. An opening fence is a run of >= 3 of the
 * same fence character, optionally followed by an info string.
 */
function fenceOpenChar(text: string): string | null {
	const code = text.charCodeAt(0);
	if (code !== BACKTICK && code !== TILDE) {
		return null;
	}
	let run = 1;
	while (run < text.length && text.charCodeAt(run) === code) {
		run++;
	}
	return run >= 3 ? text[0] : null;
}

/**
 * Whether `text` (already callout-stripped and left-trimmed) is a closing
 * fence for `fenceChar`: a run of >= 3 of that character followed only by
 * whitespace.
 */
function isFenceClose(text: string, fenceChar: string): boolean {
	const code = fenceChar.charCodeAt(0);
	let run = 0;
	while (run < text.length && text.charCodeAt(run) === code) {
		run++;
	}
	if (run < 3) {
		return false;
	}
	for (let i = run; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		if (ch !== 32 && ch !== 9) {
			return false;
		}
	}
	return true;
}

/**
 * Single cheap structural pass to locate code block intervals, tuned for the
 * per-keystroke path:
 *  - only blocks intersecting [minLine, maxLine] are collected (allocation is
 *    bounded to the viewport, not the whole document);
 *  - lines with no fence character take a no-allocation fast path (the vast
 *    majority of lines), avoiding stripCalloutPrefix/trimStart and any regex;
 *  - fence detection is char-scanned rather than compiling a RegExp per line;
 *  - the scan stops as soon as it is past the viewport and outside any block.
 * The scan must still start from line 1 because fence parity above the viewport
 * determines whether the first visible line sits inside a block.
 */
function computeBlockIntervals(
	doc: Text,
	minLine: number,
	maxLine: number,
): CodeBlockInterval[] {
	const blocks: CodeBlockInterval[] = [];
	const lineCount = doc.lines;

	let inBlock = false;
	let fenceChar = "";
	let start = 0;
	let fenceText = "";
	let count = 0;

	for (let i = 1; i <= lineCount; i++) {
		// Nothing below the viewport matters once we are outside a block.
		if (!inBlock && i > maxLine) {
			break;
		}

		const raw = doc.line(i).text;
		if (raw.indexOf("`") === -1 && raw.indexOf("~") === -1) {
			if (inBlock) {
				count++;
			}
			continue;
		}

		const stripped = stripCalloutPrefix(raw).trimStart();

		if (!inBlock) {
			const openChar = fenceOpenChar(stripped);
			if (openChar) {
				inBlock = true;
				fenceChar = openChar;
				start = i;
				fenceText = stripped;
				count = 0;
			}
		} else if (isFenceClose(stripped, fenceChar)) {
			// Collect only if this block overlaps the visible span.
			if (start <= maxLine && i >= minLine) {
				blocks.push({ start, end: i, fenceText, lineCount: count });
			}
			inBlock = false;
			fenceChar = "";
		} else {
			count++;
		}
	}

	if (inBlock && start <= maxLine) {
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

	const startVisLine = doc.lineAt(ranges[0].from).number;
	const endVisLine = doc.lineAt(ranges[ranges.length - 1].to).number;

	const blocks = computeBlockIntervals(doc, startVisLine, endVisLine);
	if (blocks.length === 0) {
		return Decoration.none;
	}

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
