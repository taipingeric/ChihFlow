export default function ExecutionLog({ log, onClose }) {
  if (!log || log.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '60%',
        maxWidth: 700,
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 10,
        boxShadow: '0 8px 32px #0008',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid #334155',
          background: '#0f172a',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
          ✓ Execution Complete
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          padding: '12px 16px',
          maxHeight: 200,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {log.map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              color: line.startsWith('[llm]')
                ? '#818cf8'
                : line.startsWith('[tool]')
                ? '#fbbf24'
                : line.startsWith('[condition]')
                ? '#f472b6'
                : line.startsWith('[input]')
                ? '#86efac'
                : line.startsWith('[output]')
                ? '#fca5a5'
                : '#94a3b8',
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
