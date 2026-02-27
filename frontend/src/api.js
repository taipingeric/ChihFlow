const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function fetchNodeTypes() {
  const res = await fetch(`${API_BASE}/api/node-types`);
  if (!res.ok) throw new Error('Failed to fetch node types');
  return res.json();
}

export async function listWorkflows() {
  const res = await fetch(`${API_BASE}/api/workflows`);
  if (!res.ok) throw new Error('Failed to list workflows');
  return res.json();
}

export async function createWorkflow(data) {
  const res = await fetch(`${API_BASE}/api/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create workflow');
  return res.json();
}

export async function updateWorkflow(id, data) {
  const res = await fetch(`${API_BASE}/api/workflows/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update workflow');
  return res.json();
}

export async function deleteWorkflow(id) {
  const res = await fetch(`${API_BASE}/api/workflows/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete workflow');
}

export async function executeWorkflow(id, input = {}) {
  const res = await fetch(`${API_BASE}/api/workflows/${id}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) throw new Error('Failed to execute workflow');
  return res.json();
}
