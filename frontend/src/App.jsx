import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import AgentNode from './components/AgentNode';
import NodeSidebar from './components/NodeSidebar';
import ConfigPanel from './components/ConfigPanel';
import ExecutionLog from './components/ExecutionLog';
import WorkflowList from './components/WorkflowList';
import {
  fetchNodeTypes,
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  executeWorkflow,
} from './api';

const nodeTypes = {
  input: AgentNode,
  llm: AgentNode,
  tool: AgentNode,
  condition: AgentNode,
  output: AgentNode,
};

let nodeCounter = 1;

function FlowEditor() {
  const reactFlowWrapper = useRef(null);
  const [rfInstance, setRfInstance] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [availableNodeTypes, setAvailableNodeTypes] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [executionLog, setExecutionLog] = useState(null);
  const [showWorkflowList, setShowWorkflowList] = useState(false);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState(null);

  // Load node types and workflows on mount
  useEffect(() => {
    fetchNodeTypes()
      .then(setAvailableNodeTypes)
      .catch(() => showToast('Could not connect to backend. Is it running?', 'error'));
    loadWorkflows();
  }, []);

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function loadWorkflows() {
    try {
      const wfs = await listWorkflows();
      setWorkflows(wfs);
    } catch {
      // backend may not be running yet
    }
  }

  // Select node for config
  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setShowWorkflowList(false);
  }, []);

  // Connect edges
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366f1' } }, eds)),
    [setEdges]
  );

  // Drop node from sidebar
  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/reactflow-type');
      if (!type || !rfInstance) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });

      const ntMeta = availableNodeTypes.find((n) => n.type === type) || {};
      const id = `${type}-${nodeCounter++}`;
      const newNode = {
        id,
        type,
        position,
        data: {
          label: ntMeta.label || type,
          config: Object.fromEntries(
            (ntMeta.configSchema || []).map((f) => [f.key, f.default || ''])
          ),
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [rfInstance, availableNodeTypes, setNodes]
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // Update node config from ConfigPanel
  function handleNodeChange(nodeId, { label, config }) {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label, config } } : n
      )
    );
    setSelectedNode((prev) =>
      prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, label, config } } : prev
    );
  }

  // Convert ReactFlow state to API shape
  function flowToApiShape() {
    return {
      name: workflowName,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || null,
        targetHandle: e.targetHandle || null,
      })),
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = flowToApiShape();
      if (activeWorkflow) {
        const updated = await updateWorkflow(activeWorkflow.id, payload);
        setActiveWorkflow(updated);
        showToast('Workflow saved!', 'success');
      } else {
        const created = await createWorkflow(payload);
        setActiveWorkflow(created);
        showToast('Workflow created!', 'success');
      }
      await loadWorkflows();
    } catch {
      showToast('Failed to save workflow.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRun() {
    if (!activeWorkflow) {
      showToast('Save the workflow first.', 'error');
      return;
    }
    setRunning(true);
    try {
      // auto-save before run
      const payload = flowToApiShape();
      await updateWorkflow(activeWorkflow.id, payload);
      const result = await executeWorkflow(activeWorkflow.id);
      setExecutionLog(result.execution_log);
    } catch {
      showToast('Failed to execute workflow.', 'error');
    } finally {
      setRunning(false);
    }
  }

  function handleSelectWorkflow(wf) {
    setActiveWorkflow(wf);
    setWorkflowName(wf.name);
    nodeCounter = 1;
    setNodes(
      wf.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      }))
    );
    setEdges(
      wf.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        animated: true,
        style: { stroke: '#6366f1' },
      }))
    );
    setSelectedNode(null);
    setShowWorkflowList(false);
  }

  async function handleCreateWorkflow(name) {
    try {
      const created = await createWorkflow({ name, nodes: [], edges: [] });
      setWorkflows((prev) => [...prev, created]);
      handleSelectWorkflow(created);
    } catch {
      showToast('Failed to create workflow.', 'error');
    }
  }

  async function handleDeleteWorkflow(id) {
    try {
      await deleteWorkflow(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      if (activeWorkflow?.id === id) {
        setActiveWorkflow(null);
        setWorkflowName('Untitled Workflow');
        setNodes([]);
        setEdges([]);
      }
    } catch {
      showToast('Failed to delete workflow.', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top bar */}
      <div
        style={{
          height: 52,
          background: '#1e293b',
          borderBottom: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <span style={{ fontSize: 22 }}>🌊</span>
          <span style={{ fontWeight: 800, fontSize: 18, color: '#6366f1', letterSpacing: -0.5 }}>
            ChihFlow
          </span>
        </div>

        {/* Workflow selector */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowWorkflowList((v) => !v)}
            style={btnStyle('#334155')}
          >
            📂 Workflows ▾
          </button>
          {showWorkflowList && (
            <WorkflowList
              workflows={workflows}
              activeId={activeWorkflow?.id}
              onSelect={handleSelectWorkflow}
              onCreate={handleCreateWorkflow}
              onDelete={handleDeleteWorkflow}
            />
          )}
        </div>

        {/* Workflow name */}
        <input
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 14,
            fontWeight: 600,
            color: '#f1f5f9',
            outline: 'none',
            minWidth: 160,
            transition: 'border 0.15s',
          }}
          onFocus={(e) => (e.target.style.border = '1px solid #334155')}
          onBlur={(e) => (e.target.style.border = '1px solid transparent')}
        />

        <div style={{ flex: 1 }} />

        {/* New canvas button */}
        <button
          onClick={() => {
            setActiveWorkflow(null);
            setWorkflowName('Untitled Workflow');
            setNodes([]);
            setEdges([]);
            setSelectedNode(null);
          }}
          style={btnStyle('#334155')}
        >
          + New
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={btnStyle('#6366f1')}
        >
          {saving ? '…' : '💾 Save'}
        </button>

        {/* Run */}
        <button
          onClick={handleRun}
          disabled={running}
          style={btnStyle('#22c55e')}
        >
          {running ? '⏳ Running…' : '▶ Run'}
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left sidebar */}
        <NodeSidebar nodeTypes={availableNodeTypes} />

        {/* Canvas */}
        <div ref={reactFlowWrapper} style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: false }}
            style={{ background: '#0f172a' }}
            deleteKeyCode="Delete"
          >
            <Background color="#1e293b" gap={20} size={1} />
            <Controls
              style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            />
            <MiniMap
              nodeColor={(n) => {
                const colors = { input: '#22c55e', llm: '#6366f1', tool: '#f59e0b', condition: '#ec4899', output: '#ef4444' };
                return colors[n.type] || '#64748b';
              }}
              style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            />
          </ReactFlow>

          {/* Empty state hint */}
          {nodes.length === 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                color: '#334155',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>🌊</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Drag nodes here to build your workflow</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>← Pick a node type from the left panel</div>
            </div>
          )}

          {/* Execution Log */}
          {executionLog && (
            <ExecutionLog log={executionLog} onClose={() => setExecutionLog(null)} />
          )}
        </div>

        {/* Right config panel */}
        {selectedNode && (
          <ConfigPanel
            node={selectedNode}
            nodeTypes={availableNodeTypes}
            onChange={handleNodeChange}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#22c55e' : '#6366f1',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 4px 16px #0006',
            zIndex: 9999,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function btnStyle(bg) {
  return {
    background: bg,
    color: '#f1f5f9',
    border: 'none',
    borderRadius: 7,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    whiteSpace: 'nowrap',
  };
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}

