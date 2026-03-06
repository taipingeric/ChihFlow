import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLangGraphJsCode } from '../src/lib/codegen/jsGenerator.js';
import { generateLangGraphPythonCode } from '../src/lib/codegen/pythonGenerator.js';

const nodes = [
  {
    id: '1',
    data: {
      label: 'START',
      nodeType: 'start',
      startStateKeys: [
        { key: 'user_input', type: 'string' },
        { key: 'conversation_messages', type: 'array' },
        { key: 'result', type: 'string' },
        { key: 'route', type: 'string' },
      ],
    },
  },
  {
    id: '2',
    data: {
      label: 'Agent',
      nodeType: 'agent',
      agentPrompt: 'You are helpful.',
      outputStateKey: 'conversation_messages',
      outputWriteMode: 'append',
      structuredOutputEnabled: true,
      structuredOutputStrategy: 'tool',
      structuredOutputStateKey: 'structured_response',
      structuredOutputSchemaText: JSON.stringify({
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      }),
    },
  },
  {
    id: '3',
    data: {
      label: 'Prompt',
      nodeType: 'prompt',
      prompt: 'Speak politely.',
    },
  },
  {
    id: '4',
    data: {
      label: 'Retriever',
      nodeType: 'tool',
      toolKind: 'retriever',
      retriever: { vectorStoreId: 'vs_123' },
    },
  },
  {
    id: '5',
    data: {
      label: 'Condition',
      nodeType: 'condition',
      conditionKind: 'bool_check',
      branches: 'true\nfalse',
    },
  },
  {
    id: '6',
    data: {
      label: 'Output',
      nodeType: 'output',
    },
  },
];

const edges = [
  { source: '1', target: '2' },
  { source: '3', target: '2' },
  { source: '4', target: '2' },
  { source: '2', target: '5' },
  { source: '5', target: '6' },
];

const getLinkedNodes = (targetId, type) =>
  edges
    .filter((edge) => edge.target === targetId)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter((node) => node?.data?.nodeType === type);

const getConfiguredStartStateKeys = () => nodes[0].data.startStateKeys;
const getStartStateKeysForCode = () => ['user_input', 'conversation_messages', 'result', 'route'];
const getLinkedRetrieverStoreIds = (nodeId) =>
  getLinkedNodes(nodeId, 'tool')
    .filter((node) => node.data?.toolKind === 'retriever')
    .map((node) => node.data?.retriever?.vectorStoreId || '')
    .filter(Boolean);
const getLinkedLlmNodes = () => [];
const getLinkedPromptNodes = (nodeId) => getLinkedNodes(nodeId, 'prompt');
const getLinkedToolNodes = (nodeId) => getLinkedNodes(nodeId, 'tool');
const getStartStateDefaultLiteral = (key, language) => {
  if (key === 'conversation_messages') {
    return language === 'python' ? '[]' : '[]';
  }
  return language === 'python' ? "''" : "''";
};
const getStateDatatype = (key) => {
  if (key === 'conversation_messages') return 'array';
  return 'string';
};

const helpers = {
  parseStructuredOutputSchemaText: (text) => JSON.parse(text),
  parseBranches: (value) =>
    String(value || '')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
  toPythonLiteral: (value) => {
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (Array.isArray(value)) return `[${value.map((item) => helpers.toPythonLiteral(item)).join(', ')}]`;
    if (typeof value === 'object') {
      return `{${Object.entries(value)
        .map(([key, item]) => `${JSON.stringify(key)}: ${helpers.toPythonLiteral(item)}`)
        .join(', ')}}`;
    }
    return String(value);
  },
  getPythonAnnotationByType: (type) => (type === 'array' ? 'list' : 'str'),
  getJsDocTypeByType: (type) => (type === 'array' ? 'Array<any>' : 'string'),
};

test('JS generator includes structured output and LangGraph edges', () => {
  const code = generateLangGraphJsCode({
    nodes,
    edges,
    startAgentId: '1',
    getStartStateKeysForCode,
    getConfiguredStartStateKeys,
    getLinkedRetrieverStoreIds,
    getLinkedLlmNodes,
    getLinkedPromptNodes,
    getLinkedToolNodes,
    getStartStateDefaultLiteral,
    getStateDatatype,
    helpers,
  });

  assert.match(code, /const GraphState = Annotation\.Root/);
  assert.match(code, /toolStrategy\(\{ name: "structured_output", schema: structuredOutputSchema \}\)/);
  assert.match(code, /outputStateKey === 'conversation_messages'/);
  assert.match(code, /graph\.addEdge\(START, "start_1"\);/);
  assert.match(code, /graph\.addConditionalEdges\("condition_5"/);
});

test('Python generator includes official OpenAI retriever helper and START edge', () => {
  const code = generateLangGraphPythonCode({
    nodes,
    edges,
    startAgentId: '1',
    getStartStateKeysForCode,
    getConfiguredStartStateKeys,
    getLinkedRetrieverStoreIds,
    getLinkedLlmNodes,
    getLinkedPromptNodes,
    getLinkedToolNodes,
    getStartStateDefaultLiteral,
    getStateDatatype,
    helpers,
  });

  assert.match(code, /from openai import OpenAI/);
  assert.match(code, /def search_openai_vector_store\(client: OpenAI, vector_store_id: str, query: str/);
  assert.match(code, /make_retriever_tool\(openai_client, store_id, index \+ 1\)/);
  assert.match(code, /response_format = ToolStrategy\(schema=structured_output_schema\)/);
  assert.match(code, /graph\.add_edge\(START, "start_1"\)/);
});

test('Generators preserve prompt and retriever wiring', () => {
  const jsCode = generateLangGraphJsCode({
    nodes,
    edges,
    startAgentId: '1',
    getStartStateKeysForCode,
    getConfiguredStartStateKeys,
    getLinkedRetrieverStoreIds,
    getLinkedLlmNodes,
    getLinkedPromptNodes,
    getLinkedToolNodes,
    getStartStateDefaultLiteral,
    getStateDatatype,
    helpers,
  });
  const pyCode = generateLangGraphPythonCode({
    nodes,
    edges,
    startAgentId: '1',
    getStartStateKeysForCode,
    getConfiguredStartStateKeys,
    getLinkedRetrieverStoreIds,
    getLinkedLlmNodes,
    getLinkedPromptNodes,
    getLinkedToolNodes,
    getStartStateDefaultLiteral,
    getStateDatatype,
    helpers,
  });

  assert.match(jsCode, /const linkedPrompts = \["Speak politely\."\];/);
  assert.match(jsCode, /const retrieverStoreIds = \["vs_123"\];/);
  assert.match(pyCode, /linked_prompts = \["Speak politely\."\]/);
  assert.match(pyCode, /retriever_store_ids = \["vs_123"\]/);
});
