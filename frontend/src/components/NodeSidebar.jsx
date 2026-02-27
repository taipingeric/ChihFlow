const TYPE_COLORS = {
  input: '#22c55e',
  llm: '#6366f1',
  tool: '#f59e0b',
  condition: '#ec4899',
  output: '#ef4444',
};

const TYPE_ICONS = {
  input: '▶',
  llm: '🤖',
  tool: '🔧',
  condition: '◇',
  output: '⬛',
};

export default function NodeSidebar({ nodeTypes }) {
  function onDragStart(e, type) {
    e.dataTransfer.setData('application/reactflow-type', type);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div
      style={{
        width: 200,
        background: '#1e293b',
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '16px 14px 10px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          color: '#64748b',
          textTransform: 'uppercase',
        }}
      >
        Node Types
      </div>
      <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {nodeTypes.map((nt) => (
          <div
            key={nt.type}
            draggable
            onDragStart={(e) => onDragStart(e, nt.type)}
            title={nt.description}
            style={{
              background: '#0f172a',
              border: `1.5px solid ${TYPE_COLORS[nt.type] || '#334155'}`,
              borderRadius: 8,
              padding: '8px 10px',
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background 0.15s',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1e293b')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#0f172a')}
          >
            <span style={{ fontSize: 16 }}>{TYPE_ICONS[nt.type]}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{nt.label}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{nt.description}</div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 'auto',
          padding: '14px',
          fontSize: 11,
          color: '#475569',
          borderTop: '1px solid #334155',
        }}
      >
        Drag a node onto the canvas to add it to your workflow.
      </div>
    </div>
  );
}
