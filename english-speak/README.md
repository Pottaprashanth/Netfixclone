# SpeakEnglish - Browser App

A no-build, browser-based app to learn and practice spoken English from beginner to advanced levels. Uses your browser's Speech Synthesis (text-to-speech) and Speech Recognition (speech-to-text) when available. Progress is stored locally in your browser.

## Features
- Levels: Beginner (A1/A2), Intermediate (B1/B2), Advanced (C1)
- Lesson types:
  - Listen & Repeat with pronunciation scoring
  - Role-play conversations with real-time feedback
  - Vocabulary flashcards with spaced repetition
- Text-to-Speech with voice and speed controls
- Speech Recognition with live transcript and scoring
- Offline-friendly (static files); no server needed beyond a static host

## Requirements
- A modern Chromium-based browser (for best Speech Recognition support)
- Microphone access (for speaking exercises)

## Quick start

Option 1: Start a simple Python static server

```bash
cd /workspace/english-speak
python3 -m http.server 3000
```
Then open `http://localhost:3000/` in your browser.

Option 2: Any static server
Serve the directory `/workspace/english-speak` with your favorite static server.

## Notes
- If Speech Recognition is not supported by your browser, the app will fall back to manual typing for answers.
- All progress is saved in `localStorage` in your browser. Clearing site data will reset progress.

## Project structure
```
english-speak/
  index.html
  styles.css
  app.js
  data/
    curriculum.json
  README.md
```

## License
MIT