import { useCallback, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
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
    description: 'LLM or role-based worker',
    color: '#f6d8ae',
  },
  {
    type: 'llm',
    label: 'LLM',
    description: 'Standalone model call',
    color: '#fee2e2',
  },
  {
    type: 'system',
    label: 'System',
    description: 'Global variables/config',
    color: '#ddd6fe',
  },
  {
    type: 'tool',
    label: 'Tool',
    description: 'Choose tool type',
    color: '#cce3f7',
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Choose condition type',
    color: '#d7f7cc',
  },
  {
    type: 'prompt',
    label: 'Prompt',
    description: 'Instruction template',
    color: '#fde68a',
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Final result',
    color: '#f8d1e3',
  },
];

const openAIModels = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'];
const conditionTemplates = [
  {
    id: 'bool_check',
    label: 'IF',
    description: 'Branch true/false',
    branches: 'true\nfalse',
  },
  {
    id: 'intent_router',
    label: 'Intent Router',
    description: 'Route by user intent',
    branches: 'sales\nsupport\ngeneral',
  },
  {
    id: 'confidence_gate',
    label: 'Confidence Gate',
    description: 'High vs low confidence',
    branches: 'high\nlow',
  },
];
const toolTemplates = [
  {
    id: 'retriever',
    label: 'Retriever',
    description: 'PDF search via vector store',
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
    },
  },
  {
    id: '2',
    type: 'llmNode',
    position: { x: 460, y: 100 },
    data: {
      label: 'LLM',
      nodeType: 'llm',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: '',
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
      <Handle id="flow-in" type="target" position={Position.Left} />
      <Handle id="llm-in" type="target" position={Position.Bottom} style={{ left: '35%' }} />
      <Handle id="tool-in" type="target" position={Position.Bottom} style={{ left: '70%' }} />
      <strong>{data?.label || 'Agent'}</strong>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 3,
          fontSize: 11,
          color: '#3f3f46',
          pointerEvents: 'none',
          height: 12,
        }}
      >
        <span style={{ position: 'absolute', left: '35%', transform: 'translateX(-50%)' }}>
          LLM
        </span>
        <span style={{ position: 'absolute', left: '70%', transform: 'translateX(-50%)' }}>
          Tool
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
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
      <Handle id="start-out" type="source" position={Position.Right} />
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
      <Handle id="llm-top" type="source" position={Position.Top} />
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
      <Handle id="tool-top" type="source" position={Position.Top} />
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
      <Handle id="output-in" type="target" position={Position.Left} />
      <strong>{data?.label || 'Output'}</strong>
    </div>
  );
}

function FlowBuilder() {
  const wrapperRef = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState('1');
  const [showConditionOptions, setShowConditionOptions] = useState(false);
  const [showToolOptions, setShowToolOptions] = useState(false);
  const [codeTab, setCodeTab] = useState('js');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runnerError, setRunnerError] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const nodeTypes = useMemo(
    () => ({
      agentNode: AgentCanvasNode,
      systemNode: SystemCanvasNode,
      startNode: StartCanvasNode,
      llmNode: LlmCanvasNode,
      toolNode: ToolCanvasNode,
      outputNode: OutputCanvasNode,
    }),
    []
  );

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
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
        paletteNode.type === 'output'
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
                    : paletteNode.type === 'output'
                      ? 'outputNode'
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

  const isAgentNode = selectedNode?.data?.nodeType === 'agent';
  const isLlmNode = selectedNode?.data?.nodeType === 'llm';
  const isToolNode = selectedNode?.data?.nodeType === 'tool';
  const isPromptNode = selectedNode?.data?.nodeType === 'prompt';
  const isStartNode = selectedNode?.data?.nodeType === 'start';
  const isConditionNode = selectedNode?.data?.nodeType === 'condition';
  const isSystemNode = selectedNode?.data?.nodeType === 'system';

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
            error: 'Missing API key. Set OPENAI_API_KEY in System node or agent key.',
          },
        });
        return;
      }

      const baseRetriever = nodes.find((node) => node.id === nodeId)?.data?.retriever || defaultRetrieverConfig;
      updateNodeData(nodeId, {
        retriever: {
          ...baseRetriever,
          status: 'Uploading PDF...',
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
          throw new Error(`File upload failed (${fileRes.status})`);
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
          throw new Error(`Vector store creation failed (${storeRes.status})`);
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
          throw new Error(`Attach file failed (${attachRes.status})`);
        }

        updateNodeData(nodeId, {
          retriever: {
            ...baseRetriever,
            vectorStoreId: storePayload.id,
            lastFileName: file.name,
            status: 'Vector store ready.',
            error: '',
          },
        });
      } catch (error) {
        updateNodeData(nodeId, {
          retriever: {
            ...baseRetriever,
            status: '',
            error: error.message || 'Failed to upload PDF to vector store.',
          },
        });
      }
    },
    [nodes, resolveApiKey, updateNodeData]
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
          const linkedTools = getLinkedToolNodes(node.id).map((toolNode) => toolNode.data?.label || 'Tool');
          return [
            `def ${functionName}(state: State):`,
            `    system_prompt = ${JSON.stringify(node.data?.agentPrompt || '')}`,
            `    llm_models = ${JSON.stringify(linkedLlmModels)}`,
            `    linked_tools = ${JSON.stringify(linkedTools)}`,
            `    retriever_store_ids = ${JSON.stringify(linkedRetrieverStores)}`,
            "    model = llm_models[0] if llm_models else state.get('default_model', 'gpt-4.1-mini')",
            "    tools = []  # TODO: map linked tools/retrievers to real LangChain tools",
            '    agent = create_agent(',
            '        model=f"openai:{model}",',
            '        tools=tools,',
            '        system_prompt=system_prompt,',
            '    )',
            "    result = agent.invoke({'messages': [{'role': 'user', 'content': state.get('user_input', '')}]})",
            "    text = result.get('output_text', '') if isinstance(result, dict) else ''",
            "    return {**state, 'last_agent': " + JSON.stringify(node.data?.label || 'Agent') + ", 'result': text}",
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
          return [
            `def ${functionName}(state: State):`,
            "    # Input node: receives message from chat UI",
            "    return {**state, 'user_input': state.get('user_input', '')}",
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

      return [
        'from typing import TypedDict, Optional',
        'from langchain.agents import create_agent',
        'from langgraph.graph import StateGraph, END',
        '',
        'class State(TypedDict, total=False):',
        '    user_input: str',
        '    prompt: str',
        '    result: str',
        '    last_agent: str',
        '    last_llm: str',
        '    system_api_key: str',
        '    has_system_api_key: bool',
        '    retriever_store_id: str',
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
    [nodes, edges, getLinkedRetrieverStoreIds, getLinkedLlmNodes, getLinkedToolNodes]
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
          const linkedTools = getLinkedToolNodes(node.id).map((toolNode) => toolNode.data?.label || 'Tool');
          return [
            `const ${functionName} = async (state) => {`,
            `  const systemPrompt = ${JSON.stringify(node.data?.agentPrompt || '')};`,
            `  const llmModels = ${JSON.stringify(linkedLlmModels)};`,
            `  const linkedTools = ${JSON.stringify(linkedTools)};`,
            `  const retrieverStoreIds = ${JSON.stringify(linkedRetrieverStores)};`,
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
            `  return { ...state, last_agent: ${JSON.stringify(node.data?.label || 'Agent')}, result: completion, systemPrompt, conversation_messages: nextMessages };`,
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
          return [
            `const ${functionName} = async (state) => {`,
            "  return { ...state, user_input: state.user_input || '' };",
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
      return [
        '// Runtime-provided: StateGraph, END, runModel, createAgent',
        '',
        '/** @typedef {{ user_input?: string, prompt?: string, result?: string, last_agent?: string, last_llm?: string, retriever_store_id?: string, route?: string, conversation_messages?: Array<{ role: string, content: string }> }} State */',
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
    [nodes, edges, getLinkedRetrieverStoreIds, getLinkedLlmNodes, getLinkedToolNodes]
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

    const startAgent = findStartAgent();
    if (!startAgent) {
      setRunnerError('Add at least one Agent node before running the flow.');
      return;
    }

    setRunnerError('');
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
      const context = extractFlowContext(startInputForPreview?.id || startAgent.id);
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
        systemPrompt: startAgent.data?.agentPrompt || '',
        conversation_messages: conversationMessages,
      });

      assistantText = finalState?.result || '';

      if (!assistantText) {
        const firstPrompt = context.prompts[0] || startAgent.data?.agentPrompt || '';
        const outputLabel = context.outputs[0] || '';
        assistantText = [
          firstPrompt ? `Prompt context: ${firstPrompt}` : '',
          `I received your message: "${userMessage}"`,
          outputLabel ? `Flow output node: ${outputLabel}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }

      setChatHistory((prev) => prev.concat({ role: 'assistant', text: assistantText }));
    } catch (error) {
      setRunnerError(error.message || 'Failed to run flow.');
    } finally {
      setIsRunning(false);
    }
  }, [
    chatInput,
    chatHistory,
    isRunning,
    findStartAgent,
    findSystemNode,
    getLinkedLlmNodes,
    extractFlowContext,
    generateLangGraphCode,
    generateLangGraphJsCode,
    getResponseText,
    startInputForPreview,
  ]);

  return (
    <div className="builder-layout">
      <aside className="sidebar">
        <h1>ChihFlow</h1>
        <p>Drag blocks into the canvas to build your agent flow.</p>
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
          <h2>Test Chatbot</h2>
          <p className="code-caption">Generated LangGraph Code</p>
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
              <p className="chat-empty">No messages yet. Enter input and run the flow.</p>
            )}
            {chatHistory.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`chat-message ${message.role === 'user' ? 'chat-user' : 'chat-assistant'}`}
              >
                <strong>{message.role === 'user' ? 'You' : 'Bot'}:</strong> {message.text}
              </div>
            ))}
          </div>
          <label>
            Message
            <textarea
              rows={3}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Type a test message for your agent flow..."
            />
          </label>
          <button type="button" className="run-button" onClick={onRunFlow} disabled={isRunning}>
            {isRunning ? 'Running...' : 'Run Flow'}
          </button>
          {runnerError && <p className="runner-error">{runnerError}</p>}
        </div>
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
          <Controls />
          <MiniMap nodeColor="#52525b" />
        </ReactFlow>
      </main>

      <aside className="settings-panel">
        <h2>Node Settings</h2>

        {!selectedNode && <p>Select a node to configure it.</p>}

        {selectedNode && (
          <div className="settings-fields">
            <label>
              Node name
              <input
                type="text"
                value={selectedNode.data?.label || ''}
                onChange={(event) =>
                  updateNodeData(selectedNode.id, { label: event.target.value })
                }
              />
            </label>

            <label>
              Node type
              <input type="text" value={selectedNode.data?.nodeType || ''} readOnly />
            </label>

            {isStartNode && (
              <p className="settings-note">
                Fixed START node: receives the input message from Test Chatbot as{' '}
                <code>{selectedNode.data?.inputKey || 'user_input'}</code>.
              </p>
            )}

            {isSystemNode && (
              <>
                <p className="settings-note">System Variables (key-value)</p>
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
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="system-var-add"
                  onClick={() => addSystemVar(selectedNode.id)}
                >
                  + Add Variable
                </button>
                <p className="settings-note">
                  Use <code>OPENAI_API_KEY</code> for global OpenAI key. Agent local key still overrides.
                </p>
              </>
            )}

            {isAgentNode && (
              <>
                <p className="settings-note">
                  Linked LLM models:{' '}
                  {getLinkedLlmNodes(selectedNode.id)
                    .map((node) => node.data?.model || 'gpt-4.1-mini')
                    .join(', ') || 'none'}
                </p>
                <p className="settings-note">
                  Linked tools:{' '}
                  {getLinkedToolNodes(selectedNode.id)
                    .map((node) => node.data?.label || 'Tool')
                    .join(', ') || 'none'}
                </p>
                <p className="settings-note">
                  Linked retrievers:{' '}
                  {getLinkedRetrieverStoreIds(selectedNode.id).join(', ') || 'none'}
                </p>

                <label>
                  Agent Prompt
                  <textarea
                    rows={5}
                    placeholder="You are a helpful assistant..."
                    value={selectedNode.data?.agentPrompt || ''}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, { agentPrompt: event.target.value })
                    }
                  />
                </label>
              </>
            )}

            {isLlmNode && (
              <>
                <p className="settings-note">
                  Linked retrievers:{' '}
                  {getLinkedRetrieverStoreIds(selectedNode.id).join(', ') || 'none'}
                </p>
                <label>
                  Provider
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
                  OpenAI API Key
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
                  Tool Type
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
                      Retriever Provider
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
                      Upload PDF
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
                      Vector Store ID
                      <input
                        type="text"
                        value={selectedNode.data?.retriever?.vectorStoreId || ''}
                        readOnly
                      />
                    </label>

                    {selectedNode.data?.retriever?.lastFileName && (
                      <p className="settings-note">
                        Last uploaded file: <code>{selectedNode.data.retriever.lastFileName}</code>
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
                Prompt text
                <textarea
                  rows={7}
                  placeholder="You are a helpful assistant that..."
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
                  Condition type
                  <input
                    type="text"
                    value={selectedNode.data?.conditionKind || 'custom'}
                    readOnly
                  />
                </label>
                <label>
                  Branch labels (one per line)
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
                  Connect outgoing edges in order. Branch labels map to those target nodes in sequence.
                </p>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

export default FlowBuilder;
