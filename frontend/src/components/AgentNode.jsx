import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

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

function AgentNode({ data, selected, type }) {
  const color = TYPE_COLORS[type] || '#64748b';
  const icon = TYPE_ICONS[type] || '●';
  const hasInput = type !== 'input';
  const hasOutput = type !== 'output';
  const hasTrueFalse = type === 'condition';

  return (
    <div
      style={{
        background: selected ? '#1e293b' : '#0f172a',
        border: `2px solid ${selected ? color : '#334155'}`,
        borderRadius: 10,
        minWidth: 160,
        fontFamily: 'inherit',
        boxShadow: selected ? `0 0 0 2px ${color}44` : '0 2px 8px #0008',
        transition: 'border 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: color,
          borderRadius: '8px 8px 0 0',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: '#fff',
        }}
      >
        <span>{icon}</span>
        <span>{type.toUpperCase()}</span>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px', fontSize: 13 }}>
        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: 2 }}>
          {data.label || type}
        </div>
        {data.config && Object.keys(data.config).length > 0 && (
          <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
            {Object.entries(data.config)
              .filter(([, v]) => v)
              .slice(0, 2)
              .map(([k, v]) => (
                <div key={k} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                  <span style={{ color: '#64748b' }}>{k}: </span>
                  <span>{String(v)}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Handles */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#475569', width: 10, height: 10, border: '2px solid #94a3b8' }}
        />
      )}
      {hasTrueFalse ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ background: '#22c55e', width: 10, height: 10, border: '2px solid #fff', top: '35%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ background: '#ef4444', width: 10, height: 10, border: '2px solid #fff', top: '65%' }}
          />
        </>
      ) : hasOutput ? (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: '#475569', width: 10, height: 10, border: '2px solid #94a3b8' }}
        />
      ) : null}
    </div>
  );
}

export default memo(AgentNode);
