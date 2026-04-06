# Annotator

AI-powered document annotation tool. Highlight passages in any text or PDF, then ask Claude questions about them in threaded conversations.

![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-6-purple) ![Claude API](https://img.shields.io/badge/Claude-Sonnet_4-orange)

## Features

- **Highlight & Ask** — Select any passage to create a color-coded annotation, then ask Claude about it
- **PDF Upload** — Extract and annotate text from PDF files
- **Threaded Conversations** — Each highlight has its own chat thread with full context
- **Slash Commands**
  - `/skip` — Leave a comment without calling Claude
  - `/search` — Ask Claude with web search enabled
  - `/find` — Search within the document text
- **Context Control** — Toggle between sending the full document or just the highlighted passage to Claude
- **Multi-color Highlights** — 5 color options (Lemon, Rose, Sky, Mint, Lilac) with per-annotation color switching
- **Export** — Copy to clipboard, download as Markdown, or download as JSON
- **Import/Export JSON** — Save your session and pick up where you left off
- **Usernames** — Set your name for tracked annotations across collaborators

## Setup

```bash
git clone https://github.com/donjguido/annotator.git
cd annotator
npm install
```

### API Key

The app calls the Claude API directly from the browser. You'll need to configure your Anthropic API key. The `callClaude` function in `src/Annotator.jsx` makes requests to `https://api.anthropic.com/v1/messages` — you can either:

1. **Add a proxy** that injects your API key server-side (recommended for production)
2. **Modify the fetch headers** to include your key for local development:
   ```js
   headers: {
     "Content-Type": "application/json",
     "x-api-key": "YOUR_API_KEY",
     "anthropic-version": "2023-06-01",
     "anthropic-dangerous-direct-browser-access": "true",
   }
   ```

### Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Usage

1. **Paste or upload** — Paste text in Edit mode or upload a PDF
2. **Switch to Annotate** — Click the Annotate toggle
3. **Highlight** — Select text to create a color-coded annotation
4. **Ask** — Type a question in the sidebar and press Enter
5. **Export** — Use the Export menu to save your work

## Tech Stack

- [React 19](https://react.dev) + [Vite 6](https://vite.dev)
- [Claude API](https://docs.anthropic.com/en/docs/about-claude/models) (Sonnet 4)
- [PDF.js](https://mozilla.github.io/pdf.js/) for PDF text extraction
- [Literata](https://fonts.google.com/specimen/Literata) + [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) fonts

## License

MIT
