# Code Blocks

![Vim](https://img.shields.io/badge/vim-insert%20mode-fff?style=flat&logo=vim&logoColor=FFFFFF&label=vim&labelColor=5B595C&color=5C7CFA) ![Battery](https://img.shields.io/badge/battery-3%25-fff?style=flat&logo=batterylow&logoColor=FFFFFF&label=battery&labelColor=5B595C&color=FC9867) ![WordArt](https://img.shields.io/badge/wordart-maximalist-fff?style=flat&logo=microsoftword&logoColor=FFFFFF&label=wordart&labelColor=5B595C&color=78DCE8) ![RAM](https://img.shields.io/badge/ram-chrome%20ate%20it-fff?style=flat&logo=googlechrome&logoColor=FFFFFF&label=RAM&labelColor=5B595C&color=78DCE8) ![Productivity](https://img.shields.io/badge/productivity-alt%20tabbing%20intensifies-fff?style=flat&logo=tmux&logoColor=FFFFFF&label=productivity&labelColor=5B595C&color=AB9DF2) ![Voice Chat](https://img.shields.io/badge/voice%20chat-breathing%20detected-fff?style=flat&logo=discord&logoColor=FFFFFF&label=voice%20chat&labelColor=5B595C&color=FF6188) ![Clipboard](https://img.shields.io/badge/clipboard-ctrl%20c%20ctrl%20v-fff?style=flat&logo=stackoverflow&logoColor=FFFFFF&label=dev%20tool&labelColor=5B595C&color=AB9DF2) ![Reality](https://img.shields.io/badge/reality-open%20another%20ticket-fff?style=flat&logo=jira&logoColor=FFFFFF&label=reality&labelColor=5B595C&color=FF6188)

An Obsidian plugin that enhancescode blocks with language-based styling, headers, icons, colors, line numbers, copy buttons, custom CSS, and syntax highlighting powered by highlight.js.

## Features

- **Language Headers** -- Displays a styled header bar above code blocks showing the language name and optional icon
- **Custom Titles** -- Add titles to code blocks using fence parameters: ` ```python title:"My Script" `
- **Language Colors** -- Configure unique colors per language for the header, title, and left border
- **Language Icons** -- Assign icons from the shared Icon Library (via SFIconManager) to each language
- **Line Numbers** -- Toggle line numbers globally or per-block with `ln:true`/`ln:false`, offset with `ln:5`
- **Line Highlighting** -- Highlight specific lines with `hl:1,3-5,7`
- **Copy Button** -- One-click copy-to-clipboard button in the header
- **Custom CSS** -- Inject custom CSS scoped to code blocks with full access to CSS variables
- **Ignore Languages** -- Skip decoration for specific languages (default: mermaid, my-toc)
- **Syntax Highlighting** -- Replace Obsidian's default Prism.js with highlight.js for consistent highlighting across reading and live preview modes. Includes 5 built-in themes.

## Fence Parameters

Parameters are added after the language identifier on the opening fence line:

````
  ```python title:"My Script" ln:5 hl:1,3-5
  # your code here
````

````

| Parameter | Description | Example |
|-----------|-------------|---------|
| `title:"text"` | Custom title displayed in header | `title:"Hello World"` |
| `ln:true` | Enable line numbers for this block | `ln:true` |
| `ln:false` | Disable line numbers for this block | `ln:false` |
| `ln:5` | Start line numbers at 5 | `ln:5` |
| `hl:1,3-5,7` | Highlight specific lines | `hl:1,3-5` |

## Settings

### General
- Enable/disable code block styling
- Show/hide line numbers globally
- Show/hide copy button
- Custom background color
- Configurable ignore languages list

### Languages
- Add, edit, and delete language configurations
- Configure language color, title color, border color
- Assign icons and set icon size
- Define display names and aliases

### Custom CSS
- Full CSS editor with variables reference
- Import CSS from snippet files
- Available CSS variables: `--sf-cb-language-color`, `--sf-cb-title-color`, `--sf-cb-border-color`, `--sf-cb-background`

### Syntax Highlighting
- Enable/disable highlight.js integration
- Choose from 5 built-in themes (GitHub Dark, Monokai, Nord, One Dark, Dracula)
- Auto-detect language for untagged code blocks
- Browse all supported languages

## CSS Customization

Key selectors for custom styling:

- `.sf-codeblock-wrapper` -- Main wrapper
- `.sf-codeblock-header` -- Header bar
- `.sf-codeblock-icon` -- Language icon
- `.sf-codeblock-language` -- Language name
- `.sf-codeblock-title` -- Custom title
- `.sf-codeblock-copy` -- Copy button
- `.sf-codeblock-pre` -- Pre element
- `.sf-codeblock-gutter` -- Line number gutter
- `.sf-codeblock-line-highlighted` -- Highlighted line

## Installation

1. Copy the plugin folder to your vault's `.obsidian/plugins/` directory
2. Enable the plugin in Obsidian Settings > Community Plugins
3. Configure languages and settings in the plugin settings tab

## Settings Migration

If migrating from the main SaltyFireball plugin, extract settings with:

```bash
VAULT="/path/to/vault"
jq '{
  enabled: .enableCodeBlockTitles,
  showLineNumbers: .showLineNumbers,
  showCopyButton: .showCopyButton,
  backgroundColor: .codeBlockBackgroundColor,
  languages: .codeBlockLanguages,
  customCSS: .codeBlockCSS,
  ignoreLanguages: ["mermaid", "my-toc"],
  highlighter: .highlighter
}' "$VAULT/.obsidian/plugins/sfb/data.json" > "$VAULT/.obsidian/plugins/obsidian-code-blocks/data.json"
````

## License

MIT - See [LICENSE](LICENSE) for details.
