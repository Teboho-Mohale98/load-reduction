# LoadReduction ⚡

A static load shedding manager built with plain **HTML, CSS and JavaScript** — no build step, no dependencies.

## Features

- **Stage selector** (Off + Stages 1–8) with load hours per day
- **Block schedule (A–D)** — today's outage slots for your block, each labelled with its duration (e.g. "5-hour load reduction"), next-outage countdown, live "OFF NOW" highlight (real 2 h 30 slots)
- **Load calculator** — add appliances (watts, qty, hrs/day), gauge against your main breaker (A × V)
- **Reduction plan** — essential load for backup, battery runtime estimate, and which appliances to switch off to stay under the breaker
- **Reduction tips** for cutting household load
- Data persists in `localStorage`

## Run locally

Open `index.html` in a browser, or serve it:

```bash
npx serve .
```

## Deploy

- **Vercel**: import the repo — the default static preset works, no config needed
- **GitHub Pages / any static host**: works out of the box

## Note

Schedules use a simplified rotation model for planning. Confirm official times with your municipality or Eskom sePush.
