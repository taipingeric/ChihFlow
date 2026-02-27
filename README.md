# ChihFlow

A **no-code drag-and-drop agent flow builder** — similar to n8n or make.com — that lets you visually wire up AI agent workflows in your browser.

## Features

- 🎨 **Visual canvas** powered by [React Flow](https://reactflow.dev/) — drag, drop, and connect nodes
- 🤖 **Five built-in node types**: Input, LLM, Tool, Condition, Output
- ⚙️ **Per-node configuration panel** — set prompts, models, tool endpoints, expressions
- 💾 **Save & load workflows** via a REST API
- ▶️ **Execute workflows** with a step-by-step execution log
- 🗂 **Multiple workflows** — create, switch, and delete workflows from the top bar

## Project structure

```
ChihFlow/
├── backend/          # FastAPI REST API (Python)
│   ├── main.py       # API routes & workflow execution engine
│   ├── test_main.py  # Pytest test suite
│   └── requirements.txt
└── frontend/         # React + React Flow SPA
    ├── src/
    │   ├── App.jsx              # Main application shell
    │   ├── api.js               # Backend API client
    │   └── components/
    │       ├── AgentNode.jsx    # Custom node renderer
    │       ├── NodeSidebar.jsx  # Draggable node palette
    │       ├── ConfigPanel.jsx  # Node configuration panel
    │       ├── ExecutionLog.jsx # Execution result overlay
    │       └── WorkflowList.jsx # Workflow manager dropdown
    └── vite.config.js
```

## Quick start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# → http://localhost:8000
# → API docs at http://localhost:8000/docs
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Open **http://localhost:5173** in your browser.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/node-types` | List available node types |
| GET | `/api/workflows` | List all workflows |
| POST | `/api/workflows` | Create a workflow |
| GET | `/api/workflows/{id}` | Get a workflow |
| PUT | `/api/workflows/{id}` | Update a workflow |
| DELETE | `/api/workflows/{id}` | Delete a workflow |
| POST | `/api/workflows/{id}/execute` | Execute a workflow |
| GET | `/health` | Health check |

## Running tests

```bash
cd backend
pip install httpx pytest
pytest test_main.py -v
```

## Node types

| Type | Description |
|------|-------------|
| **Input** | Entry point — receives the initial payload |
| **LLM** | Calls a language model (model + prompt configurable) |
| **Tool** | Invokes an external tool or REST API endpoint |
| **Condition** | Branches on a boolean expression (true/false handles) |
| **Output** | Exit point — emits the final result |

