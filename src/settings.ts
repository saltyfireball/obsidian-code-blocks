import type { CodeBlockLanguageConfig, CodeBlockLanguages } from "./languages";
import type { HighlighterSettings } from "./highlighter/types";
import { DEFAULT_HIGHLIGHTER_SETTINGS } from "./highlighter/types";

export interface CodeBlocksSettings {
	enabled: boolean;
	showLineNumbers: boolean;
	showCopyButton: boolean;
	backgroundColor: string;
	languages: CodeBlockLanguages;
	customCSS: string;
	ignoreLanguages: string[];
	highlighter: HighlighterSettings;
}

export const DEFAULT_CODE_BLOCK_LANGUAGES: CodeBlockLanguages = {
	python: {
		languageColor: "#3572A5",
		titleColor: null,
		borderColor: null,
		icon: "python",
		displayName: "Python",
		aliases: [],
	},
	javascript: {
		languageColor: "#f1e05a",
		titleColor: null,
		borderColor: null,
		icon: "javascript",
		displayName: "JavaScript",
		aliases: ["js"],
	},
	typescript: {
		languageColor: "#3178c6",
		titleColor: null,
		borderColor: null,
		icon: "typescript",
		displayName: "TypeScript",
		aliases: ["ts"],
	},
	rust: {
		languageColor: "#dea584",
		titleColor: null,
		borderColor: null,
		icon: "rust",
		displayName: "Rust",
		aliases: [],
	},
	c: {
		languageColor: "#555555",
		titleColor: null,
		borderColor: null,
		icon: "c",
		displayName: "C",
		aliases: [],
	},
	cpp: {
		languageColor: "#f34b7d",
		titleColor: null,
		borderColor: null,
		icon: "cpp",
		displayName: "C++",
		aliases: ["c++"],
	},
	html: {
		languageColor: "#e34c26",
		titleColor: null,
		borderColor: null,
		icon: "html",
		displayName: "HTML",
		aliases: [],
	},
	css: {
		languageColor: "#563d7c",
		titleColor: null,
		borderColor: null,
		icon: "css",
		displayName: "CSS",
		aliases: [],
	},
	json: {
		languageColor: "#a6a6a6",
		titleColor: null,
		borderColor: null,
		icon: "json",
		displayName: "JSON",
		aliases: [],
	},
	yaml: {
		languageColor: "#cb171e",
		titleColor: null,
		borderColor: null,
		icon: "yaml",
		displayName: "YAML",
		aliases: ["yml"],
	},
	xml: {
		languageColor: "#0060ac",
		titleColor: null,
		borderColor: null,
		icon: "xml",
		displayName: "XML",
		aliases: [],
	},
	bash: {
		languageColor: "#89e051",
		titleColor: null,
		borderColor: null,
		icon: "bash",
		displayName: "Bash",
		aliases: ["shell", "sh", "zsh"],
	},
	powershell: {
		languageColor: "#012456",
		titleColor: null,
		borderColor: null,
		icon: "powershell",
		displayName: "PowerShell",
		aliases: ["ps1"],
	},
	sql: {
		languageColor: "#e38c00",
		titleColor: null,
		borderColor: null,
		icon: "database",
		displayName: "SQL",
		aliases: ["mysql", "postgres", "sqlite"],
	},
	ruby: {
		languageColor: "#701516",
		titleColor: null,
		borderColor: null,
		icon: "ruby",
		displayName: "Ruby",
		aliases: ["rb"],
	},
	php: {
		languageColor: "#4F5D95",
		titleColor: null,
		borderColor: null,
		icon: "php",
		displayName: "PHP",
		aliases: [],
	},
	markdown: {
		languageColor: "#083fa1",
		titleColor: null,
		borderColor: null,
		icon: "markdown",
		displayName: "Markdown",
		aliases: ["md"],
	},
	go: {
		languageColor: "#00ADD8",
		titleColor: null,
		borderColor: null,
		icon: "go",
		displayName: "Go",
		aliases: ["golang"],
	},
	java: {
		languageColor: "#b07219",
		titleColor: null,
		borderColor: null,
		icon: "java",
		displayName: "Java",
		aliases: [],
	},
};

export const DEFAULT_SETTINGS: CodeBlocksSettings = {
	enabled: false,
	showLineNumbers: true,
	showCopyButton: true,
	backgroundColor: "",
	languages: DEFAULT_CODE_BLOCK_LANGUAGES,
	customCSS: "",
	ignoreLanguages: ["mermaid", "my-toc"],
	highlighter: DEFAULT_HIGHLIGHTER_SETTINGS,
};
