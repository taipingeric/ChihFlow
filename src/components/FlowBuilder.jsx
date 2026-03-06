import { useCallback, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import defaultSystemConfig from '../config/system.default.json';

const nodePalette = [
  {
    type: 'agent',
    label: 'Agent',
    description: '智慧代理節點',
    color: '#aef6d8',
  },
  {
    type: 'llm',
    label: 'LLM',
    description: '核心語言模型',
    color: '#fee2e2',
  },
  {
    type: 'system',
    label: 'System',
    description: '全域變數與設定',
    color: '#ddd6fe',
  },
  {
    type: 'tool',
    label: 'Tool',
    description: '工具類型',
    color: '#cce3f7',
  },
  {
    type: 'condition',
    label: 'Condition',
    description: '選擇條件分支類型',
    color: '#d7f7cc',
  },
  {
    type: 'prompt',
    label: 'Prompt',
    description: '指令模板',
    color: '#fde68a',
  },
  {
    type: 'output',
    label: 'Output',
    description: '最終輸出結果',
    color: '#f8d1e3',
  },
  {
    type: 'group',
    label: 'Group',
    description: '範圍群組與同步拖移',
    color: '#e5e7eb',
  },
];

const openAIModels = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'];
const conditionTemplates = [
  {
    id: 'bool_check',
    label: 'IF',
    description: 'True / False 分支',
    branches: 'true\nfalse',
  },
  {
    id: 'intent_router',
    label: 'Intent Router',
    description: '依使用者意圖分流',
    branches: 'sales\nsupport\ngeneral',
  },
  {
    id: 'confidence_gate',
    label: 'Confidence Gate',
    description: '高 / 低信心分流',
    branches: 'high\nlow',
  },
];
const toolTemplates = [
  {
    id: 'retriever',
    label: 'Retriever',
    description: '透過向量資料庫搜尋 PDF',
    toolKind: 'retriever',
  },
];

const defaultRetrieverConfig = {
  provider: 'openai',
  vectorStoreId: '',
  lastFileName: '',
  status: '',
  error: '',
};
const defaultSystemVars = Object.entries(defaultSystemConfig?.variables || {}).map(
  ([key, value]) => ({
    key,
    value: String(value ?? ''),
  })
);
const createDefaultSystemVars = () => defaultSystemVars.map((item) => ({ ...item }));
const defaultStartStateKeys = [
  { key: 'user_input', type: 'string' },
  { key: 'prompt', type: 'string' },
  { key: 'result', type: 'string' },
  { key: 'last_agent', type: 'string' },
  { key: 'last_llm', type: 'string' },
  { key: 'retriever_store_id', type: 'string' },
  { key: 'route', type: 'string' },
  { key: 'conversation_messages', type: 'array' },
];
const createDefaultStartStateKeys = () => defaultStartStateKeys.map((item) => ({ ...item }));
const stateDataTypeOptions = ['string', 'number', 'boolean', 'array', 'object'];

const initialNodes = [
  {
    id: '1',
    type: 'startNode',
    draggable: true,
    deletable: false,
    position: { x: 220, y: 100 },
    data: {
      label: 'START',
      nodeType: 'start',
      inputKey: 'user_input',
      startStateKeys: createDefaultStartStateKeys(),
    },
  },
  {
    id: '2',
    type: 'agentNode',
    position: { x: 460, y: 100 },
    data: {
      label: 'Agent',
      nodeType: 'agent',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: '',
      agentPrompt: 'You are a helpful assistant.',
      outputStateKey: 'result',
      outputWriteMode: 'append',
    },
  },
  {
    id: '3',
    type: 'outputNode',
    position: { x: 700, y: 100 },
    data: {
      label: 'Output',
      nodeType: 'output',
    },
  },
  {
    id: '4',
    type: 'systemNode',
    position: { x: 460, y: 250 },
    data: {
      label: 'System',
      nodeType: 'system',
      systemVars: createDefaultSystemVars(),
    },
  },
];

const initialEdges = [];

let nodeId = 5;
const getId = () => `${nodeId++}`;

const toIdentifier = (value, fallback) => {
  const base = (value || fallback || 'node').toLowerCase();
  const cleaned = base.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || fallback || 'node';
};

const normalizeStateDataType = (value) => {
  const type = String(value || '').trim().toLowerCase();
  return stateDataTypeOptions.includes(type) ? type : 'string';
};

const getJsDefaultLiteralByType = (type) => {
  switch (normalizeStateDataType(type)) {
    case 'number':
      return '0';
    case 'boolean':
      return 'false';
    case 'array':
      return '[]';
    case 'object':
      return '{}';
    default:
      return "''";
  }
};

const getPythonDefaultLiteralByType = (type) => {
  switch (normalizeStateDataType(type)) {
    case 'number':
      return '0';
    case 'boolean':
      return 'False';
    case 'array':
      return '[]';
    case 'object':
      return '{}';
    default:
      return "''";
  }
};

const getPythonAnnotationByType = (type) => {
  switch (normalizeStateDataType(type)) {
    case 'number':
      return 'float';
    case 'boolean':
      return 'bool';
    case 'array':
      return 'list';
    case 'object':
      return 'dict';
    default:
      return 'str';
  }
};

const getJsDocTypeByType = (type) => {
  switch (normalizeStateDataType(type)) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'Array<any>';
    case 'object':
      return 'Object';
    default:
      return 'string';
  }
};

const parseBranches = (value) =>
  (value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

const getSystemVarValue = (systemNode, key) => {
  const vars = systemNode?.data?.systemVars || [];
  const hit = vars.find((item) => item.key === key);
  return hit?.value || '';
};

const END = '__END__';
class BrowserStateGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.conditional = new Map();
    this.entry = null;
  }

  addNode(name, fn) {
    this.nodes.set(name, fn);
  }

  addEdge(source, target) {
    if (!this.edges.has(source)) {
      this.edges.set(source, []);
    }
    this.edges.get(source).push(target);
  }

  addConditionalEdges(source, router, routeMap) {
    this.conditional.set(source, { router, routeMap });
  }

  setEntryPoint(name) {
    this.entry = name;
  }

  compile() {
    const self = this;
    return {
      invoke: async (initialState) => {
        let current = self.entry;
        let state = { ...(initialState || {}) };
        let steps = 0;
        while (current && current !== END) {
          if (steps > 200) {
            throw new Error('Graph exceeded max steps (possible loop).');
          }
          const nodeFn = self.nodes.get(current);
          if (!nodeFn) {
            throw new Error(`Missing node handler: ${current}`);
          }
          state = (await nodeFn(state)) || state;
          const conditional = self.conditional.get(current);
          if (conditional) {
            const route = await conditional.router(state);
            current = conditional.routeMap?.[route] || Object.values(conditional.routeMap || {})[0] || END;
          } else {
            const nextList = self.edges.get(current) || [];
            current = nextList[0] || END;
          }
          steps += 1;
        }
        return state;
      },
    };
  }
}

const executeGeneratedGraph = async (code, runModel, createAgent, initialState) => {
  const appFactory = new Function(
    'StateGraph',
    'END',
    'runModel',
    'createAgent',
    `${code}\nreturn app;`
  );
  const app = appFactory(BrowserStateGraph, END, runModel, createAgent);
  if (!app || typeof app.invoke !== 'function') {
    throw new Error('Generated graph did not compile to an invokable app.');
  }
  return app.invoke(initialState);
};

function AgentCanvasNode({ data }) {
  return (
    <div
      style={{
        border: '1px solid #b08968',
        background: '#f6d8ae',
        borderRadius: 12,
        minWidth: 190,
        padding: '10px 10px 26px',
        position: 'relative',
      }}
    >
      <Handle id="flow-in" type="target" position={Position.Left} className="flow-handle" />
      <Handle
        id="llm-in"
        type="target"
        position={Position.Bottom}
        style={{ left: '25%' }}
        className="flow-handle"
      />
      <Handle
        id="prompt-in"
        type="target"
        position={Position.Bottom}
        style={{ left: '50%' }}
        className="flow-handle"
      />
      <Handle
        id="tool-in"
        type="target"
        position={Position.Bottom}
        style={{ left: '75%' }}
        className="flow-handle"
      />
      <strong>{data?.label || 'Agent'}</strong>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 12,
          fontSize: 11,
          color: '#3f3f46',
          pointerEvents: 'none',
          height: 12,
        }}
      >
        <span style={{ position: 'absolute', left: '25%', transform: 'translateX(-50%)' }}>
          LLM
        </span>
        <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          Prompt
        </span>
        <span style={{ position: 'absolute', left: '75%', transform: 'translateX(-50%)' }}>
          Tool
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}

function SystemCanvasNode({ data }) {
  return (
    <div
      style={{
        border: '1px solid #7c3aed',
        background: '#ede9fe',
        borderRadius: 12,
        minWidth: 170,
        padding: 10,
      }}
    >
      <strong>{data?.label || 'System'}</strong>
      <div style={{ marginTop: 6, fontSize: 12, color: '#4c1d95' }}>Global variables</div>
    </div>
  );
}

function StartCanvasNode({ data }) {
  return (
    <div
      style={{
        border: '1px solid #1d4ed8',
        background: '#dbeafe',
        borderRadius: 12,
        minWidth: 150,
        padding: 10,
        fontWeight: 700,
      }}
    >
      <strong>{data?.label || 'START'}</strong>
      <Handle id="start-out" type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}

function LlmCanvasNode({ data }) {
  return (
    <div
      style={{
        border: '1px solid #ef4444',
        background: '#fee2e2',
        borderRadius: 12,
        minWidth: 150,
        padding: 10,
      }}
    >
      <strong>{data?.label || 'LLM'}</strong>
      <Handle id="llm-top" type="source" position={Position.Top} className="flow-handle" />
    </div>
  );
}

function ToolCanvasNode({ data }) {
  return (
    <div
      style={{
        border: '1px solid #0284c7',
        background: '#e0f2fe',
        borderRadius: 12,
        minWidth: 150,
        padding: 10,
      }}
    >
      <strong>{data?.label || 'Tool'}</strong>
      <Handle id="tool-top" type="source" position={Position.Top} className="flow-handle" />
    </div>
  );
}

function PromptCanvasNode({ data }) {
  return (
    <div
      style={{
        border: '1px solid #d97706',
        background: '#fef3c7',
        borderRadius: 12,
        minWidth: 160,
        padding: 10,
      }}
    >
      <Handle id="prompt-in" type="target" position={Position.Left} className="flow-handle" />
      <strong>{data?.label || 'Prompt'}</strong>
      <Handle id="prompt-out" type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}

function OutputCanvasNode({ data }) {
  return (
    <div
      style={{
        border: '1px solid #db2777',
        background: '#fce7f3',
        borderRadius: 12,
        minWidth: 150,
        padding: 10,
      }}
    >
      <Handle id="output-in" type="target" position={Position.Left} className="flow-handle" />
      <strong>{data?.label || 'Output'}</strong>
    </div>
  );
}

function GroupCanvasNode({ data }) {
  const width = Number(data?.rangeWidth) > 0 ? Number(data.rangeWidth) : 420;
  const height = Number(data?.rangeHeight) > 0 ? Number(data.rangeHeight) : 240;
  const onResizeHandleMouseDown = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = width;
    const startHeight = height;

    const onMouseMove = (moveEvent) => {
      const nextWidth = Math.max(180, startWidth + (moveEvent.clientX - startX));
      const nextHeight = Math.max(120, startHeight + (moveEvent.clientY - startY));
      data?.onResize?.(nextWidth, nextHeight);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      style={{
        width,
        height,
        border: '2px dashed #9ca3af',
        background: 'rgba(161, 161, 170, 0.06)',
        borderRadius: 12,
        padding: 10,
        color: '#3f3f46',
        fontWeight: 600,
        position: 'relative',
      }}
    >
      {data?.label || 'Group'}
      <div
        role="button"
        aria-label="調整群組範圍大小"
        onMouseDown={onResizeHandleMouseDown}
        style={{
          position: 'absolute',
          width: 14,
          height: 14,
          right: 6,
          bottom: 6,
          borderRadius: 4,
          border: '1px solid #6b7280',
          background: '#e5e7eb',
          cursor: 'nwse-resize',
        }}
      />
    </div>
  );
}

const getMiniMapNodeColor = (node) => {
  switch (node?.data?.nodeType) {
    case 'agent':
      return '#f6d8ae';
    case 'system':
      return '#ede9fe';
    case 'start':
      return '#dbeafe';
    case 'llm':
      return '#fee2e2';
    case 'tool':
      return '#e0f2fe';
    case 'prompt':
      return '#fef3c7';
    case 'output':
      return '#fce7f3';
    case 'group':
      return '#e5e7eb';
    case 'condition':
      return '#dcfce7';
    default:
      return '#d4d4d8';
  }
};

function FlowBuilder() {
  const wrapperRef = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState('1');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const [showConditionOptions, setShowConditionOptions] = useState(false);
  const [showToolOptions, setShowToolOptions] = useState(false);
  const [codeTab, setCodeTab] = useState('js');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runnerError, setRunnerError] = useState('');
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const nodeTypes = useMemo(
    () => ({
      agentNode: AgentCanvasNode,
      systemNode: SystemCanvasNode,
      startNode: StartCanvasNode,
      llmNode: LlmCanvasNode,
      toolNode: ToolCanvasNode,
      promptNode: PromptCanvasNode,
      outputNode: OutputCanvasNode,
      groupNode: GroupCanvasNode,
    }),
    []
  );

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#52525b', strokeWidth: 1.8 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#52525b',
              width: 20,
              height: 20,
            },
          },
          eds
        )
      ),
    [setEdges]
  );

  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const onDragStart = (event, node) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(node));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      if (!reactFlowInstance || !wrapperRef.current) {
        return;
      }

      const raw = event.dataTransfer.getData('application/reactflow');
      if (!raw) {
        return;
      }

      const paletteNode = JSON.parse(raw);
      const bounds = wrapperRef.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const id = getId();
      const wrapperStyle =
        paletteNode.type === 'agent' ||
        paletteNode.type === 'system' ||
        paletteNode.type === 'start' ||
        paletteNode.type === 'llm' ||
        paletteNode.type === 'tool' ||
        paletteNode.type === 'prompt' ||
        paletteNode.type === 'output' ||
        paletteNode.type === 'group'
          ? undefined
          : {
              borderRadius: 12,
              border: '1px solid #3f3f46',
              background: paletteNode.color,
              padding: 8,
              minWidth: 150,
            };
      const newNode = {
        id,
        type:
          paletteNode.type === 'agent'
            ? 'agentNode'
            : paletteNode.type === 'system'
              ? 'systemNode'
              : paletteNode.type === 'start'
                ? 'startNode'
                : paletteNode.type === 'llm'
                  ? 'llmNode'
                  : paletteNode.type === 'tool'
                    ? 'toolNode'
                    : paletteNode.type === 'prompt'
                      ? 'promptNode'
                    : paletteNode.type === 'output'
                      ? 'outputNode'
                      : paletteNode.type === 'group'
                        ? 'groupNode'
              : 'default',
        position,
        data: {
          label: `${paletteNode.label}`,
          nodeType: paletteNode.type,
          provider: paletteNode.type === 'agent' || paletteNode.type === 'llm' ? 'openai' : '',
          model:
            paletteNode.type === 'agent' || paletteNode.type === 'llm' ? 'gpt-4.1-mini' : '',
          apiKey: '',
          prompt: '',
          agentPrompt: paletteNode.type === 'agent' ? 'You are a helpful assistant.' : '',
          outputStateKey: paletteNode.type === 'agent' ? 'result' : '',
          outputWriteMode: paletteNode.type === 'agent' ? 'append' : '',
          globalApiKey: paletteNode.type === 'system' ? '' : '',
          systemVars:
            paletteNode.type === 'system' ? createDefaultSystemVars() : [],
          toolKind: paletteNode.type === 'tool' ? paletteNode.toolKind || 'retriever' : '',
          retriever:
            paletteNode.type === 'tool' && (paletteNode.toolKind || 'retriever') === 'retriever'
              ? defaultRetrieverConfig
              : undefined,
          branches: paletteNode.type === 'condition' ? paletteNode.branches || 'true\nfalse' : '',
          conditionKind: paletteNode.conditionKind || '',
          startStateKeys: paletteNode.type === 'start' ? createDefaultStartStateKeys() : [],
          rangeWidth: paletteNode.type === 'group' ? 420 : undefined,
          rangeHeight: paletteNode.type === 'group' ? 240 : undefined,
          onResize:
            paletteNode.type === 'group'
              ? (nextWidth, nextHeight) => {
                  setNodes((nds) =>
                    nds.map((node) => {
                      if (node.id !== id) {
                        return node;
                      }
                      return {
                        ...node,
                        data: {
                          ...node.data,
                          rangeWidth: nextWidth,
                          rangeHeight: nextHeight,
                        },
                        style: {
                          ...(node.style || {}),
                          width: nextWidth,
                          height: nextHeight,
                        },
                      };
                    })
                  );
                }
              : undefined,
        },
        style: wrapperStyle,
      };

      setNodes((nds) => nds.concat(newNode));
      setSelectedNodeId(id);
    },
    [reactFlowInstance, setNodes]
  );

  const updateNodeData = useCallback(
    (nodeId, patch) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              ...patch,
            },
          };
        })
      );
    },
    [setNodes]
  );

  const updateSystemVar = useCallback(
    (nodeId, index, patch) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          const vars = node.data?.systemVars || [];
          return {
            ...node,
            data: {
              ...node.data,
              systemVars: vars.map((item, i) => (i === index ? { ...item, ...patch } : item)),
            },
          };
        })
      );
    },
    [setNodes]
  );

  const addSystemVar = useCallback(
    (nodeId) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              systemVars: [...(node.data?.systemVars || []), { key: '', value: '' }],
            },
          };
        })
      );
    },
    [setNodes]
  );

  const removeSystemVar = useCallback(
    (nodeId, index) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              systemVars: (node.data?.systemVars || []).filter((_, i) => i !== index),
            },
          };
        })
      );
    },
    [setNodes]
  );
  const updateStartStateKey = useCallback(
    (nodeId, index, patch) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          const keys = node.data?.startStateKeys || [];
          return {
            ...node,
            data: {
              ...node.data,
              startStateKeys: keys.map((item, i) => (i === index ? { ...item, ...patch } : item)),
            },
          };
        })
      );
    },
    [setNodes]
  );
  const addStartStateKey = useCallback(
    (nodeId) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              startStateKeys: [...(node.data?.startStateKeys || []), { key: '', type: 'string' }],
            },
          };
        })
      );
    },
    [setNodes]
  );
  const removeStartStateKey = useCallback(
    (nodeId, index) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              startStateKeys: (node.data?.startStateKeys || []).filter((_, i) => i !== index),
            },
          };
        })
      );
    },
    [setNodes]
  );

  const isAgentNode = selectedNode?.data?.nodeType === 'agent';
  const isLlmNode = selectedNode?.data?.nodeType === 'llm';
  const isToolNode = selectedNode?.data?.nodeType === 'tool';
  const isPromptNode = selectedNode?.data?.nodeType === 'prompt';
  const isStartNode = selectedNode?.data?.nodeType === 'start';
  const isConditionNode = selectedNode?.data?.nodeType === 'condition';
  const isSystemNode = selectedNode?.data?.nodeType === 'system';
  const isGroupNode = selectedNode?.data?.nodeType === 'group';

  const findStartAgent = useCallback(() => {
    const selectedNode = nodes.find((node) => node.id === selectedNodeId);
    if (selectedNode?.data?.nodeType === 'agent') {
      return selectedNode;
    }
    return nodes.find((node) => node.data?.nodeType === 'agent') || null;
  }, [nodes, selectedNodeId]);

  const findStartInputNode = useCallback(
    () => nodes.find((node) => node.data?.nodeType === 'start') || null,
    [nodes]
  );
  const findSystemNode = useCallback(
    () => nodes.find((node) => node.data?.nodeType === 'system') || null,
    [nodes]
  );
  const getStartStateKeysForCode = useCallback(() => {
    const startNode = nodes.find((node) => node.data?.nodeType === 'start') || null;
    const configuredKeys = (startNode?.data?.startStateKeys || [])
      .map((item) => String(item?.key || '').trim())
      .filter(Boolean);
    const agentOutputKeys = nodes
      .filter((node) => node.data?.nodeType === 'agent')
      .map((node) => String(node.data?.outputStateKey || '').trim())
      .filter(Boolean);
    const requiredKeys = [
      'user_input',
      'prompt',
      'result',
      'last_agent',
      'last_llm',
      'retriever_store_id',
      'route',
      'conversation_messages',
      'apiKey',
      'defaultModel',
      'systemPrompt',
    ];
    return Array.from(new Set(requiredKeys.concat(configuredKeys, agentOutputKeys)));
  }, [nodes]);
  const getStartStateDefinitions = useCallback(() => {
    const startNode = nodes.find((node) => node.data?.nodeType === 'start') || null;
    const configuredEntries = (startNode?.data?.startStateKeys || [])
      .map((item) => ({
        key: String(item?.key || '').trim(),
        type: normalizeStateDataType(item?.type),
      }))
      .filter((item) => item.key);
    const builtInEntries = [
      { key: 'user_input', type: 'string' },
      { key: 'prompt', type: 'string' },
      { key: 'result', type: 'string' },
      { key: 'last_agent', type: 'string' },
      { key: 'last_llm', type: 'string' },
      { key: 'retriever_store_id', type: 'string' },
      { key: 'route', type: 'string' },
      { key: 'conversation_messages', type: 'array' },
      { key: 'apiKey', type: 'string' },
      { key: 'defaultModel', type: 'string' },
      { key: 'systemPrompt', type: 'string' },
      { key: 'has_system_api_key', type: 'boolean' },
    ];
    const map = new Map();
    builtInEntries.concat(configuredEntries).forEach((item) => {
      if (!item.key) {
        return;
      }
      map.set(item.key, item.type);
    });
    nodes
      .filter((node) => node.data?.nodeType === 'agent')
      .forEach((node) => {
        const key = String(node.data?.outputStateKey || '').trim();
        if (key) {
          map.set(key, key === 'conversation_messages' ? 'array' : 'string');
        }
      });
    return map;
  }, [nodes]);
  const getConfiguredStartStateKeys = useCallback(() => {
    const startNode = nodes.find((node) => node.data?.nodeType === 'start') || null;
    return (startNode?.data?.startStateKeys || [])
      .map((item) => ({
        key: String(item?.key || '').trim(),
        type: normalizeStateDataType(item?.type),
      }))
      .filter((item) => item.key);
  }, [nodes]);
  const getStateDatatype = useCallback(
    (key) => {
      const typeMap = getStartStateDefinitions();
      return typeMap.get(String(key || '').trim()) || 'string';
    },
    [getStartStateDefinitions]
  );
  const getStartStateDefaultLiteral = useCallback(
    (key, language) => {
      const dataType = getStateDatatype(key);
      if (language === 'python') {
        return getPythonDefaultLiteralByType(dataType);
      }
      return getJsDefaultLiteralByType(dataType);
    },
    [getStateDatatype]
  );
  const updateGroupRangeSize = useCallback(
    (nodeId, patch) => {
      const nextWidth = Math.max(180, Number(patch?.rangeWidth) || 420);
      const nextHeight = Math.max(120, Number(patch?.rangeHeight) || 240);
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              rangeWidth: nextWidth,
              rangeHeight: nextHeight,
            },
            style: {
              ...(node.style || {}),
              width: nextWidth,
              height: nextHeight,
            },
          };
        })
      );
    },
    [setNodes]
  );
  const attachNodesIntoGroupRange = useCallback(
    (groupNodeId) => {
      setNodes((nds) => {
        const nodeMap = new Map(nds.map((node) => [node.id, node]));
        const groupNode = nodeMap.get(groupNodeId);
        if (!groupNode) {
          return nds;
        }

        const width = Number(groupNode.data?.rangeWidth) > 0 ? Number(groupNode.data.rangeWidth) : 420;
        const height = Number(groupNode.data?.rangeHeight) > 0 ? Number(groupNode.data.rangeHeight) : 240;
        const getAbsolutePosition = (node) => {
          let x = Number(node?.position?.x || 0);
          let y = Number(node?.position?.y || 0);
          let parentId = node?.parentNode;

          while (parentId) {
            const parentNode = nodeMap.get(parentId);
            if (!parentNode) {
              break;
            }
            x += Number(parentNode.position?.x || 0);
            y += Number(parentNode.position?.y || 0);
            parentId = parentNode.parentNode;
          }

          return { x, y };
        };
        const getNodeSize = (node) => {
          const defaultSizeByType = {
            start: { width: 150, height: 48 },
            agent: { width: 190, height: 72 },
            llm: { width: 150, height: 48 },
            tool: { width: 150, height: 48 },
            output: { width: 150, height: 48 },
            system: { width: 170, height: 66 },
            condition: { width: 150, height: 60 },
            prompt: { width: 150, height: 60 },
          };
          const fallback = defaultSizeByType[node?.data?.nodeType] || { width: 150, height: 60 };
          const rawWidth =
            Number(node?.width) || Number(node?.style?.width) || Number(node?.data?.rangeWidth) || fallback.width;
          const rawHeight =
            Number(node?.height) || Number(node?.style?.height) || Number(node?.data?.rangeHeight) || fallback.height;
          return { width: rawWidth, height: rawHeight };
        };

        const rangeTopLeft = getAbsolutePosition(groupNode);
        const rangeRight = rangeTopLeft.x + width;
        const rangeBottom = rangeTopLeft.y + height;

        return nds.map((node) => {
          if (node.id === groupNodeId || node.data?.nodeType === 'group') {
            return node;
          }

          const abs = getAbsolutePosition(node);
          const size = getNodeSize(node);
          const inRange =
            abs.x >= rangeTopLeft.x &&
            abs.y >= rangeTopLeft.y &&
            abs.x + size.width <= rangeRight &&
            abs.y + size.height <= rangeBottom;

          if (!inRange) {
            return node;
          }

          return {
            ...node,
            parentNode: groupNodeId,
            extent: 'parent',
            position: {
              x: abs.x - rangeTopLeft.x,
              y: abs.y - rangeTopLeft.y,
            },
          };
        });
      });
    },
    [setNodes]
  );
  const detachNodesFromGroupRange = useCallback(
    (groupNodeId) => {
      setNodes((nds) => {
        const nodeMap = new Map(nds.map((node) => [node.id, node]));
        const groupNode = nodeMap.get(groupNodeId);
        if (!groupNode) {
          return nds;
        }

        const groupAbsX = Number(groupNode.position?.x || 0);
        const groupAbsY = Number(groupNode.position?.y || 0);

        return nds.map((node) => {
          if (node.parentNode !== groupNodeId) {
            return node;
          }
          return {
            ...node,
            parentNode: undefined,
            extent: undefined,
            position: {
              x: groupAbsX + Number(node.position?.x || 0),
              y: groupAbsY + Number(node.position?.y || 0),
            },
          };
        });
      });
    },
    [setNodes]
  );
  const validateRunnableFlow = useCallback(() => {
    const startNode = nodes.find((node) => node.data?.nodeType === 'start');
    if (!startNode) {
      return '缺少 START 節點。';
    }

    const outputNode = nodes.find((node) => node.data?.nodeType === 'output');
    if (!outputNode) {
      return '缺少 Output 節點。';
    }

    const adjacency = new Map();
    edges.forEach((edge) => {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      adjacency.get(edge.source).push(edge.target);
    });

    const stack = [startNode.id];
    const visited = new Set();

    while (stack.length > 0) {
      const nodeId = stack.pop();
      if (visited.has(nodeId)) {
        continue;
      }
      visited.add(nodeId);

      if (nodeId === outputNode.id) {
        return '';
      }

      const nextIds = adjacency.get(nodeId) || [];
      for (let i = nextIds.length - 1; i >= 0; i -= 1) {
        stack.push(nextIds[i]);
      }
    }

    return '執行前需有完整路徑：START -> ... -> Output。';
  }, [nodes, edges]);
  const normalizeErrorMessage = useCallback((errorLike, fallbackMessage) => {
    const fallback = fallbackMessage || '流程執行失敗。';
    const raw = String(errorLike?.message || errorLike || '').trim();
    if (!raw) {
      return fallback;
    }

    const lowered = raw.toLowerCase();
    if (lowered.includes('failed to fetch') || lowered.includes('networkerror')) {
      return '網路連線失敗，無法連線到服務。請檢查網路、API 位址與瀏覽器設定後再試一次。';
    }

    return raw;
  }, []);
  const showRunnerError = useCallback((message) => {
    const text = normalizeErrorMessage(message, '流程執行失敗。');
    setRunnerError(text);
    setErrorDialogMessage(text);
  }, [normalizeErrorMessage]);
  const getIncomingNodes = useCallback(
    (targetNodeId) => {
      const nodeMap = new Map(nodes.map((node) => [node.id, node]));
      return edges
        .filter((edge) => edge.target === targetNodeId)
        .map((edge) => nodeMap.get(edge.source))
        .filter(Boolean);
    },
    [nodes, edges]
  );
  const getLinkedRetrieverStoreIds = useCallback(
    (targetNodeId) => {
      return getIncomingNodes(targetNodeId)
        .filter(
          (sourceNode) =>
            sourceNode?.data?.nodeType === 'tool' &&
            sourceNode?.data?.toolKind === 'retriever' &&
            sourceNode?.data?.retriever?.vectorStoreId
        )
        .map((sourceNode) => sourceNode.data.retriever.vectorStoreId);
    },
    [getIncomingNodes]
  );
  const getLinkedLlmNodes = useCallback(
    (targetNodeId) =>
      getIncomingNodes(targetNodeId).filter((sourceNode) => sourceNode?.data?.nodeType === 'llm'),
    [getIncomingNodes]
  );
  const getLinkedToolNodes = useCallback(
    (targetNodeId) =>
      getIncomingNodes(targetNodeId).filter((sourceNode) => sourceNode?.data?.nodeType === 'tool'),
    [getIncomingNodes]
  );
  const getLinkedPromptNodes = useCallback(
    (targetNodeId) =>
      getIncomingNodes(targetNodeId).filter((sourceNode) => sourceNode?.data?.nodeType === 'prompt'),
    [getIncomingNodes]
  );
  const getNodeOutputStateKeys = useCallback((node) => {
    if (!node?.data?.nodeType) {
      return [];
    }
    switch (node.data.nodeType) {
      case 'start':
        return (node.data?.startStateKeys || [])
          .map((item) => ({
            key: String(item?.key || '').trim(),
            type: normalizeStateDataType(item?.type),
          }))
          .filter((item) => item.key);
      case 'prompt':
        return [{ key: 'prompt', type: 'string' }];
      case 'tool':
        return node.data?.toolKind === 'retriever'
          ? [{ key: 'retriever_store_id', type: 'string' }]
          : [];
      case 'llm':
        return [
          { key: 'last_llm', type: 'string' },
          { key: 'result', type: 'string' },
        ];
      case 'condition':
        return [{ key: 'route', type: 'string' }];
      case 'system':
        return [{ key: 'has_system_api_key', type: 'boolean' }];
      case 'agent': {
        const outputKey = String(node.data?.outputStateKey || 'result').trim() || 'result';
        const outputType = outputKey === 'conversation_messages' ? 'array' : 'string';
        return [
          { key: 'last_agent', type: 'string' },
          { key: 'result', type: 'string' },
          { key: 'systemPrompt', type: 'string' },
          { key: 'conversation_messages', type: 'array' },
          { key: outputKey, type: outputType },
        ];
      }
      default:
        return [];
    }
  }, []);
  const getIncomingStateKeys = useCallback(
    (targetNodeId) => {
      const incomingNodes = getIncomingNodes(targetNodeId);
      const keyMap = new Map();
      incomingNodes.flatMap((sourceNode) => getNodeOutputStateKeys(sourceNode)).forEach((item) => {
        if (!item?.key) {
          return;
        }
        keyMap.set(item.key, item.type || 'string');
      });
      return Array.from(keyMap.entries()).map(([key, type]) => ({ key, type }));
    },
    [getIncomingNodes, getNodeOutputStateKeys]
  );
  const selectedIncomingStateKeys = selectedNode ? getIncomingStateKeys(selectedNode.id) : [];
  const buildAgentSystemPrompt = useCallback(
    (agentNodeId, basePrompt = '') => {
      const linkedPromptTexts = getLinkedPromptNodes(agentNodeId)
        .map((promptNode) => promptNode?.data?.prompt?.trim() || promptNode?.data?.label || '')
        .filter(Boolean);
      return [String(basePrompt || '').trim(), ...linkedPromptTexts].filter(Boolean).join('\n\n');
    },
    [getLinkedPromptNodes]
  );
  const resolveApiKey = useCallback(() => {
    const systemNode = findSystemNode();
    const globalApiKeyFromVars = getSystemVarValue(systemNode, 'OPENAI_API_KEY').trim();
    const llmWithKey = nodes.find((node) => node.data?.nodeType === 'llm' && node.data?.apiKey?.trim());
    return (
      llmWithKey?.data?.apiKey?.trim() ||
      globalApiKeyFromVars ||
      systemNode?.data?.globalApiKey?.trim() ||
      ''
    );
  }, [nodes, findSystemNode]);

  const onUploadRetrieverPdf = useCallback(
    async (nodeId, file) => {
      if (!file) {
        return;
      }

      const apiKey = resolveApiKey();
      if (!apiKey) {
        updateNodeData(nodeId, {
          retriever: {
            ...(nodes.find((node) => node.id === nodeId)?.data?.retriever || defaultRetrieverConfig),
            error: '缺少 API Key。請在 System 的 OPENAI_API_KEY 或 Agent 節點中設定。',
          },
        });
        return;
      }

      const baseRetriever = nodes.find((node) => node.id === nodeId)?.data?.retriever || defaultRetrieverConfig;
      updateNodeData(nodeId, {
        retriever: {
          ...baseRetriever,
          status: 'PDF 上傳中...',
          error: '',
        },
      });

      try {
        const fileData = new FormData();
        fileData.append('file', file);
        fileData.append('purpose', 'assistants');

        const fileRes = await fetch('https://api.openai.com/v1/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: fileData,
        });
        if (!fileRes.ok) {
          throw new Error(`檔案上傳失敗（${fileRes.status}）`);
        }
        const filePayload = await fileRes.json();

        const storeRes = await fetch('https://api.openai.com/v1/vector_stores', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            name: `retriever-${file.name}-${Date.now()}`,
          }),
        });
        if (!storeRes.ok) {
          throw new Error(`建立向量資料庫失敗（${storeRes.status}）`);
        }
        const storePayload = await storeRes.json();

        const attachRes = await fetch(
          `https://api.openai.com/v1/vector_stores/${storePayload.id}/files`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ file_id: filePayload.id }),
          }
        );
        if (!attachRes.ok) {
          throw new Error(`向量資料庫附加檔案失敗（${attachRes.status}）`);
        }

        updateNodeData(nodeId, {
          retriever: {
            ...baseRetriever,
            vectorStoreId: storePayload.id,
            lastFileName: file.name,
            status: '向量資料庫已就緒。',
            error: '',
          },
        });
      } catch (error) {
        updateNodeData(nodeId, {
          retriever: {
            ...baseRetriever,
            status: '',
            error: normalizeErrorMessage(error, 'PDF 上傳到向量資料庫失敗。'),
          },
        });
      }
    },
    [nodes, normalizeErrorMessage, resolveApiKey, updateNodeData]
  );

  const generateLangGraphCode = useCallback(
    (startAgentId) => {
      const nodeMap = new Map(nodes.map((node) => [node.id, node]));
      const edgePairs = edges.map((edge) => [edge.source, edge.target]);
      const connectedTargets = new Set(edges.map((edge) => edge.target));
      const outgoingBySource = new Map();
      edges.forEach((edge) => {
        if (!outgoingBySource.has(edge.source)) {
          outgoingBySource.set(edge.source, []);
        }
        outgoingBySource.get(edge.source).push(edge.target);
      });

      const startInputNode = nodes.find((node) => node.data?.nodeType === 'start') || null;
      const startNode =
        startInputNode ||
        nodeMap.get(startAgentId) ||
        nodes.find((node) => node.data?.nodeType === 'agent') ||
        nodes[0];
      const entryNode = startNode || nodes.find((node) => !connectedTargets.has(node.id)) || null;
      const entryId = entryNode?.id || '';
      const stateKeys = getStartStateKeysForCode();
      const configuredStartKeys = getConfiguredStartStateKeys();

      const idToFn = {};
      const functionBlocks = nodes.map((node, index) => {
        const safeName = toIdentifier(node.data?.label, `node_${index + 1}`);
        const functionName = `${safeName}_${node.id}`;
        idToFn[node.id] = functionName;

        if (node.data?.nodeType === 'prompt') {
          const promptText = node.data?.prompt?.trim() || node.data?.label || 'Prompt';
          return [
            `def ${functionName}(state: State):`,
            `    prompt = ${JSON.stringify(promptText)}`,
            "    return {**state, 'prompt': prompt}",
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'agent') {
          const linkedRetrieverStores = getLinkedRetrieverStoreIds(node.id);
          const linkedLlmModels = getLinkedLlmNodes(node.id).map(
            (llmNode) => llmNode.data?.model || 'gpt-4.1-mini'
          );
          const linkedPromptTexts = getLinkedPromptNodes(node.id).map(
            (promptNode) => promptNode.data?.prompt?.trim() || promptNode.data?.label || 'Prompt'
          );
          const linkedTools = getLinkedToolNodes(node.id).map((toolNode) => toolNode.data?.label || 'Tool');
          const outputStateKey = String(node.data?.outputStateKey || 'result').trim() || 'result';
          const outputWriteMode = String(node.data?.outputWriteMode || 'append').trim() || 'append';
          return [
            `def ${functionName}(state: State):`,
            `    base_system_prompt = ${JSON.stringify(node.data?.agentPrompt || '')}`,
            `    linked_prompts = ${JSON.stringify(linkedPromptTexts)}`,
            "    system_prompt = '\\n\\n'.join([item for item in [base_system_prompt, *linked_prompts] if item])",
            `    llm_models = ${JSON.stringify(linkedLlmModels)}`,
            `    linked_tools = ${JSON.stringify(linkedTools)}`,
            `    retriever_store_ids = ${JSON.stringify(linkedRetrieverStores)}`,
            `    output_state_key = ${JSON.stringify(outputStateKey)}`,
            `    output_write_mode = ${JSON.stringify(outputWriteMode)}`,
            "    model = llm_models[0] if llm_models else state.get('default_model', 'gpt-4.1-mini')",
            "    tools = []  # TODO: map linked tools/retrievers to real LangChain tools",
            '    agent = create_agent(',
            '        model=f"openai:{model}",',
            '        tools=tools,',
            '        system_prompt=system_prompt,',
            '    )',
            "    result = agent.invoke({'messages': [{'role': 'user', 'content': state.get('user_input', '')}]})",
            "    text = result.get('output_text', '') if isinstance(result, dict) else ''",
            "    previous_value = state.get(output_state_key)",
            "    if output_state_key == 'conversation_messages':",
            "        assistant_message = {'role': 'assistant', 'content': text}",
            "        previous_messages = state.get('conversation_messages') if isinstance(state.get('conversation_messages'), list) else []",
            "        if output_write_mode == 'replace':",
            '            next_value = [assistant_message]',
            '        else:',
            '            next_value = [*previous_messages, assistant_message]',
            "    elif output_write_mode == 'replace':",
            '        next_value = text',
            "    elif isinstance(previous_value, list):",
            '        next_value = [*previous_value, text]',
            "    elif isinstance(previous_value, str) and previous_value:",
            "        next_value = f'{previous_value}\\n{text}'",
            "    elif previous_value in (None, ''):",
            '        next_value = text',
            '    else:',
            '        next_value = [previous_value, text]',
            "    return {**state, 'last_agent': " +
              JSON.stringify(node.data?.label || 'Agent') +
              ", output_state_key: next_value, 'result': text}",
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'llm') {
          const linkedRetrieverStores = getLinkedRetrieverStoreIds(node.id);
          return [
            `def ${functionName}(state: State):`,
            `    retriever_store_ids = ${JSON.stringify(linkedRetrieverStores)}`,
            "    # Standalone LLM node.",
            "    return {**state, 'last_llm': " + JSON.stringify(node.data?.model || 'gpt-4.1-mini') + '}',
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'tool') {
          if (node.data?.toolKind === 'retriever') {
            return [
              `def ${functionName}(state: State):`,
              `    vector_store_id = ${JSON.stringify(node.data?.retriever?.vectorStoreId || '')}`,
              "    return {**state, 'retriever_store_id': vector_store_id}",
              '',
            ].join('\n');
          }
          return [
            `def ${functionName}(state: State):`,
            '    return state',
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'system') {
          return [
            `def ${functionName}(state: State):`,
            "    # Global runtime variables (do not hardcode secrets in generated code).",
            "    return {**state, 'has_system_api_key': bool(state.get('system_api_key'))}",
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'start') {
          const startInitPairs = configuredStartKeys.map(
            (item) =>
              `'${item.key}': state.get('${item.key}', ${getStartStateDefaultLiteral(item.key, 'python')})`
          );
          const startReturnExpr = startInitPairs.length
            ? `{**state, ${startInitPairs.join(', ')}}`
            : '{**state}';
          return [
            `def ${functionName}(state: State):`,
            "    # Input node: receives message from chat UI",
            `    return ${startReturnExpr}`,
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'condition') {
          const branchLabels = parseBranches(node.data?.branches);
          const fallbackRoute = branchLabels[0] || 'default';
          const conditionKind = node.data?.conditionKind || 'custom';
          return [
            `def ${functionName}(state: State):`,
            `    # Condition type: ${conditionKind}`,
            "    # Route should be set by your condition logic.",
            `    return {**state, 'route': state.get('route', ${JSON.stringify(fallbackRoute)})}`,
            '',
          ].join('\n');
        }

        return [
          `def ${functionName}(state: State):`,
          `    # ${node.data?.nodeType || 'node'}: ${node.data?.label || 'Unnamed node'}`,
          '    return state',
          '',
        ].join('\n');
      });

      const conditionNodeIds = new Set(
        nodes.filter((node) => node.data?.nodeType === 'condition').map((node) => node.id)
      );

      const edgeLines = edgePairs
        .filter(([source]) => !conditionNodeIds.has(source))
        .map(([source, target]) => {
          const sourceFn = idToFn[source];
          const targetFn = idToFn[target];
          if (!sourceFn || !targetFn) {
            return '';
          }
          return `graph.add_edge('${sourceFn}', '${targetFn}')`;
        })
        .filter(Boolean)
        .join('\n');

      const conditionalEdgeLines = nodes
        .filter((node) => node.data?.nodeType === 'condition')
        .map((conditionNode) => {
          const sourceFn = idToFn[conditionNode.id];
          const targetIds = outgoingBySource.get(conditionNode.id) || [];
          if (!sourceFn || targetIds.length === 0) {
            return '';
          }

          const labels = parseBranches(conditionNode.data?.branches);
          const routeMap = targetIds
            .map((targetId, index) => {
              const targetFn = idToFn[targetId];
              if (!targetFn) {
                return null;
              }
              const label = labels[index] || `branch_${index + 1}`;
              return `        ${JSON.stringify(label)}: ${JSON.stringify(targetFn)}`;
            })
            .filter(Boolean)
            .join(',\n');

          const fallbackRoute = labels[0] || 'branch_1';
          return [
            'graph.add_conditional_edges(',
            `    ${JSON.stringify(sourceFn)},`,
            `    lambda state: state.get('route', ${JSON.stringify(fallbackRoute)}),`,
            '    {',
            routeMap,
            '    }',
            ')',
          ].join('\n');
        })
        .filter(Boolean)
        .join('\n');

      const entryFn = entryId && idToFn[entryId] ? idToFn[entryId] : Object.values(idToFn)[0];
      const entryHasOutgoing = entryId ? (outgoingBySource.get(entryId) || []).length > 0 : false;
      const pythonStateTypeLines = stateKeys.map(
        (key) => `    ${JSON.stringify(key)}: ${getPythonAnnotationByType(getStateDatatype(key))},`
      );

      return [
        'from typing import TypedDict, Optional',
        'from langchain.agents import create_agent',
        'from langgraph.graph import StateGraph, END',
        '',
        "State = TypedDict('State', {",
        ...pythonStateTypeLines,
        "    'system_api_key': str,",
        "    'has_system_api_key': bool,",
        '}, total=False)',
        '',
        ...functionBlocks,
        'graph = StateGraph(State)',
        ...Object.values(idToFn).map((functionName) => `graph.add_node('${functionName}', ${functionName})`),
        edgeLines,
        conditionalEdgeLines,
        '',
        entryFn ? `graph.set_entry_point('${entryFn}')` : '',
        entryFn && !entryHasOutgoing ? `graph.add_edge('${entryFn}', END)` : '',
        '',
        'app = graph.compile()',
      ]
        .filter(Boolean)
        .join('\n');
    },
    [
      nodes,
      edges,
      getLinkedRetrieverStoreIds,
      getLinkedLlmNodes,
      getLinkedPromptNodes,
      getLinkedToolNodes,
      getStartStateKeysForCode,
      getConfiguredStartStateKeys,
      getStartStateDefaultLiteral,
      getStateDatatype,
    ]
  );

  const generateLangGraphJsCode = useCallback(
    (startAgentId) => {
      const nodeMap = new Map(nodes.map((node) => [node.id, node]));
      const edgePairs = edges.map((edge) => [edge.source, edge.target]);
      const connectedTargets = new Set(edges.map((edge) => edge.target));
      const outgoingBySource = new Map();
      edges.forEach((edge) => {
        if (!outgoingBySource.has(edge.source)) {
          outgoingBySource.set(edge.source, []);
        }
        outgoingBySource.get(edge.source).push(edge.target);
      });

      const startInputNode = nodes.find((node) => node.data?.nodeType === 'start') || null;
      const startNode =
        startInputNode ||
        nodeMap.get(startAgentId) ||
        nodes.find((node) => node.data?.nodeType === 'agent') ||
        nodes[0];
      const entryNode = startNode || nodes.find((node) => !connectedTargets.has(node.id)) || null;
      const entryId = entryNode?.id || '';
      const stateKeys = getStartStateKeysForCode();
      const configuredStartKeys = getConfiguredStartStateKeys();

      const idToFn = {};
      const functionBlocks = nodes.map((node, index) => {
        const safeName = toIdentifier(node.data?.label, `node_${index + 1}`);
        const functionName = `${safeName}_${node.id}`;
        idToFn[node.id] = functionName;

        if (node.data?.nodeType === 'prompt') {
          const promptText = node.data?.prompt?.trim() || node.data?.label || 'Prompt';
          return [
            `const ${functionName} = async (state) => {`,
            `  const prompt = ${JSON.stringify(promptText)};`,
            "  return { ...state, prompt };",
            '};',
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'agent') {
          const linkedRetrieverStores = getLinkedRetrieverStoreIds(node.id);
          const linkedLlmModels = getLinkedLlmNodes(node.id).map(
            (llmNode) => llmNode.data?.model || 'gpt-4.1-mini'
          );
          const linkedPromptTexts = getLinkedPromptNodes(node.id).map(
            (promptNode) => promptNode.data?.prompt?.trim() || promptNode.data?.label || 'Prompt'
          );
          const linkedTools = getLinkedToolNodes(node.id).map((toolNode) => toolNode.data?.label || 'Tool');
          const outputStateKey = String(node.data?.outputStateKey || 'result').trim() || 'result';
          const outputWriteMode = String(node.data?.outputWriteMode || 'append').trim() || 'append';
          return [
            `const ${functionName} = async (state) => {`,
            `  const baseSystemPrompt = ${JSON.stringify(node.data?.agentPrompt || '')};`,
            `  const linkedPrompts = ${JSON.stringify(linkedPromptTexts)};`,
            '  const systemPrompt = [baseSystemPrompt, ...linkedPrompts].filter(Boolean).join("\\n\\n");',
            `  const llmModels = ${JSON.stringify(linkedLlmModels)};`,
            `  const linkedTools = ${JSON.stringify(linkedTools)};`,
            `  const retrieverStoreIds = ${JSON.stringify(linkedRetrieverStores)};`,
            `  const outputStateKey = ${JSON.stringify(outputStateKey)};`,
            `  const outputWriteMode = ${JSON.stringify(outputWriteMode)};`,
            "  const model = llmModels[0] || state.defaultModel || 'gpt-4.1-mini';",
            '  const tools = [',
            "    ...linkedTools.map((name, index) => ({ name: `tool_${index + 1}`, description: String(name || 'Tool') })),",
            "    ...retrieverStoreIds.map((storeId, index) => ({",
            "      name: `retrieve_context_${index + 1}`,",
            "      description: `Retrieve relevant context from OpenAI vector store ${storeId}.`,",
            "      metadata: { type: 'retriever', provider: 'openai_vector_store', vectorStoreId: storeId },",
            '    })),',
            '  ];',
            '  const agent = createAgent({',
            "    model: `openai:${model}`,",
            '    tools,',
            '    systemPrompt,',
            '  });',
            '  const agentResult = await agent.invoke({',
            '    messages: Array.isArray(state.conversation_messages) && state.conversation_messages.length',
            '      ? state.conversation_messages',
            '      : [{ role: "user", content: state.user_input || "" }],',
            '  });',
            '  const completion = getAgentResultText(agentResult);',
            '  const nextMessages = Array.isArray(agentResult?.messages) ? agentResult.messages : state.conversation_messages;',
            '  const previousValue = state?.[outputStateKey];',
            '  const nextValue = (() => {',
            "    if (outputStateKey === 'conversation_messages') {",
            "      if (outputWriteMode === 'replace') return [{ role: 'assistant', content: completion }];",
            '      return Array.isArray(nextMessages)',
            '        ? nextMessages',
            "        : [{ role: 'assistant', content: completion }];",
            '    }',
            "    if (outputWriteMode === 'replace') return completion;",
            '    if (Array.isArray(previousValue)) return previousValue.concat(completion);',
            "    if (typeof previousValue === 'string' && previousValue) return `${previousValue}\\n${completion}`;",
            "    if (previousValue == null || previousValue === '') return completion;",
            '    return [previousValue, completion];',
            '  })();',
            `  return { ...state, last_agent: ${JSON.stringify(node.data?.label || 'Agent')}, [outputStateKey]: nextValue, result: completion, systemPrompt, conversation_messages: nextMessages };`,
            '};',
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'llm') {
          const linkedRetrieverStores = getLinkedRetrieverStoreIds(node.id);
          return [
            `const ${functionName} = async (state) => {`,
            `  const retrieverStoreIds = ${JSON.stringify(linkedRetrieverStores)};`,
            '  const model = ' + JSON.stringify(node.data?.model || 'gpt-4.1-mini') + ';',
            '  const completion = await runModel({',
            '    apiKey: state.apiKey || "",',
            '    model,',
            '    systemPrompt: state.systemPrompt || "",',
            '    userInput: state.user_input || "",',
            '    messages: state.conversation_messages || [],',
            '    retrieverStoreIds,',
            '    linkedTools: [],',
            '  });',
            '  return { ...state, last_llm: model, result: completion };',
            '};',
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'condition') {
          const branchLabels = parseBranches(node.data?.branches);
          const fallbackRoute = branchLabels[0] || 'default';
          const conditionKind = node.data?.conditionKind || 'custom';
          return [
            `const ${functionName} = async (state) => {`,
            `  // Condition type: ${conditionKind}`,
            `  return { ...state, route: state.route || ${JSON.stringify(fallbackRoute)} };`,
            '};',
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'tool') {
          if (node.data?.toolKind === 'retriever') {
            return [
              `const ${functionName} = async (state) => {`,
              `  const vectorStoreId = ${JSON.stringify(node.data?.retriever?.vectorStoreId || '')};`,
              '  return { ...state, retriever_store_id: vectorStoreId };',
              '};',
              '',
            ].join('\n');
          }
          return [
            `const ${functionName} = async (state) => {`,
            '  return state;',
            '};',
            '',
          ].join('\n');
        }

        if (node.data?.nodeType === 'start') {
          const startInitProps = configuredStartKeys.map(
            (item) =>
              `'${item.key}': state['${item.key}'] ?? ${getStartStateDefaultLiteral(item.key, 'js')}`
          );
          const startReturnExpr = startInitProps.length
            ? `{ ...state, ${startInitProps.join(', ')} }`
            : '{ ...state }';
          return [
            `const ${functionName} = async (state) => {`,
            `  return ${startReturnExpr};`,
            '};',
            '',
          ].join('\n');
        }

        return [
          `const ${functionName} = async (state) => {`,
          '  return state;',
          '};',
          '',
        ].join('\n');
      });

      const conditionNodeIds = new Set(
        nodes.filter((node) => node.data?.nodeType === 'condition').map((node) => node.id)
      );
      const edgeLines = edgePairs
        .filter(([source]) => !conditionNodeIds.has(source))
        .map(([source, target]) => {
          const sourceFn = idToFn[source];
          const targetFn = idToFn[target];
          return sourceFn && targetFn ? `graph.addEdge(${JSON.stringify(sourceFn)}, ${JSON.stringify(targetFn)});` : '';
        })
        .filter(Boolean)
        .join('\n');

      const conditionalEdgeLines = nodes
        .filter((node) => node.data?.nodeType === 'condition')
        .map((conditionNode) => {
          const sourceFn = idToFn[conditionNode.id];
          const targetIds = outgoingBySource.get(conditionNode.id) || [];
          if (!sourceFn || targetIds.length === 0) {
            return '';
          }
          const labels = parseBranches(conditionNode.data?.branches);
          const mapLines = targetIds
            .map((targetId, index) => {
              const targetFn = idToFn[targetId];
              if (!targetFn) {
                return null;
              }
              const label = labels[index] || `branch_${index + 1}`;
              return `    ${JSON.stringify(label)}: ${JSON.stringify(targetFn)}`;
            })
            .filter(Boolean)
            .join(',\n');
          return [
            `graph.addConditionalEdges(${JSON.stringify(sourceFn)}, (state) => state.route || ${JSON.stringify(labels[0] || 'branch_1')}, {`,
            mapLines,
            '});',
          ].join('\n');
        })
        .filter(Boolean)
        .join('\n');

      const entryFn = entryId && idToFn[entryId] ? idToFn[entryId] : Object.values(idToFn)[0];
      const jsStatePropertyLines = stateKeys.map(
        (key) => ` * @property {${getJsDocTypeByType(getStateDatatype(key))}} ${key}`
      );
      return [
        '// Runtime-provided: StateGraph, END, runModel, createAgent',
        '',
        '/**',
        ' * @typedef {Object} State',
        ...jsStatePropertyLines,
        ' * @property {string=} system_api_key',
        ' * @property {boolean=} has_system_api_key',
        ' */',
        '',
        'const getAgentResultText = (result) => {',
        '  if (!result) return "";',
        '  if (typeof result.output_text === "string") return result.output_text;',
        '  if (typeof result.result === "string") return result.result;',
        '  if (Array.isArray(result.messages)) {',
        '    for (let i = result.messages.length - 1; i >= 0; i -= 1) {',
        '      const msg = result.messages[i];',
        '      if (msg?.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {',
        '        return msg.content;',
        '      }',
        '      if (Array.isArray(msg?.content)) {',
        '        const textPart = msg.content.find((part) => typeof part?.text === "string" && part.text.trim());',
        '        if (textPart?.text) return textPart.text;',
        '      }',
        '    }',
        '  }',
        '  if (typeof result.content === "string") return result.content;',
        '  if (Array.isArray(result.content)) {',
        '    const textPart = result.content.find((part) => typeof part?.text === "string" && part.text.trim());',
        '    if (textPart?.text) return textPart.text;',
        '  }',
        '  return "";',
        '};',
        '',
        ...functionBlocks,
        'const graph = new StateGraph({});',
        ...Object.values(idToFn).map((functionName) => `graph.addNode(${JSON.stringify(functionName)}, ${functionName});`),
        edgeLines,
        conditionalEdgeLines,
        entryFn ? `graph.setEntryPoint(${JSON.stringify(entryFn)});` : '',
        'const app = graph.compile();',
      ]
        .filter(Boolean)
        .join('\n');
    },
    [
      nodes,
      edges,
      getLinkedRetrieverStoreIds,
      getLinkedLlmNodes,
      getLinkedPromptNodes,
      getLinkedToolNodes,
      getStartStateKeysForCode,
      getConfiguredStartStateKeys,
      getStartStateDefaultLiteral,
      getStateDatatype,
    ]
  );

  const extractFlowContext = useCallback(
    (startId) => {
      const nodeMap = new Map(nodes.map((node) => [node.id, node]));
      const adjacency = new Map();
      edges.forEach((edge) => {
        if (!adjacency.has(edge.source)) {
          adjacency.set(edge.source, []);
        }
        adjacency.get(edge.source).push(edge.target);
      });

      const prompts = [];
      const tools = [];
      const outputs = [];
      const conditions = [];
      const path = [];
      const stack = [startId];
      const visited = new Set();

      while (stack.length > 0) {
        const nodeId = stack.pop();
        if (visited.has(nodeId)) {
          continue;
        }
        visited.add(nodeId);

        const node = nodeMap.get(nodeId);
        if (!node) {
          continue;
        }

        const label = node.data?.label || `Node ${node.id}`;
        path.push(label);

        switch (node.data?.nodeType) {
          case 'prompt':
            if (node.data?.prompt?.trim()) {
              prompts.push(node.data.prompt.trim());
            } else {
              prompts.push(label);
            }
            break;
          case 'tool':
            tools.push(label);
            break;
          case 'condition':
            conditions.push(label);
            break;
          case 'output':
            outputs.push(label);
            break;
          default:
            break;
        }

        const nextIds = adjacency.get(nodeId) || [];
        for (let i = nextIds.length - 1; i >= 0; i -= 1) {
          stack.push(nextIds[i]);
        }
      }

      return { prompts, tools, outputs, conditions, path };
    },
    [nodes, edges]
  );

  const getResponseText = useCallback((payload) => {
    if (payload?.output_text) {
      return payload.output_text;
    }

    const chunks = payload?.output || [];
    for (const item of chunks) {
      const content = item?.content || [];
      for (const part of content) {
        if (part?.type === 'output_text' && part?.text) {
          return part.text;
        }
      }
    }

    return '';
  }, []);
  const getTextFromStateValue = useCallback((value) => {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const lastItem = value[value.length - 1];
      if (typeof lastItem === 'string') {
        return lastItem.trim();
      }
      if (lastItem && typeof lastItem === 'object') {
        const content = lastItem.content;
        if (typeof content === 'string') {
          return content.trim();
        }
        if (Array.isArray(content)) {
          return content
            .map((part) =>
              typeof part?.text === 'string'
                ? part.text
                : typeof part === 'string'
                  ? part
                  : ''
            )
            .filter(Boolean)
            .join('\n')
            .trim();
        }
      }
      return '';
    }
    if (value && typeof value === 'object') {
      const content = value.content;
      if (typeof content === 'string') {
        return content.trim();
      }
    }
    return '';
  }, []);

  const startAgentForPreview = findStartAgent();
  const startInputForPreview = findStartInputNode();
  const langGraphPythonCode = useMemo(
    () => generateLangGraphCode(startInputForPreview?.id || startAgentForPreview?.id),
    [generateLangGraphCode, startInputForPreview, startAgentForPreview]
  );
  const langGraphJsCode = useMemo(
    () => generateLangGraphJsCode(startInputForPreview?.id || startAgentForPreview?.id),
    [generateLangGraphJsCode, startInputForPreview, startAgentForPreview]
  );

  const onRunFlow = useCallback(async () => {
    const userMessage = chatInput.trim();
    if (!userMessage || isRunning) {
      return;
    }

    const flowValidationError = validateRunnableFlow();
    if (flowValidationError) {
      showRunnerError(flowValidationError);
      return;
    }

    const startAgent = findStartAgent();
    if (!startAgent) {
      showRunnerError('請至少新增一個 Agent 節點後再執行流程。');
      return;
    }

    setRunnerError('');
    setErrorDialogMessage('');
    setIsRunning(true);
    setChatInput('');
    setChatHistory((prev) => prev.concat({ role: 'user', text: userMessage }));
    const conversationMessages = chatHistory
      .map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: String(item.text || '').trim(),
      }))
      .filter((item) => item.content)
      .concat({ role: 'user', content: userMessage });

    try {
      const startAgentSystemPrompt = buildAgentSystemPrompt(startAgent.id, startAgent.data?.agentPrompt || '');
      const systemNode = findSystemNode();
      const globalApiKeyFromVars = getSystemVarValue(systemNode, 'OPENAI_API_KEY').trim();
      const linkedLlmNodes = getLinkedLlmNodes(startAgent.id);
      const primaryLlmNode = linkedLlmNodes[0];
      const apiKey =
        primaryLlmNode?.data?.apiKey?.trim() ||
        globalApiKeyFromVars ||
        systemNode?.data?.globalApiKey?.trim();
      const model = primaryLlmNode?.data?.model || 'gpt-4.1-mini';
      const runtimeCode = generateLangGraphJsCode(startInputForPreview?.id || startAgent.id);
      let assistantText = '';

      const runModel = async ({
        apiKey: runApiKey,
        model: runModelName,
        systemPrompt,
        userInput,
        messages,
        retrieverStoreIds,
        linkedTools: runLinkedTools,
        retrievedContext,
      }) => {
        if (!runApiKey) {
          return '';
        }
        const normalizedModel = String(runModelName || model)
          .replace(/^openai:/, '')
          .trim();
        const fullSystemPrompt = [
          'You are an assistant running from JS LangGraph execution.',
          systemPrompt || '',
          runLinkedTools?.length ? `Linked tools: ${runLinkedTools.join(', ')}` : '',
          retrieverStoreIds?.length
            ? `Linked retriever vector stores: ${retrieverStoreIds.join(', ')}`
            : '',
          retrievedContext
            ? ['Retrieved context (RAG):', retrievedContext].join('\n')
            : '',
          globalApiKeyFromVars || systemNode?.data?.globalApiKey
            ? 'System node provides global API key.'
            : '',
          'Generated graph code:',
          '```javascript',
          runtimeCode,
          '```',
        ]
          .filter(Boolean)
          .join('\n');
        const normalizedMessages = Array.isArray(messages)
          ? messages
              .map((message) => {
                const role = ['system', 'assistant', 'user'].includes(message?.role)
                  ? message.role
                  : 'user';
                const content = Array.isArray(message?.content)
                  ? message.content
                      .map((part) =>
                        typeof part?.text === 'string'
                          ? part.text
                          : typeof part === 'string'
                            ? part
                            : ''
                      )
                      .filter(Boolean)
                      .join('\n')
                  : String(message?.content || '');
                return { role, content };
              })
              .filter((message) => message.content.trim())
          : [];
        const modelInput = [{ role: 'system', content: fullSystemPrompt }]
          .concat(
            normalizedMessages.length > 0
              ? normalizedMessages
              : [{ role: 'user', content: userInput || '' }]
          );

        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${runApiKey}`,
          },
          body: JSON.stringify({
            model: normalizedModel || model,
            input: modelInput,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
        }

        const payload = await response.json();
        return getResponseText(payload);
      };

      const searchOpenAIVectorStore = async ({
        runApiKey,
        vectorStoreId,
        query,
        maxNumResults = 4,
      }) => {
        if (!runApiKey || !vectorStoreId || !query) {
          return [];
        }

        const response = await fetch(
          `https://api.openai.com/v1/vector_stores/${encodeURIComponent(vectorStoreId)}/search`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${runApiKey}`,
            },
            body: JSON.stringify({
              query,
              max_num_results: maxNumResults,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Vector store search failed: ${response.status} ${errorText}`);
        }

        const payload = await response.json();
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        return rows
          .map((row) => {
            if (typeof row?.content === 'string') {
              return row.content.trim();
            }
            if (Array.isArray(row?.content)) {
              const merged = row.content
                .map((part) => {
                  if (typeof part?.text === 'string') {
                    return part.text;
                  }
                  if (typeof part?.content === 'string') {
                    return part.content;
                  }
                  return '';
                })
                .filter(Boolean)
                .join('\n')
                .trim();
              return merged;
            }
            return '';
          })
          .filter(Boolean);
      };

      const createAgent = ({ model: agentModel, tools = [], systemPrompt = '' }) => ({
        invoke: async ({ messages = [] }) => {
          const lastUser = [...messages]
            .reverse()
            .find((message) => message?.role === 'user' && message?.content != null);
          const userInput = Array.isArray(lastUser?.content)
            ? lastUser.content
                .map((part) => (typeof part?.text === 'string' ? part.text : ''))
                .join('\n')
                .trim()
            : String(lastUser?.content || '');
          const retrieverStoreIds = tools
            .filter((tool) => tool?.metadata?.type === 'retriever')
            .map((tool) => tool?.metadata?.vectorStoreId)
            .filter((storeId) => typeof storeId === 'string' && storeId.trim());
          const linkedTools = tools
            .map((tool) => tool?.description || tool?.name || '')
            .filter(Boolean);
          let retrievedContext = '';
          if (retrieverStoreIds.length > 0 && userInput) {
            const chunks = [];
            for (const storeId of retrieverStoreIds) {
              const rows = await searchOpenAIVectorStore({
                runApiKey: apiKey || '',
                vectorStoreId: storeId,
                query: userInput,
              });
              if (rows.length > 0) {
                chunks.push(`[vector_store:${storeId}]`);
                chunks.push(...rows);
              }
            }
            retrievedContext = chunks.join('\n\n');
          }
          const text = await runModel({
            apiKey: apiKey || '',
            model: agentModel || model,
            systemPrompt,
            userInput,
            messages,
            retrieverStoreIds,
            linkedTools,
            retrievedContext,
          });
          return {
            output_text: text,
            messages: messages.concat({ role: 'assistant', content: text }),
          };
        },
      });

      const finalState = await executeGeneratedGraph(runtimeCode, runModel, createAgent, {
        user_input: userMessage,
        apiKey,
        defaultModel: model,
        systemPrompt: startAgentSystemPrompt,
        conversation_messages: conversationMessages,
      });

      const agentOutputKey = String(startAgent?.data?.outputStateKey || 'result').trim() || 'result';
      const rawAssistantValue = finalState?.[agentOutputKey];
      assistantText =
        getTextFromStateValue(rawAssistantValue) ||
        getTextFromStateValue(finalState?.result) ||
        String(finalState?.result || '').trim();
      if (!assistantText) {
        throw new Error('未取得語言模型回覆。請確認 API Key、模型設定與節點連線。');
      }

      setChatHistory((prev) => prev.concat({ role: 'assistant', text: assistantText }));
    } catch (error) {
      showRunnerError(error);
    } finally {
      setIsRunning(false);
    }
  }, [
    chatInput,
    chatHistory,
    isRunning,
    validateRunnableFlow,
    showRunnerError,
    findStartAgent,
    buildAgentSystemPrompt,
    findSystemNode,
    getLinkedLlmNodes,
    generateLangGraphCode,
    generateLangGraphJsCode,
    getResponseText,
    getTextFromStateValue,
    startInputForPreview,
  ]);

  return (
    <div
      className={`builder-layout${isSidebarCollapsed ? ' sidebar-collapsed' : ''}${isSettingsCollapsed ? ' settings-collapsed' : ''}`}
    >
      <aside className={`sidebar${isSidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="panel-header">
          <div>
            {isSidebarCollapsed && <div className="collapsed-brand">ChihFlow</div>}
            {!isSidebarCollapsed && <h1>ChihFlow</h1>}
            {!isSidebarCollapsed && <p>把節點拖曳到畫布上，建立你的 Agent 流程。</p>}
          </div>
          <button
            type="button"
            className="panel-toggle"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            aria-label={isSidebarCollapsed ? '展開 ChihFlow 面板' : '收合 ChihFlow 面板'}
            title={isSidebarCollapsed ? '展開' : '收合'}
          >
            {isSidebarCollapsed ? '>' : '<'}
          </button>
        </div>

        {!isSidebarCollapsed && <div className="sidebar-scroll">
        <div className="node-palette">
          {nodePalette.map((node) =>
            node.type === 'condition' ? (
              <div key={node.type} className="condition-chooser">
                <button
                  type="button"
                  className="palette-item"
                  onClick={() => setShowConditionOptions((prev) => !prev)}
                >
                  <span className="palette-title">{node.label}</span>
                  <span className="palette-description">{node.description}</span>
                </button>
                {showConditionOptions && (
                  <div className="condition-options">
                    {conditionTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className="condition-option"
                        draggable
                        onDragStart={(event) =>
                          onDragStart(event, {
                            type: 'condition',
                            label: template.label,
                            description: template.description,
                            color: node.color,
                            branches: template.branches,
                            conditionKind: template.id,
                          })
                        }
                      >
                        <span className="palette-title">{template.label}</span>
                        <span className="palette-description">{template.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : node.type === 'tool' ? (
              <div key={node.type} className="condition-chooser">
                <button
                  type="button"
                  className="palette-item"
                  onClick={() => setShowToolOptions((prev) => !prev)}
                >
                  <span className="palette-title">{node.label}</span>
                  <span className="palette-description">{node.description}</span>
                </button>
                {showToolOptions && (
                  <div className="condition-options">
                    {toolTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className="condition-option"
                        draggable
                        onDragStart={(event) =>
                          onDragStart(event, {
                            type: 'tool',
                            label: template.label,
                            description: template.description,
                            color: node.color,
                            toolKind: template.toolKind,
                          })
                        }
                      >
                        <span className="palette-title">{template.label}</span>
                        <span className="palette-description">{template.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={node.type}
                type="button"
                className="palette-item"
                draggable
                onDragStart={(event) => onDragStart(event, node)}
              >
                <span className="palette-title">{node.label}</span>
                <span className="palette-description">{node.description}</span>
              </button>
            )
          )}
        </div>

        <div className="runner-panel">
          <h2>測試聊天機器人</h2>
          <p className="code-caption">產生的 LangGraph 程式碼</p>
          <div className="code-tabs">
            <button
              type="button"
              className={codeTab === 'js' ? 'code-tab active' : 'code-tab'}
              onClick={() => setCodeTab('js')}
            >
              JS
            </button>
            <button
              type="button"
              className={codeTab === 'python' ? 'code-tab active' : 'code-tab'}
              onClick={() => setCodeTab('python')}
            >
              Python
            </button>
          </div>
          <pre className="langgraph-code">{codeTab === 'js' ? langGraphJsCode : langGraphPythonCode}</pre>
          <div className="chat-messages">
            {chatHistory.length === 0 && (
              <p className="chat-empty">目前沒有訊息。輸入內容後執行流程。</p>
            )}
            {chatHistory.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`chat-message ${message.role === 'user' ? 'chat-user' : 'chat-assistant'}`}
              >
                <strong>{message.role === 'user' ? '你' : '機器人'}:</strong> {message.text}
              </div>
            ))}
          </div>
          <label>
            訊息
            <textarea
              rows={3}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="輸入要測試流程的訊息..."
            />
          </label>
          <button type="button" className="run-button" onClick={onRunFlow} disabled={isRunning}>
            {isRunning ? '執行中...' : '執行流程'}
          </button>
          {runnerError && <p className="runner-error">{runnerError}</p>}
        </div>
        </div>}
      </aside>

      <main className="canvas-wrap" ref={wrapperRef}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onInit={setReactFlowInstance}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
        >
          <Background gap={16} size={1} color="#d4d4d8" />
          <Controls position="bottom-right" />
          <MiniMap nodeColor={getMiniMapNodeColor} position="bottom-left" />
        </ReactFlow>
      </main>

      <aside className={`settings-panel${isSettingsCollapsed ? ' collapsed' : ''}`}>
        <div className="panel-header">
          {!isSettingsCollapsed && <h2>節點設定</h2>}
          <button
            type="button"
            className="panel-toggle"
            onClick={() => setIsSettingsCollapsed((prev) => !prev)}
            aria-label={isSettingsCollapsed ? '展開 Node Setting 面板' : '收合 Node Setting 面板'}
            title={isSettingsCollapsed ? '展開' : '收合'}
          >
            {isSettingsCollapsed ? '<' : '>'}
          </button>
        </div>

        {!isSettingsCollapsed && <div className="settings-scroll">
        {!selectedNode && <p>請先選擇一個節點進行設定。</p>}

        {selectedNode && (
          <div className="settings-fields">
            <label>
              節點名稱
              <input
                type="text"
                value={selectedNode.data?.label || ''}
                onChange={(event) =>
                  updateNodeData(selectedNode.id, { label: event.target.value })
                }
              />
            </label>

            <label>
              節點類型
              <input type="text" value={selectedNode.data?.nodeType || ''} readOnly />
            </label>

            {!isAgentNode && (
              <>
                <p className="settings-note">接收到的 State Keys</p>
                <div className="start-key-list">
                  {selectedIncomingStateKeys.length > 0 ? (
                    selectedIncomingStateKeys.map((item, index) => (
                      <div key={`incoming-state-key-${index}`} className="incoming-state-row">
                        <input type="text" value={item.key} readOnly />
                        <input type="text" value={item.type} readOnly />
                      </div>
                    ))
                  ) : (
                    <div className="incoming-state-row">
                      <input type="text" value="無" readOnly />
                      <input type="text" value="-" readOnly />
                    </div>
                  )}
                </div>
              </>
            )}

            {isStartNode && (
              <>
                <p className="settings-note">
                  固定 START 節點：接收測試聊天機器人的輸入訊息，變數為{' '}
                  <code>{selectedNode.data?.inputKey || 'user_input'}</code>。
                </p>
                <p className="settings-note">State Keys</p>
                <div className="start-key-list">
                  {(selectedNode.data?.startStateKeys || []).map((item, index) => (
                    <div key={`start-key-${index}`} className="start-key-row">
                      <input
                        type="text"
                        placeholder="state key"
                        value={item.key || ''}
                        onChange={(event) =>
                          updateStartStateKey(selectedNode.id, index, { key: event.target.value })
                        }
                      />
                      <select
                        value={normalizeStateDataType(item.type)}
                        onChange={(event) =>
                          updateStartStateKey(selectedNode.id, index, { type: event.target.value })
                        }
                      >
                        {stateDataTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="system-var-remove"
                        onClick={() => removeStartStateKey(selectedNode.id, index)}
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="system-var-add"
                  onClick={() => addStartStateKey(selectedNode.id)}
                >
                  + 新增 Key
                </button>
              </>
            )}

            {isSystemNode && (
              <>
                <p className="settings-note">System 變數（key-value）</p>
                <div className="system-var-list">
                  {(selectedNode.data?.systemVars || []).map((item, index) => (
                    <div key={`sys-var-${index}`} className="system-var-row">
                      <input
                        type="text"
                        placeholder="KEY"
                        value={item.key}
                        onChange={(event) =>
                          updateSystemVar(selectedNode.id, index, { key: event.target.value })
                        }
                      />
                      <input
                        type={item.key === 'OPENAI_API_KEY' ? 'password' : 'text'}
                        placeholder="VALUE"
                        value={item.value}
                        onChange={(event) =>
                          updateSystemVar(selectedNode.id, index, { value: event.target.value })
                        }
                      />
                      <button
                        type="button"
                        className="system-var-remove"
                        onClick={() => removeSystemVar(selectedNode.id, index)}
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="system-var-add"
                  onClick={() => addSystemVar(selectedNode.id)}
                >
                  + 新增變數
                </button>
                <p className="settings-note">
                  可使用 <code>OPENAI_API_KEY</code> 設定全域 OpenAI 金鑰，Agent 仍可用自身金鑰覆蓋。
                </p>
              </>
            )}

            {isAgentNode && (
              <>
                <p className="settings-note">
                  已連接 LLM 模型：{' '}
                  {getLinkedLlmNodes(selectedNode.id)
                    .map((node) => node.data?.model || 'gpt-4.1-mini')
                    .join(', ') || '無'}
                </p>
                <p className="settings-note">
                  已連接工具：{' '}
                  {getLinkedToolNodes(selectedNode.id)
                    .map((node) => node.data?.label || 'Tool')
                    .join(', ') || '無'}
                </p>
                <p className="settings-note">
                  已連接 Retriever：{' '}
                  {getLinkedRetrieverStoreIds(selectedNode.id).join(', ') || '無'}
                </p>
                <p className="settings-note">
                  已連接 Prompt：{' '}
                  {getLinkedPromptNodes(selectedNode.id)
                    .map((node) => node.data?.label || 'Prompt')
                    .join(', ') || '無'}
                </p>
                <p className="settings-note">執行時會合併「Agent 提示詞」與已連接 Prompt 的文字內容。</p>

                <label>
                  Agent 提示詞
                  <textarea
                    rows={5}
                    placeholder="你是一個樂於助人的助手..."
                    value={selectedNode.data?.agentPrompt || ''}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, { agentPrompt: event.target.value })
                    }
                  />
                </label>

                <label>
                  輸出 State Key
                  <select
                    value={
                      selectedIncomingStateKeys.some(
                        (item) => item.key === (selectedNode.data?.outputStateKey || 'result')
                      )
                        ? selectedNode.data?.outputStateKey || 'result'
                        : '__new__'
                    }
                    onChange={(event) => {
                      if (event.target.value === '__new__') {
                        const existingCustomKey = String(
                          selectedNode.data?.outputStateKey || ''
                        ).trim();
                        updateNodeData(selectedNode.id, {
                          outputStateKey:
                            selectedIncomingStateKeys.some((item) => item.key === existingCustomKey)
                              ? ''
                              : existingCustomKey,
                        });
                        return;
                      }
                      updateNodeData(selectedNode.id, { outputStateKey: event.target.value });
                    }}
                  >
                    {selectedIncomingStateKeys.map((item) => (
                      <option key={`agent-output-key-${item.key}`} value={item.key}>
                        {item.key} ({item.type})
                      </option>
                    ))}
                    <option value="__new__">新增 Key</option>
                  </select>
                </label>

                {(!selectedIncomingStateKeys.some(
                  (item) => item.key === (selectedNode.data?.outputStateKey || 'result')
                ) ||
                  !String(selectedNode.data?.outputStateKey || '').trim()) && (
                  <label>
                    新增 Key 名稱
                    <input
                      type="text"
                      placeholder="result"
                      value={selectedNode.data?.outputStateKey || ''}
                      onChange={(event) =>
                        updateNodeData(selectedNode.id, { outputStateKey: event.target.value })
                      }
                    />
                  </label>
                )}

                <label>
                  寫入方式
                  <select
                    value={selectedNode.data?.outputWriteMode || 'append'}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, { outputWriteMode: event.target.value })
                    }
                  >
                    <option value="append">append（預設）</option>
                    <option value="replace">replace（覆蓋）</option>
                  </select>
                </label>

                <p className="settings-note">接收到的 State Keys</p>
                <div className="start-key-list">
                  {selectedIncomingStateKeys.length > 0 ? (
                    selectedIncomingStateKeys.map((item, index) => (
                      <div key={`incoming-state-key-${index}`} className="incoming-state-row">
                        <input type="text" value={item.key} readOnly />
                        <input type="text" value={item.type} readOnly />
                      </div>
                    ))
                  ) : (
                    <div className="incoming-state-row">
                      <input type="text" value="無" readOnly />
                      <input type="text" value="-" readOnly />
                    </div>
                  )}
                </div>
              </>
            )}

            {isLlmNode && (
              <>
                <p className="settings-note">
                  已連接 Retriever：{' '}
                  {getLinkedRetrieverStoreIds(selectedNode.id).join(', ') || '無'}
                </p>
                <label>
                  供應商
                  <select
                    value={selectedNode.data?.provider || 'openai'}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, { provider: event.target.value })
                    }
                  >
                    <option value="openai">OpenAI</option>
                  </select>
                </label>

                <label>
                  LLM Model
                  <select
                    value={selectedNode.data?.model || 'gpt-4.1-mini'}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, { model: event.target.value })
                    }
                  >
                    {openAIModels.map((modelName) => (
                      <option key={modelName} value={modelName}>
                        {modelName}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  OpenAI 金鑰
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={selectedNode.data?.apiKey || ''}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, { apiKey: event.target.value })
                    }
                  />
                </label>
              </>
            )}

            {isToolNode && (
              <>
                <label>
                  工具類型
                  <select
                    value={selectedNode.data?.toolKind || 'retriever'}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, { toolKind: event.target.value })
                    }
                  >
                    <option value="retriever">Retriever</option>
                  </select>
                </label>

                {selectedNode.data?.toolKind === 'retriever' && (
                  <>
                    <label>
                      Retriever 供應商
                      <select
                        value={selectedNode.data?.retriever?.provider || 'openai'}
                        onChange={(event) =>
                          updateNodeData(selectedNode.id, {
                            retriever: {
                              ...(selectedNode.data?.retriever || defaultRetrieverConfig),
                              provider: event.target.value,
                            },
                          })
                        }
                      >
                        <option value="openai">OpenAI Vector Store</option>
                      </select>
                    </label>

                    <label>
                      上傳 PDF
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          onUploadRetrieverPdf(selectedNode.id, file);
                          event.target.value = '';
                        }}
                      />
                    </label>

                    <label>
                      向量資料庫 ID
                      <input
                        type="text"
                        value={selectedNode.data?.retriever?.vectorStoreId || ''}
                        readOnly
                      />
                    </label>

                    {selectedNode.data?.retriever?.lastFileName && (
                      <p className="settings-note">
                        最近上傳檔案：<code>{selectedNode.data.retriever.lastFileName}</code>
                      </p>
                    )}
                    {selectedNode.data?.retriever?.status && (
                      <p className="settings-note">{selectedNode.data.retriever.status}</p>
                    )}
                    {selectedNode.data?.retriever?.error && (
                      <p className="runner-error">{selectedNode.data.retriever.error}</p>
                    )}
                  </>
                )}
              </>
            )}

            {isPromptNode && (
              <label>
                提示詞內容
                <textarea
                  rows={7}
                  placeholder="你是一個會協助使用者完成任務的助手..."
                  value={selectedNode.data?.prompt || ''}
                  onChange={(event) =>
                    updateNodeData(selectedNode.id, { prompt: event.target.value })
                  }
                />
              </label>
            )}

            {isConditionNode && (
              <>
                <label>
                  條件類型
                  <input
                    type="text"
                    value={selectedNode.data?.conditionKind || 'custom'}
                    readOnly
                  />
                </label>
                <label>
                  分支標籤（每行一個）
                  <textarea
                    rows={5}
                    placeholder={'true\nfalse'}
                    value={selectedNode.data?.branches || ''}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, { branches: event.target.value })
                    }
                  />
                </label>
                <p className="settings-note">
                  請依序連接輸出邊，分支標籤會依順序對應目標節點。
                </p>
              </>
            )}

            {isGroupNode && (
              <>
                <p className="settings-note">範圍群組：框內節點可綁定並跟著一起拖移。</p>
                <label>
                  範圍寬度
                  <input
                    type="number"
                    min={180}
                    value={selectedNode.data?.rangeWidth || 420}
                    onChange={(event) =>
                      updateGroupRangeSize(selectedNode.id, {
                        rangeWidth: event.target.value,
                        rangeHeight: selectedNode.data?.rangeHeight || 240,
                      })
                    }
                  />
                </label>
                <label>
                  範圍高度
                  <input
                    type="number"
                    min={120}
                    value={selectedNode.data?.rangeHeight || 240}
                    onChange={(event) =>
                      updateGroupRangeSize(selectedNode.id, {
                        rangeWidth: selectedNode.data?.rangeWidth || 420,
                        rangeHeight: event.target.value,
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="system-var-add"
                  onClick={() => attachNodesIntoGroupRange(selectedNode.id)}
                >
                  套用範圍內節點
                </button>
                <button
                  type="button"
                  className="system-var-remove"
                  onClick={() => detachNodesFromGroupRange(selectedNode.id)}
                >
                  解除範圍節點綁定
                </button>
              </>
            )}
          </div>
        )}
        </div>}
      </aside>

      {errorDialogMessage && (
        <div className="error-modal-backdrop" onClick={() => setErrorDialogMessage('')}>
          <div
            className="error-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="runner-error-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="error-modal-header">
              <h3 id="runner-error-title">流程檢查錯誤</h3>
              <button
                type="button"
                className="error-modal-close"
                onClick={() => setErrorDialogMessage('')}
                aria-label="關閉"
              >
                ×
              </button>
            </div>
            <p>{errorDialogMessage}</p>
            <button
              type="button"
              className="error-modal-action"
              onClick={() => setErrorDialogMessage('')}
            >
              確定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FlowBuilder;
