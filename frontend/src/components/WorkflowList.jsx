import { useState } from 'react';

export default function WorkflowList({ workflows, activeId, onSelect, onCreate, onDelete }) {
  const [name, setName] = useState('');

  function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
    setName('');
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 56,
        left: 210,
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 10,
        boxShadow: '0 8px 32px #0008',
        zIndex: 2000,
        width: 280,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #334155' }}>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 6 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New workflow name…"
            style={{
              flex: 1,
              background: '#0f172a',
              border: '1.5px solid #334155',
              borderRadius: 6,
              padding: '6px 9px',
              fontSize: 13,
              color: '#f1f5f9',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            +
          </button>
        </form>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {workflows.length === 0 && (
          <div style={{ padding: '16px 14px', color: '#64748b', fontSize: 13 }}>
            No workflows yet. Create one above.
          </div>
        )}
        {workflows.map((wf) => (
          <div
            key={wf.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 14px',
              background: wf.id === activeId ? '#0f172a' : 'transparent',
              borderBottom: '1px solid #1e293b',
              gap: 8,
            }}
          >
            <div
              style={{ flex: 1, cursor: 'pointer' }}
              onClick={() => onSelect(wf)}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{wf.name}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {wf.nodes.length} nodes · {wf.edges.length} edges
              </div>
            </div>
            <button
              onClick={() => onDelete(wf.id)}
              style={{
                background: 'none',
                border: 'none',
                color: '#475569',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
              }}
              title="Delete workflow"
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
