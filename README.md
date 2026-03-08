# AteThat

A lightweight, no-server study app that turns study guides into quiz practice.

## What works in this build

- BYOK Gemini key (saved locally in browser)
- Upload file (image/PDF/txt/csv) or paste text
- AI extraction to editable study items (`term`, `answer`)
- Save study sets locally
- Start mixed quiz (MCQ + typed)
- Friendly grading for typed answers:
  - exact match
  - small typo ("almost there")
  - accent-insensitive support
- End summary + missed review list

## Run locally

Option A (easiest):
- Open `index.html` in Chrome.

Option B (recommended local server):
```bash
python3 -m http.server 8080
```
Then open: `http://localhost:8080/AteThat/`

## Host on GitHub Pages

1. Push `AteThat/` to a GitHub repo
2. In repo Settings → Pages:
   - Source: Deploy from branch
   - Branch: `main` / root (or `/docs` if you move files)
3. Open your Pages URL

## Notes

- API key is stored in localStorage on user device.
- No backend / no server state.
- Data stays in browser unless user exports or shares manually.

## Next recommended upgrades

- Add flashcard mode + spaced repetition
- Add set export/import JSON
- Better PDF parsing fallback for complex docs
- PWA install support for Chromebook homescreen
