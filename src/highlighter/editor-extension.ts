// eslint-disable-next-line import/no-extraneous-dependencies -- @codemirror packages are provided by Obsidian at runtime
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";
// eslint-disable-next-line import/no-extraneous-dependencies -- @codemirror packages are provided by Obsidian at runtime
import { Range } from "@codemirror/state";
import { highlightToTokens } from "./highlighter";
import type { HighlighterSettings } from "./types";
import { getHighlighterState } from "./state";
import type { TokenStyle } from "./themes";

function resolveStyle(
	classes: string[],
	styleMap: Record<string, TokenStyle>,
	combinedOverrides: Array<{ match: string[]; style: TokenStyle }>,
): string | undefined {
	let resolved: TokenStyle | undefined;

	for (let i = 0; i < combinedOverrides.length; i++) {
		const override = combinedOverrides[i];
		let allMatch = true;
		for (let j = 0; j < override.match.length; j++) {
			if (classes.indexOf(override.match[j]) === -1) {
				allMatch = false;
				break;
			}
		}
		if (allMatch) {
			resolved = override.style;
			break;
		}
	}

	if (!resolved) {
		for (let i = 0; i < classes.length; i++) {
			const s = styleMap[classes[i]];
			if (s) {
				resolved = s;
				break;
			}
		}
	}

	if (!resolved) return undefined;

	let style = "color: " + resolved.color;
	if (resolved.bold) style += "; font-weight: bold";
	if (resolved.italic) style += "; font-style: italic";
	return style;
}

interface CodeBlock {
	language: string | undefined;
	contentFrom: number;
	contentTo: number;
}

function findCodeBlocks(view: EditorView): CodeBlock[] {
	const doc = view.state.doc;
	const blocks: CodeBlock[] = [];
	let inBlock = false;
	let fenceChar = "";
	let fenceLen = 0;
	let language: string | undefined;
	let contentFrom = 0;

	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const text = line.text;

		if (!inBlock) {
			const match = text.match(/^(`{3,}|~{3,})\s*(\S*)/);
			if (match) {
				inBlock = true;
				fenceChar = match[1][0]!;
				fenceLen = match[1].length;
				language = match[2] || undefined;
				contentFrom = line.to + 1;
			}
		} else {
			const closing = new RegExp(
				"^\\" + fenceChar + "{" + fenceLen + ",}\\s*$",
			);
			if (closing.test(text)) {
				const contentTo = line.from - 1;
				if (contentFrom <= contentTo) {
					blocks.push({ language, contentFrom, contentTo });
				}
				inBlock = false;
			}
		}
	}

	return blocks;
}

function buildDecorations(view: EditorView): DecorationSet {
	const state = getHighlighterState();

	if (!state || !state.active) {
		return Decoration.none;
	}

	const settings = state.settings;
	const styleMap = state.styleMap;
	const combinedOverrides = state.combinedOverrides;
	const foregroundColor = state.foregroundColor;

	const decorations: Range<Decoration>[] = [];
	const blocks = findCodeBlocks(view);

	for (let b = 0; b < blocks.length; b++) {
		const block = blocks[b];
		if (!block.language && !settings.autoDetect) continue;

		let visible = false;
		for (let r = 0; r < view.visibleRanges.length; r++) {
			const range = view.visibleRanges[r];
			if (
				block.contentFrom <= range.to &&
				block.contentTo >= range.from
			) {
				visible = true;
				break;
			}
		}
		if (!visible) continue;

		const code = view.state.sliceDoc(block.contentFrom, block.contentTo);
		if (!code) continue;

		decorations.push(
			Decoration.mark({
				attributes: { style: `color: ${foregroundColor}` },
			}).range(block.contentFrom, block.contentTo),
		);

		const tokens = highlightToTokens(
			code,
			block.language,
			settings.autoDetect,
		);

		for (let t = 0; t < tokens.length; t++) {
			const token = tokens[t];
			const tokenFrom = block.contentFrom + token.offset;
			const tokenTo = tokenFrom + token.length;

			if (tokenFrom >= tokenTo) continue;
			if (tokenTo > block.contentTo) continue;

			const style = resolveStyle(
				token.classes,
				styleMap,
				combinedOverrides,
			);
			if (!style) continue;

			decorations.push(
				Decoration.mark({
					attributes: { style },
				}).range(tokenFrom, tokenTo),
			);
		}
	}

	decorations.sort((a, b) => a.from - b.from || a.to - b.to);
	return Decoration.set(decorations);
}

let decorationVersion = 0;

export function incrementDecorationVersion(): void {
	decorationVersion++;
}

export function createHighlighterEditorExtension(
	settings: HighlighterSettings,
) {
	let currentVersion = decorationVersion;

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			private unsubscribe: (() => void) | null = null;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view);

				const state = getHighlighterState();
				if (state) {
					this.unsubscribe = state.subscribe(() => {
						incrementDecorationVersion();
					});
				}
			}

			update(update: ViewUpdate) {
				const versionChanged = currentVersion !== decorationVersion;
				if (
					update.docChanged ||
					update.viewportChanged ||
					versionChanged
				) {
					currentVersion = decorationVersion;
					this.decorations = buildDecorations(update.view);
				}
			}

			destroy() {
				if (this.unsubscribe) {
					this.unsubscribe();
				}
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
}
