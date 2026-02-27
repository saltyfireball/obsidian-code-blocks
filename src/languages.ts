export type CodeBlockLanguages = Record<string, CodeBlockLanguageConfig>;

export interface CodeBlockLanguageConfig {
  languageColor?: string | null;
  titleColor?: string | null;
  borderColor?: string | null;
  icon?: string | null;
  displayName?: string | null;
  aliases?: string[];
  color?: string | null;
  iconSize?: string | number | null;
}

export interface LanguageIcon {
  id: string;
  dataUrl: string;
  isColored?: boolean;
  backgroundSize?: string;
}

export function resolveLanguageConfig(
  language?: string | null,
  codeBlockLanguages?: CodeBlockLanguages,
): { name: string; config: CodeBlockLanguageConfig } | null {
  if (!language || !codeBlockLanguages) {
    return null;
  }

  const lang = language.toLowerCase();

  const directConfig = codeBlockLanguages[lang];
  if (directConfig) {
    return { name: lang, config: directConfig };
  }

  for (const [name, config] of Object.entries(codeBlockLanguages)) {
    if (config.aliases && config.aliases.includes(lang)) {
      return { name, config };
    }
  }

  return null;
}

export function getIconForLanguage(
  iconId?: string | null,
  icons?: LanguageIcon[],
): LanguageIcon | null {
  if (!iconId || !icons) {
    return null;
  }
  return icons.find((i) => i.id === iconId) || null;
}
