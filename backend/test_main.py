"""Tests for the ChihFlow FastAPI backend."""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_get_node_types():
    res = client.get("/api/node-types")
    assert res.status_code == 200
    types = res.json()
    node_type_names = [nt["type"] for nt in types]
    for expected in ("input", "llm", "tool", "condition", "output"):
        assert expected in node_type_names


def test_list_workflows_initially_empty():
    res = client.get("/api/workflows")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_create_workflow():
    res = client.post(
        "/api/workflows",
        json={"name": "Test Flow", "description": "A test workflow"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Test Flow"
    assert "id" in data
    assert data["nodes"] == []
    assert data["edges"] == []


def test_get_workflow():
    create_res = client.post("/api/workflows", json={"name": "GetFlow"})
    wf_id = create_res.json()["id"]

    res = client.get(f"/api/workflows/{wf_id}")
    assert res.status_code == 200
    assert res.json()["id"] == wf_id


def test_get_workflow_not_found():
    res = client.get("/api/workflows/does-not-exist")
    assert res.status_code == 404


def test_update_workflow():
    create_res = client.post("/api/workflows", json={"name": "Old Name"})
    wf_id = create_res.json()["id"]

    update_res = client.put(f"/api/workflows/{wf_id}", json={"name": "New Name"})
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "New Name"


def test_update_workflow_with_nodes_and_edges():
    create_res = client.post("/api/workflows", json={"name": "NodeFlow"})
    wf_id = create_res.json()["id"]

    payload = {
        "nodes": [
            {"id": "input-1", "type": "input", "position": {"x": 0, "y": 0}, "data": {"label": "Start", "config": {}}},
            {"id": "llm-1", "type": "llm", "position": {"x": 200, "y": 0}, "data": {"label": "LLM", "config": {"model": "gpt-4o-mini", "prompt": "Say hello"}}},
            {"id": "output-1", "type": "output", "position": {"x": 400, "y": 0}, "data": {"label": "End", "config": {}}},
        ],
        "edges": [
            {"id": "e1", "source": "input-1", "target": "llm-1"},
            {"id": "e2", "source": "llm-1", "target": "output-1"},
        ],
    }
    update_res = client.put(f"/api/workflows/{wf_id}", json=payload)
    assert update_res.status_code == 200
    data = update_res.json()
    assert len(data["nodes"]) == 3
    assert len(data["edges"]) == 2


def test_delete_workflow():
    create_res = client.post("/api/workflows", json={"name": "ToDelete"})
    wf_id = create_res.json()["id"]

    del_res = client.delete(f"/api/workflows/{wf_id}")
    assert del_res.status_code == 204

    get_res = client.get(f"/api/workflows/{wf_id}")
    assert get_res.status_code == 404


def test_delete_workflow_not_found():
    res = client.delete("/api/workflows/does-not-exist")
    assert res.status_code == 404


def test_execute_workflow():
    create_res = client.post("/api/workflows", json={"name": "ExecFlow"})
    wf_id = create_res.json()["id"]

    # Add nodes
    nodes = [
        {"id": "input-1", "type": "input", "position": {"x": 0, "y": 0}, "data": {"label": "Start", "config": {}}},
        {"id": "llm-1", "type": "llm", "position": {"x": 200, "y": 0}, "data": {"label": "LLM", "config": {"model": "gpt-4o-mini", "prompt": "hello"}}},
        {"id": "output-1", "type": "output", "position": {"x": 400, "y": 0}, "data": {"label": "End", "config": {}}},
    ]
    edges = [
        {"id": "e1", "source": "input-1", "target": "llm-1"},
        {"id": "e2", "source": "llm-1", "target": "output-1"},
    ]
    client.put(f"/api/workflows/{wf_id}", json={"nodes": nodes, "edges": edges})

    exec_res = client.post(
        f"/api/workflows/{wf_id}/execute",
        json={"input": {"user": "Alice"}},
    )
    assert exec_res.status_code == 200
    data = exec_res.json()
    assert data["status"] == "completed"
    assert data["workflow_id"] == wf_id
    assert isinstance(data["execution_log"], list)
    assert len(data["execution_log"]) == 3  # input, llm, output
    assert "llm_output" in data["result"]


def test_execute_workflow_not_found():
    res = client.post("/api/workflows/does-not-exist/execute", json={})
    assert res.status_code == 404


def test_execute_condition_node():
    create_res = client.post("/api/workflows", json={"name": "CondFlow"})
    wf_id = create_res.json()["id"]
    nodes = [
        {"id": "input-1", "type": "input", "position": {"x": 0, "y": 0}, "data": {"label": "In", "config": {}}},
        {"id": "cond-1", "type": "condition", "position": {"x": 200, "y": 0}, "data": {"label": "Branch", "config": {"expression": "x > 0"}}},
    ]
    edges = [{"id": "e1", "source": "input-1", "target": "cond-1"}]
    client.put(f"/api/workflows/{wf_id}", json={"nodes": nodes, "edges": edges})

    exec_res = client.post(f"/api/workflows/{wf_id}/execute", json={})
    assert exec_res.status_code == 200
    log = exec_res.json()["execution_log"]
    assert any("[condition]" in line for line in log)


def test_execute_tool_node():
    create_res = client.post("/api/workflows", json={"name": "ToolFlow"})
    wf_id = create_res.json()["id"]
    nodes = [
        {"id": "input-1", "type": "input", "position": {"x": 0, "y": 0}, "data": {"label": "In", "config": {}}},
        {"id": "tool-1", "type": "tool", "position": {"x": 200, "y": 0}, "data": {"label": "Fetch", "config": {"tool_name": "web_search", "endpoint": "https://example.com"}}},
    ]
    edges = [{"id": "e1", "source": "input-1", "target": "tool-1"}]
    client.put(f"/api/workflows/{wf_id}", json={"nodes": nodes, "edges": edges})

    exec_res = client.post(f"/api/workflows/{wf_id}/execute", json={})
    assert exec_res.status_code == 200
    log = exec_res.json()["execution_log"]
    assert any("[tool]" in line for line in log)
    assert "tool_output" in exec_res.json()["result"]
