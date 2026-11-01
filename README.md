# Avartan — VP Theory Companion (PWA)

Static site, no backend. Works offline once installed.

## Deploy on GitHub Pages (5 minutes, free)
1. Create a new repo on github.com (e.g. `avartan-vp`). Keep it public (Pages free tier needs public, or use a private repo if you have GitHub Pro).
2. Upload every file in this folder to the repo (drag-and-drop on the GitHub web UI works fine, or `git push`).
3. In the repo: **Settings → Pages → Source → Deploy from branch → main → /(root) → Save**.
4. Wait ~1 minute. Your app is live at `https://<your-username>.github.io/avartan-vp/`.
5. Open that URL on your phone in Chrome/Safari → menu → **Add to Home Screen**. It now opens full-screen, works offline, and has its own icon.

## Updating content later
Replace `quiz-data.json` / `cards-data.json` / `fullchap-data.json` and re-upload — no app rebuild needed.

## Testing locally before deploying
Don't just double-click `index.html` — opening it directly as a `file://` URL blocks the data fetches your browser does for security reasons. To test locally first, run a tiny local server from this folder:
```
python3 -m http.server 8000
```
then visit `http://localhost:8000`.

## Theme
Light (ecru) is the default; tap the 🌙/☀️ button in the header to switch to dark. Tapping the "आवर्तन" name in the header always takes you back to the home screen.

## Language toggle
Every topic card (skeleton, facts, AND full chapter) now respects the English/Devanagari toggle. Full chapters are sourced from your actual VP-01–VP-15 Devanagari study notes; the English version is a translation/summary of the same material.

## Important: after every update, reinstall on your phone
The service worker's cache version is bumped (currently `avartan-v5`) every time the underlying files change. If you've already added this app to your phone's home screen, **delete and re-add it** after uploading updated files — otherwise your phone may keep showing the old cached version.
