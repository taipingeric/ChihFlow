# ChihFlow

A no-code agent flow builder built with React Flow.

## Demo 影片

- https://youtu.be/IlZLZmEwrmA

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL shown in terminal (usually `http://localhost:5173`).

## 功能

- 從側邊欄拖曳節點類型到畫布
- 透過節點連接點拖曳建立連線
- 使用控制器與小地圖進行畫布平移與縮放
- 支援桌機與手機的響應式版面

## Dev system config

Default System node variables are loaded from:

- `src/config/system.default.json`

You can set dev defaults there, for example `OPENAI_API_KEY`.
