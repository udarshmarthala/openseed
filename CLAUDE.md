# Open Seed — CLAUDE.md

## Project Overview

Open Seed is a browser-based task automation system that learns by watching the user perform tasks. User runs a "seed," completes a task normally, and the seed grows into a "tree" through repeated observation. When confident enough, pressing Enter triggers the tree to run the task autonomously.

## Core Concept

- **Seed**: dormant recorder, no automation yet
- **Sprout**: seen task 3+ times, offers autocomplete suggestions
- **Tree**: seen task 10+ times, runs autonomously on Enter trigger

Confidence grows with repetitions. Seed never runs until it has seen enough examples.

## Architecture

### Three Layers

```
Seed Layer (Chrome Extension / injected JS)
  → Click listener
  → Input listener
  → Page/URL tracker

Brain Layer (localStorage or Express backend)
  → Action sequence store (JSON)
  → Repetition counter per task
  → Confidence score per task

Tree Layer (Replay engine)
  → DOM selector matcher
  → Simulate events (dispatchEvent)
  → Wait-for-element logic before each step
```

### Tech Stack

- **Extension**: Chrome Manifest V3 (HTML + JS only, no build tool needed)
- **Storage**: `localStorage` for MVP, optional Express + SQLite for persistence
- **Replay**: native `dispatchEvent()` — no Puppeteer, no headless browser
- **UI**: minimal floating badge showing seed growth state

## File Structure

```
open-seed/
├── CLAUDE.md               ← this file
├── manifest.json           ← Chrome extension manifest V3
├── src/
│   ├── seed.js             ← event recorder (injected content script)
│   ├── brain.js            ← storage + confidence logic
│   ├── tree.js             ← replay engine
│   └── ui.js               ← floating badge + Enter trigger
├── popup/
│   ├── popup.html
│   └── popup.js            ← show recorded tasks, confidence levels
├── background/
│   └── service-worker.js   ← message passing between scripts
└── styles/
    └── badge.css
```

## Key Behaviors

### Recording (seed.js)
- Listen on `click`, `input`, `change`, `submit` events
- Capture: event type, CSS selector, value (if input), page URL, timestamp
- Use stable selectors in priority order: `id` > `data-*` attrs > `aria-label` > CSS class (last resort)
- Store sequence as ordered JSON array

### Confidence Logic (brain.js)
- Count how many times the same task sequence has been run
- Same task = same URL pattern + same sequence of selector types (fuzzy match, not exact)
- Thresholds: 1 = seed, 3 = sprout, 10 = tree
- Expose `getConfidence(taskId)` and `incrementRun(taskId)`

### Replay (tree.js)
- Iterate through stored action sequence
- For each step: wait for element to appear (MutationObserver or polling, max 5s timeout)
- Fire matching event via `dispatchEvent(new MouseEvent(...))` or `InputEvent`
- Stop and surface error if element not found

### Trigger
- Enter key fires replay only when seed is in "tree" state (confidence >= 10)
- Sprout state: show ghost/suggestion UI instead of auto-running
- Seed state: do nothing, keep recording

## Dev Rules

- No TypeScript for MVP — plain JS only, faster to iterate
- No external UI libraries — vanilla DOM
- Content script must not block page load — use `defer` or `DOMContentLoaded`
- All storage reads/writes go through `brain.js` only — no direct localStorage calls elsewhere
- Selectors stored must survive page refresh — test by closing and reopening tab before claiming a step works
- Never auto-replay on page load — only on explicit Enter trigger

## Known Hard Parts

1. **Selector drift**: elements change classes across sessions. Prefer `id` and `data-testid`.
2. **Timing**: async page loads mean replay must wait, not assume instant DOM availability.
3. **Generalization vs memorization**: MVP can memorize exact sequences. Future: fuzzy match inputs to generalize across slight variations.
4. **Cross-origin**: content scripts can't reach iframes from other origins. Document this limitation, don't try to solve it in MVP.

## MVP Scope (build this first)

- [ ] Record a single task on one page
- [ ] Store sequence in localStorage
- [ ] Show confidence badge (seed/sprout/tree)
- [ ] Replay on Enter when tree state reached
- [ ] Basic error handling if element not found during replay

## Out of Scope for MVP

- Multi-tab task sequences
- Natural language task naming (LLM integration)
- Cloud sync of learned tasks
- Cross-origin iframe support
- Mobile / non-Chrome browsers