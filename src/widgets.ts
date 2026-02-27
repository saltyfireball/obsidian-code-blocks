import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	WidgetType,
} from "@codemirror/view";
import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
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
	const settings = plugin.settings;

	const codeBlockField = StateField.define<DecorationSet>({
		create(state: EditorState) {
			return buildCodeBlockDecorations(state, plugin);
		},
		update(value, tr) {
			if (tr.docChanged || tr.effects.length > 0) {
				return buildCodeBlockDecorations(tr.state, plugin);
			}
			return value;
		},
		provide(field) {
			return EditorView.decorations.from(field);
		},
	});

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
				) as HTMLElement | null;
				if (!header) {
					return;
				}

				const lineEl = header.closest(".cm-line") as HTMLElement | null;
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

	return [codeBlockField, copyButtonPlugin];
}

export function buildCodeBlockDecorations(
	state: EditorState,
	plugin: CodeBlocksPlugin,
): DecorationSet {
	const settings = plugin.settings;
	if (!settings.enabled) {
		return Decoration.none;
	}

	const builder = new RangeSetBuilder<Decoration>();
	const doc = state.doc;

	let inBlock = false;
	let skipBlock = false;
	let fenceChar = "";
	let fenceLine = "";
	let currentLang = "unknown";
	let lineNumInBlock = 0;
	let blockLineCount = 0;
	let blockLineNumbersEnabled: boolean | null = null;

	const blockLineCounts: Map<number, number> = new Map();
	let tempInBlock = false;
	let tempFenceChar = "";
	let tempBlockStart = 0;
	let tempLineCount = 0;

	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const strippedText = stripCalloutPrefix(line.text);
		const fenceText = strippedText.trimStart();

		if (!tempInBlock) {
			const fenceMatch = fenceText.match(/^([`~]{3,})(.*)$/);
			if (fenceMatch) {
				tempInBlock = true;
				const fenceChars = fenceMatch[1] || "";
				tempFenceChar = fenceChars[0] || "";
				tempBlockStart = i;
				tempLineCount = 0;
			}
		} else {
			const closingFence = new RegExp(`^${tempFenceChar}{3,}\\s*$`);
			if (closingFence.test(fenceText)) {
				blockLineCounts.set(tempBlockStart, tempLineCount);
				tempInBlock = false;
				tempFenceChar = "";
			} else {
				tempLineCount++;
			}
		}
	}

	let currentBlockStart = 0;

	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const text = line.text;
		const strippedText = stripCalloutPrefix(text);
		const fenceText = strippedText.trimStart();

		if (!inBlock) {
			const fenceMatch = fenceText.match(/^([`~]{3,})(.*)$/);
			if (fenceMatch) {
				inBlock = true;
				lineNumInBlock = 0;
				currentBlockStart = i;
				blockLineCount = blockLineCounts.get(i) || 0;
				const fenceChars = fenceMatch[1] || "";
				fenceChar = fenceChars[0] || "";
				fenceLine = fenceText;
				const params = parseCodeblockParameters(fenceLine);
				currentLang = params.language || "unknown";
				blockLineNumbersEnabled = params.lineNumbers.enabled;
				if (settings.ignoreLanguages.includes(currentLang.toLowerCase())) {
					skipBlock = true;
					continue;
				}
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
				const borderColor =
					langConfig?.config?.borderColor || languageColor;

				const maxDigits = Math.max(2, String(blockLineCount).length);
				const gutterWidth = `${maxDigits + 1}em`;

				const lineClass = Decoration.line({
					attributes: {
						class: `sf-codeblock-fence-start sf-codeblock-lang-${currentLang}`,
						"data-line-count": String(blockLineCount),
						style: `--sf-gutter-width: ${gutterWidth}`,
					},
				});
				builder.add(line.from, line.from, lineClass);

				const headerWidget = Decoration.widget({
					widget: new CodeBlockHeaderWidget(
						params,
						langConfig,
						icon,
						settings,
						borderColor,
					),
					side: 1,
				});
				builder.add(line.from, line.from, headerWidget);
			}
			continue;
		}

		const closingFence = new RegExp(`^${fenceChar}{3,}\\s*$`);
		if (closingFence.test(fenceText)) {
			if (skipBlock) {
				inBlock = false;
				skipBlock = false;
				fenceChar = "";
				fenceLine = "";
				currentLang = "unknown";
				blockLineNumbersEnabled = null;
				continue;
			}
			const lineClass = Decoration.line({
				attributes: {
					class: `sf-codeblock-fence-end sf-codeblock-lang-${currentLang}`,
				},
			});
			builder.add(line.from, line.from, lineClass);
			inBlock = false;
			fenceChar = "";
			fenceLine = "";
			currentLang = "unknown";
			blockLineNumbersEnabled = null;
			continue;
		}

		if (skipBlock) {
			continue;
		}

		lineNumInBlock++;
		const maxDigits = Math.max(2, String(blockLineCount).length);
		const gutterWidth = `${maxDigits + 1}em`;

		let lineClasses = `sf-codeblock-content-line sf-codeblock-lang-${currentLang}`;
		if (blockLineNumbersEnabled === true) {
			lineClasses += " sf-ln-enabled";
		} else if (blockLineNumbersEnabled === false) {
			lineClasses += " sf-ln-disabled";
		}

		const lineClass = Decoration.line({
			attributes: {
				class: lineClasses,
				"data-line-num": String(lineNumInBlock),
				style: `--sf-gutter-width: ${gutterWidth}`,
			},
		});
		builder.add(line.from, line.from, lineClass);
	}

	return builder.finish();
}
