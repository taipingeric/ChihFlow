"""
ChihFlow Backend – no-code drag-and-drop agent flow builder.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

app = FastAPI(title="ChihFlow API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory store (replace with a DB for production)
# ---------------------------------------------------------------------------
_workflows: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class Position(BaseModel):
    x: float
    y: float


class NodeData(BaseModel):
    label: str = ""
    config: dict[str, Any] = Field(default_factory=dict)


class FlowNode(BaseModel):
    id: str
    type: str  # input | llm | tool | condition | output
    position: Position
    data: NodeData


class FlowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str | None = None
    targetHandle: str | None = None


class WorkflowCreate(BaseModel):
    name: str
    description: str = ""
    nodes: list[FlowNode] = Field(default_factory=list)
    edges: list[FlowEdge] = Field(default_factory=list)


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    nodes: list[FlowNode] | None = None
    edges: list[FlowEdge] | None = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: str
    nodes: list[FlowNode]
    edges: list[FlowEdge]
    created_at: str
    updated_at: str


class ExecuteRequest(BaseModel):
    input: dict[str, Any] = Field(default_factory=dict)


class ExecuteResponse(BaseModel):
    workflow_id: str
    status: str
    result: dict[str, Any]
    execution_log: list[str]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _to_response(wf: dict) -> WorkflowResponse:
    return WorkflowResponse(**wf)


# ---------------------------------------------------------------------------
# Routes – Workflows
# ---------------------------------------------------------------------------
@app.get("/api/workflows", response_model=list[WorkflowResponse])
def list_workflows():
    return [_to_response(wf) for wf in _workflows.values()]


@app.post("/api/workflows", response_model=WorkflowResponse, status_code=201)
def create_workflow(body: WorkflowCreate):
    wf_id = str(uuid.uuid4())
    now = _now()
    wf = {
        "id": wf_id,
        "name": body.name,
        "description": body.description,
        "nodes": [n.model_dump() for n in body.nodes],
        "edges": [e.model_dump() for e in body.edges],
        "created_at": now,
        "updated_at": now,
    }
    _workflows[wf_id] = wf
    return _to_response(wf)


@app.get("/api/workflows/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(workflow_id: str):
    wf = _workflows.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _to_response(wf)


@app.put("/api/workflows/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(workflow_id: str, body: WorkflowUpdate):
    wf = _workflows.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if body.name is not None:
        wf["name"] = body.name
    if body.description is not None:
        wf["description"] = body.description
    if body.nodes is not None:
        wf["nodes"] = [n.model_dump() for n in body.nodes]
    if body.edges is not None:
        wf["edges"] = [e.model_dump() for e in body.edges]
    wf["updated_at"] = _now()
    return _to_response(wf)


@app.delete("/api/workflows/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: str):
    if workflow_id not in _workflows:
        raise HTTPException(status_code=404, detail="Workflow not found")
    del _workflows[workflow_id]


# ---------------------------------------------------------------------------
# Route – Execute
# ---------------------------------------------------------------------------
@app.post("/api/workflows/{workflow_id}/execute", response_model=ExecuteResponse)
def execute_workflow(workflow_id: str, body: ExecuteRequest):
    wf = _workflows.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    nodes: list[dict] = wf["nodes"]
    edges: list[dict] = wf["edges"]
    log: list[str] = []
    context: dict[str, Any] = dict(body.input)

    # Build adjacency map: node_id -> list[target_node_id]
    adj: dict[str, list[str]] = {n["id"]: [] for n in nodes}
    for e in edges:
        adj.setdefault(e["source"], []).append(e["target"])

    # Find start nodes (no incoming edges)
    targets = {e["target"] for e in edges}
    start_ids = [n["id"] for n in nodes if n["id"] not in targets]

    node_map = {n["id"]: n for n in nodes}

    def execute_node(node_id: str, visited: set[str]) -> None:
        if node_id in visited:
            return
        visited.add(node_id)
        node = node_map[node_id]
        ntype = node["type"]
        label = node["data"].get("label", node_id)
        cfg = node["data"].get("config", {})

        if ntype == "input":
            log.append(f"[input] '{label}' – passing input: {context}")
        elif ntype == "llm":
            model = cfg.get("model", "gpt-4o-mini")
            prompt = cfg.get("prompt", "")
            log.append(
                f"[llm] '{label}' – would call model={model} with prompt='{prompt}'"
            )
            context["llm_output"] = f"<LLM response from {model}>"
        elif ntype == "tool":
            tool_name = cfg.get("tool_name", "unknown_tool")
            log.append(f"[tool] '{label}' – would invoke tool='{tool_name}'")
            context["tool_output"] = f"<output from {tool_name}>"
        elif ntype == "condition":
            expr = cfg.get("expression", "true")
            log.append(f"[condition] '{label}' – evaluating expression='{expr}'")
        elif ntype == "output":
            log.append(f"[output] '{label}' – final context: {context}")
        else:
            log.append(f"[{ntype}] '{label}' – (unknown node type, skipped)")

        for next_id in adj.get(node_id, []):
            execute_node(next_id, visited)

    visited: set[str] = set()
    for sid in start_ids:
        execute_node(sid, visited)

    return ExecuteResponse(
        workflow_id=workflow_id,
        status="completed",
        result=context,
        execution_log=log,
    )


# ---------------------------------------------------------------------------
# Node-type catalogue
# ---------------------------------------------------------------------------
NODE_TYPES = [
    {
        "type": "input",
        "label": "Input",
        "description": "Entry point of the workflow",
        "color": "#22c55e",
        "configSchema": [],
    },
    {
        "type": "llm",
        "label": "LLM",
        "description": "Call a language model",
        "color": "#6366f1",
        "configSchema": [
            {"key": "model", "label": "Model", "type": "text", "default": "gpt-4o-mini"},
            {"key": "prompt", "label": "Prompt", "type": "textarea", "default": ""},
        ],
    },
    {
        "type": "tool",
        "label": "Tool",
        "description": "Invoke an external tool or API",
        "color": "#f59e0b",
        "configSchema": [
            {"key": "tool_name", "label": "Tool Name", "type": "text", "default": ""},
            {"key": "endpoint", "label": "Endpoint URL", "type": "text", "default": ""},
        ],
    },
    {
        "type": "condition",
        "label": "Condition",
        "description": "Branch the flow based on a condition",
        "color": "#ec4899",
        "configSchema": [
            {
                "key": "expression",
                "label": "Expression",
                "type": "text",
                "default": "true",
            }
        ],
    },
    {
        "type": "output",
        "label": "Output",
        "description": "Exit point of the workflow",
        "color": "#ef4444",
        "configSchema": [],
    },
]


@app.get("/api/node-types")
def get_node_types():
    return NODE_TYPES


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve the React frontend (production build) from ../frontend/dist
# Mount AFTER all API routes so /api/* is handled first.
# ---------------------------------------------------------------------------
_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=_FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        """Fall back to index.html for client-side routing."""
        return FileResponse(_FRONTEND_DIST / "index.html")
