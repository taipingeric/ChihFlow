import { useState, useEffect } from 'react';

const TYPE_COLORS = {
  input: '#22c55e',
  llm: '#6366f1',
  tool: '#f59e0b',
  condition: '#ec4899',
  output: '#ef4444',
};

export default function ConfigPanel({ node, nodeTypes, onChange, onClose }) {
  const [label, setLabel] = useState('');
  const [config, setConfig] = useState({});

  const typeMeta = nodeTypes.find((nt) => nt.type === node?.type) || {};
  const color = TYPE_COLORS[node?.type] || '#64748b';

  useEffect(() => {
    if (node) {
      setLabel(node.data.label || '');
      setConfig(node.data.config || {});
    }
  }, [node?.id]);

  if (!node) return null;

  function handleApply() {
    onChange(node.id, { label, config });
  }

  function handleConfigChange(key, value) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div
      style={{
        width: 260,
        background: '#1e293b',
        borderLeft: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid #334155',
          background: color + '22',
        }}
      >
        <div>
          <div
            style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 1, textTransform: 'uppercase' }}
          >
            {node.type}
          </div>
          <div style={{ fontSize: 13, color: '#f1f5f9', marginTop: 2 }}>Configure Node</div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Fields */}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {/* Label */}
        <div>
          <label style={labelStyle}>Node Label</label>
          <input
            style={inputStyle}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Enter label…"
          />
        </div>

        {/* Config schema fields */}
        {(typeMeta.configSchema || []).map((field) => (
          <div key={field.key}>
            <label style={labelStyle}>{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea
                style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                value={config[field.key] ?? field.default ?? ''}
                onChange={(e) => handleConfigChange(field.key, e.target.value)}
                placeholder={field.default || ''}
              />
            ) : (
              <input
                style={inputStyle}
                value={config[field.key] ?? field.default ?? ''}
                onChange={(e) => handleConfigChange(field.key, e.target.value)}
                placeholder={field.default || ''}
              />
            )}
          </div>
        ))}
      </div>

      {/* Apply button */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid #334155' }}>
        <button
          onClick={handleApply}
          style={{
            width: '100%',
            padding: '9px 0',
            background: color,
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          Apply Changes
        </button>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#94a3b8',
  marginBottom: 5,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const inputStyle = {
  width: '100%',
  background: '#0f172a',
  border: '1.5px solid #334155',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  color: '#f1f5f9',
  outline: 'none',
  fontFamily: 'inherit',
};
