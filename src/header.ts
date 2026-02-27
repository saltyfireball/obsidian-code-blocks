import { Notice } from "obsidian";
import type { CodeBlocksSettings } from "./settings";
import type { CodeblockParameters } from "./params";
import { parseCodeblockParameters } from "./params";
import {
	CodeBlockLanguageConfig,
	getIconForLanguage,
	LanguageIcon,
	resolveLanguageConfig,
} from "./languages";

const COPY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function setSvgIcon(el: HTMLElement, svgString: string): void {
	el.empty();
	const temp = createDiv();
	// eslint-disable-next-line @microsoft/sdl/no-inner-html -- parsing trusted static SVG constant
	temp.innerHTML = svgString;
	const svg = temp.firstElementChild;
	if (svg) {
		el.appendChild(svg);
	}
}

export function applyTitleToHeader(
	header: HTMLElement | null,
	title?: string,
	titleColor?: string,
): void {
	if (!header || !title) {
		return;
	}
	const leftSection =
		header.querySelector<HTMLElement>(".sf-codeblock-header-left") ||
		header;
	let titleEl = header.querySelector<HTMLElement>(".sf-codeblock-title");
	if (!titleEl) {
		titleEl = createSpan({ cls: "sf-codeblock-title" });
		leftSection.appendChild(titleEl);
	}
	titleEl.textContent = title;
	if (titleColor) {
		titleEl.setCssStyles({ color: titleColor });
		header.setCssProps({ "--sf-cb-title-color": titleColor });
	}
}

export function updateCalloutHeaderFromFence(
	preEl: HTMLElement | null,
	fenceLine: string | null,
	settings: CodeBlocksSettings,
): void {
	if (!preEl || !fenceLine) {
		return;
	}
	const params = parseCodeblockParameters(fenceLine);
	if (!params.title) {
		return;
	}
	const wrapper = preEl.closest<HTMLElement>(".sf-codeblock-wrapper");
	const header = wrapper?.querySelector<HTMLElement>(".sf-codeblock-header");
	if (!header) {
		return;
	}

	const langConfig = resolveLanguageConfig(
		params.language,
		settings.languages,
	);
	const languageColor =
		langConfig?.config?.languageColor ||
		langConfig?.config?.color ||
		"#6c757d";
	const titleColor = langConfig?.config?.titleColor || languageColor;
	applyTitleToHeader(header, params.title, titleColor);
}

export function updateCodeBlockHeaderStyles(
	wrapper: HTMLElement | null,
	header: HTMLElement | null,
	langConfig: { name: string; config: CodeBlockLanguageConfig } | null,
	params: CodeblockParameters,
	settings: CodeBlocksSettings,
): void {
	if (!wrapper || !header) {
		return;
	}

	const baseLanguageColor =
		langConfig?.config?.languageColor ||
		langConfig?.config?.color ||
		"#6c757d";
	const languageColor = params.langColor || baseLanguageColor;
	const titleColor =
		params.titleColor || langConfig?.config?.titleColor || languageColor;
	const borderColor = langConfig?.config?.borderColor || languageColor;

	wrapper.setAttribute("data-lang", params.language || "");
	wrapper.setCssProps({ "--sf-cb-border-color": borderColor });

	header.setCssProps({
		"--sf-cb-language-color": languageColor,
		"--sf-cb-title-color": titleColor,
		"--sf-cb-border-color": borderColor,
	});

	const langEl = header.querySelector<HTMLElement>(".sf-codeblock-language");
	if (langEl) {
		langEl.textContent =
			langConfig?.config?.displayName ||
			langConfig?.name ||
			params.language ||
			"";
		langEl.setCssStyles({ color: languageColor });
	}

	const titleEl = header.querySelector<HTMLElement>(".sf-codeblock-title");
	if (params.title) {
		if (titleEl) {
			titleEl.textContent = params.title;
			titleEl.setCssStyles({ color: titleColor });
		} else {
			const titleNode = createSpan({ cls: "sf-codeblock-title", text: params.title });
			titleNode.setCssStyles({ color: titleColor });
			header
				.querySelector<HTMLElement>(".sf-codeblock-header-left")
				?.appendChild(titleNode);
		}
	} else if (titleEl) {
		titleEl.remove();
	}

	const iconEl = header.querySelector<HTMLElement>(".sf-codeblock-icon");
	const iconsList = (window.SFIconManager?.getIcons() ?? []) as LanguageIcon[];
	const icon = langConfig?.config?.icon
		? getIconForLanguage(langConfig.config.icon, iconsList)
		: null;
	const iconSizeRaw =
		langConfig?.config?.iconSize || icon?.backgroundSize || null;
	const iconSizeValue = getCodeBlockIconSizeValue(iconSizeRaw);
	if (iconEl && icon) {
		applyIconZoomStyles(iconEl, iconSizeRaw);
		if (icon.isColored) {
			iconEl.setCssProps({ "--icon-bg-image": icon.dataUrl, "--icon-bg-size": iconSizeValue, "--icon-bg-color": "transparent" });
			iconEl.classList.add("sf-codeblock-icon-colored");
		} else {
			iconEl.classList.remove("sf-codeblock-icon-colored");
			iconEl.setCssProps({ "--icon-mask-image": icon.dataUrl, "--icon-mask-size": iconSizeValue, "--icon-bg-color": languageColor });
		}
	}
}

export function getCodeBlockIconSizeValue(
	rawSize: string | number | null | undefined,
): string {
	if (rawSize === null || rawSize === undefined) {
		return "contain";
	}
	const value = rawSize.toString().trim();
	if (!value) {
		return "contain";
	}
	if (/^\d+(?:\.\d+)?$/.test(value)) {
		return `${value}%`;
	}
	return value;
}

export function getCodeBlockIconScaleValue(
	rawSize: string | number | null | undefined,
): number {
	if (rawSize === null || rawSize === undefined) {
		return 1;
	}
	const value = rawSize.toString().trim();
	if (!value) {
		return 1;
	}
	const percentMatch = value.match(/^(\d+(?:\.\d+)?)\s*%$/);
	if (percentMatch) {
		const matchValue = percentMatch[1];
		if (matchValue) {
			return parseFloat(matchValue) / 100;
		}
	}
	if (/^\d+(?:\.\d+)?$/.test(value)) {
		const numericValue = parseFloat(value);
		if (numericValue > 1) {
			const normalizedValue = value.replace(/\.0+$/g, "");
			const integerLike = /^\d+$/.test(normalizedValue);
			if (integerLike || numericValue >= 10) {
				return numericValue / 100;
			}
		}
		return numericValue;
	}
	return 1;
}

export function applyIconZoomStyles(
	el: HTMLElement | null,
	rawSize: string | number | null | undefined,
): void {
	if (!el) {
		return;
	}
	const scale = getCodeBlockIconScaleValue(rawSize);
	el.setCssStyles({ transformOrigin: "center", transform: `scale(${scale})` });
}

export function createCodeBlockHeader(
	params: CodeblockParameters,
	langConfig: { name: string; config: CodeBlockLanguageConfig } | null,
	icon: LanguageIcon | null,
	settings: CodeBlocksSettings,
): HTMLElement {
	const header = document.createElement("div");
	header.className = "sf-codeblock-header";

	const baseLanguageColor =
		langConfig?.config?.languageColor ||
		langConfig?.config?.color ||
		"#6c757d";
	const languageColor = params.langColor || baseLanguageColor;
	const titleColor =
		params.titleColor || langConfig?.config?.titleColor || languageColor;
	const borderColor = langConfig?.config?.borderColor || languageColor;

	header.setCssProps({
		"--sf-cb-language-color": languageColor,
		"--sf-cb-title-color": titleColor,
		"--sf-cb-border-color": borderColor,
	});

	const leftSection = createDiv({ cls: "sf-codeblock-header-left" });

	if (icon) {
		const iconSizeRaw =
			langConfig?.config?.iconSize || icon?.backgroundSize || null;
		const iconSizeValue = getCodeBlockIconSizeValue(iconSizeRaw);
		const iconEl = createSpan({ cls: "sf-codeblock-icon" });
		applyIconZoomStyles(iconEl, iconSizeRaw);
		if (icon.isColored) {
			iconEl.setCssProps({ "--icon-bg-image": icon.dataUrl, "--icon-bg-size": iconSizeValue, "--icon-bg-color": "transparent" });
			iconEl.classList.add("sf-codeblock-icon-colored");
		} else {
			iconEl.setCssProps({ "--icon-mask-image": icon.dataUrl, "--icon-mask-size": iconSizeValue, "--icon-bg-color": languageColor });
		}
		leftSection.appendChild(iconEl);
	}

	if (params.language) {
		const langEl = createSpan({ cls: "sf-codeblock-language", text: langConfig?.config?.displayName || langConfig?.name || params.language });
		langEl.setCssStyles({ color: languageColor });
		leftSection.appendChild(langEl);
	}

	if (params.title) {
		const titleEl = createSpan({ cls: "sf-codeblock-title", text: params.title });
		titleEl.setCssStyles({ color: titleColor });
		leftSection.appendChild(titleEl);
	}

	header.appendChild(leftSection);

	if (settings.showCopyButton) {
		const rightSection = createDiv({ cls: "sf-codeblock-header-right" });

		const copyBtn = rightSection.createEl("button", {
			cls: "sf-codeblock-copy",
			attr: { "aria-label": "Copy code", "data-copied": "false" },
		});
		setSvgIcon(copyBtn, COPY_ICON_SVG);

		header.appendChild(rightSection);
	}

	return header;
}

export function createLineWrapper(
	content: string | Node | null,
	lineNum: number,
	showLineNumber: boolean,
	isHighlighted: boolean,
): HTMLElement {
	const line = document.createElement("div");
	line.className = "sf-codeblock-line";
	line.setAttribute("data-line", lineNum.toString());

	if (isHighlighted) {
		line.classList.add("sf-codeblock-line-highlighted");
	}

	if (showLineNumber) {
		const lineNumEl = document.createElement("span");
		lineNumEl.className = "sf-codeblock-line-number";
		lineNumEl.textContent = lineNum.toString();
		line.appendChild(lineNumEl);
	}

	const lineContent = createSpan({ cls: "sf-codeblock-line-content" });
	if (typeof content === "string") {
		if (content) {
			lineContent.setText(content);
		} else {
			lineContent.setText("\u00A0");
		}
	} else if (content) {
		lineContent.appendChild(content);
	} else {
		lineContent.setText("\u00A0");
	}
	line.appendChild(lineContent);

	return line;
}

export async function copyCodeToClipboard(
	button: HTMLElement,
	code: string,
): Promise<void> {
	try {
		await navigator.clipboard.writeText(code);
		button.setAttribute("data-copied", "true");
		setSvgIcon(button, CHECK_ICON_SVG);

		setTimeout(() => {
			button.setAttribute("data-copied", "false");
			setSvgIcon(button, COPY_ICON_SVG);
		}, 2000);
	} catch (err) {
		console.error("Failed to copy code:", err);
		new Notice("Failed to copy code to clipboard");
	}
}
