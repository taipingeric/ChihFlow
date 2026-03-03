# ChihFlow

A no-code agent flow builder built with React Flow.

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL shown in terminal (usually `http://localhost:5173`).

## Features

- Drag node types from sidebar to canvas
- Connect nodes by dragging between handles
- Pan/zoom canvas with controls and minimap
- Responsive layout for desktop and mobile

## Dev system config

Default System node variables are loaded from:

- `src/config/system.default.json`

You can set dev defaults there, for example `OPENAI_API_KEY`.
