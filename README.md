# Agent Skills: Skills Generator

A powerful VS Code extension that converts documentation URLs (Flutter docs, Pub.dev packages, etc.) into clean, AI-ready skills.

## Features

- Crawl documentation pages and convert them to structured Markdown
- Support for **Flat Structure** (multiple skills) or **Package Mode** (combined installation + examples + changelog)
- Custom rules (include/ignore subpaths)
- Creates well-formatted `skills.md` files with `skill_name` and `description`
- Sidebar integration for easy access

## How to Use

1. Open the **Skills Generator** view from the Activity Bar (sparkle icon ✨)
2. Enter a documentation or package URL
3. Configure settings (Flat Structure, Crawl Dependencies, Rules, etc.)
4. Click **Generate Skills**

The extension will create organized folders inside `.agents/skills/` ready for your AI agents.

## Development

- `npm run compile` — Compile the extension
- `vsce package` — Create `.vsix` file
- Press F5 in VS Code to test in Extension Development Host

---

Built for Flutter + AI developers who want clean, reusable knowledge bases.
