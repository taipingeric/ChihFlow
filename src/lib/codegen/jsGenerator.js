import { buildFlowGraphContext, buildNodeFunctionNameMap } from './shared.js';

export const generateLangGraphJsCode = ({
  nodes,
  edges,
  startAgentId,
  getStartStateKeysForCode,
  getConfiguredStartStateKeys,
  getLinkedRetrieverStoreIds,
  getLinkedLlmNodes,
  getLinkedPromptNodes,
  getLinkedToolNodes,
  getStartStateDefaultLiteral,
  getStateDatatype,
  helpers,
}) => {
  const {
    parseStructuredOutputSchemaText,
    parseBranches,
    getJsDocTypeByType,
  } = helpers;
  const graphContext = buildFlowGraphContext({
    nodes,
    edges,
    startAgentId,
    stateKeys: getStartStateKeysForCode(),
    configuredStartKeys: getConfiguredStartStateKeys(),
  });
  const { edgePairs, outgoingBySource, entryId, stateKeys, configuredStartKeys } = graphContext;
  const idToFn = buildNodeFunctionNameMap(nodes);

  const functionBlocks = nodes.map((node) => {
    const functionName = idToFn[node.id];

    if (node.data?.nodeType === 'prompt') {
      const promptText = node.data?.prompt?.trim() || node.data?.label || 'Prompt';
      return [
        `const ${functionName} = async () => ({`,
        `  prompt: ${JSON.stringify(promptText)},`,
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
      const linkedToolLabels = getLinkedToolNodes(node.id).map((toolNode) => toolNode.data?.label || 'Tool');
      const outputStateKey = String(node.data?.outputStateKey || 'result').trim() || 'result';
      const outputWriteMode = String(node.data?.outputWriteMode || 'append').trim() || 'append';
      const structuredOutputEnabled = Boolean(node.data?.structuredOutputEnabled);
      const structuredOutputStrategy = String(node.data?.structuredOutputStrategy || 'auto').trim() || 'auto';
      const structuredOutputStateKey =
        String(node.data?.structuredOutputStateKey || 'structured_response').trim() ||
        'structured_response';
      let structuredOutputSchema = null;
      try {
        structuredOutputSchema = structuredOutputEnabled
          ? parseStructuredOutputSchemaText(node.data?.structuredOutputSchemaText)
          : null;
      } catch (error) {
        structuredOutputSchema = null;
      }
      return [
        `const ${functionName} = async (state) => {`,
        `  const baseSystemPrompt = ${JSON.stringify(node.data?.agentPrompt || '')};`,
        `  const linkedPrompts = ${JSON.stringify(linkedPromptTexts)};`,
        '  const systemPrompt = [baseSystemPrompt, ...linkedPrompts].filter(Boolean).join("\\n\\n");',
        `  const llmModels = ${JSON.stringify(linkedLlmModels)};`,
        `  const linkedTools = ${JSON.stringify(linkedToolLabels)};`,
        `  const retrieverStoreIds = ${JSON.stringify(linkedRetrieverStores)};`,
        `  const outputStateKey = ${JSON.stringify(outputStateKey)};`,
        `  const outputWriteMode = ${JSON.stringify(outputWriteMode)};`,
        `  const structuredOutputEnabled = ${structuredOutputEnabled ? 'true' : 'false'};`,
        `  const structuredOutputStrategy = ${JSON.stringify(structuredOutputStrategy)};`,
        `  const structuredOutputStateKey = ${JSON.stringify(structuredOutputStateKey)};`,
        `  const structuredOutputSchema = ${JSON.stringify(structuredOutputSchema)};`,
        '  const modelApiKey = state.apiKey || state.system_api_key || "";',
        "  const model = llmModels[0] || state.defaultModel || 'gpt-4.1-mini';",
        '  const llm = new ChatOpenAI({ model, apiKey: modelApiKey, temperature: 0 });',
        '  const tools = [];',
        '  retrieverStoreIds.forEach((storeId, index) => {',
        '    tools.push(',
        '      tool(',
        '        async ({ query }) => `Retrieve relevant context from OpenAI vector store ${storeId}: ${query}`,',
        '        {',
        '          name: `retrieve_context_${index + 1}`,',
        '          description: `Retrieve relevant context from OpenAI vector store ${storeId}.`,',
        '          schema: {',
        "            type: 'object',",
        '            properties: { query: { type: "string" } },',
        '            required: ["query"],',
        '            additionalProperties: false,',
        '          },',
        '        }',
        '      )',
        '    );',
        '  });',
        '  linkedTools.forEach((toolName, index) => {',
        '    tools.push(',
        '      tool(',
        '        async ({ input }) => `Tool ${toolName} is linked but has no concrete runtime implementation. Input: ${input}`,',
        '        {',
        '          name: String(toolName || `tool_${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "_"),',
        '          description: String(toolName || "Tool"),',
        '          schema: {',
        "            type: 'object',",
        '            properties: { input: { type: "string" } },',
        '            required: ["input"],',
        '            additionalProperties: false,',
        '          },',
        '        }',
        '      )',
        '    );',
        '  });',
        '  const responseFormat = structuredOutputEnabled && structuredOutputSchema',
        '    ? (structuredOutputStrategy === "tool"',
        '        ? toolStrategy({ name: "structured_output", schema: structuredOutputSchema })',
        '        : providerStrategy({ name: "structured_output", schema: structuredOutputSchema }))',
        '    : undefined;',
        '  const agent = createAgent({',
        '    model: llm,',
        '    tools,',
        '    systemPrompt,',
        '    ...(responseFormat ? { responseFormat } : {}),',
        '  });',
        '  const agentResult = await agent.invoke({',
        '    messages: Array.isArray(state.conversation_messages) && state.conversation_messages.length',
        '      ? state.conversation_messages',
        '      : [{ role: "user", content: state.user_input || "" }],',
        '  });',
        '  const nextMessages = Array.isArray(agentResult?.messages)',
        '    ? agentResult.messages.map((message) => ({',
        '        role:',
        '          message?.getType?.() === "ai"',
        '            ? "assistant"',
        '            : message?.getType?.() === "system"',
        '              ? "system"',
        '              : "user",',
        '        content: getLangChainMessageText(message),',
        '      }))',
        '    : state.conversation_messages;',
        '  const completion =',
        '    getLangChainMessageText(agentResult?.messages?.[agentResult.messages.length - 1]) ||',
        '    getTextFromStateValue(agentResult?.structuredResponse) ||',
        '    "";',
        '  const structuredResponse = agentResult?.structuredResponse ?? null;',
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
        '  const nextState = {',
        '    ...state,',
        `    last_agent: ${JSON.stringify(node.data?.label || 'Agent')},`,
        '    [outputStateKey]: nextValue,',
        '    result: completion,',
        '    systemPrompt,',
        '    conversation_messages: nextMessages,',
        '  };',
        '  if (structuredOutputEnabled && structuredResponse !== null) {',
        '    nextState[structuredOutputStateKey] = structuredResponse;',
        '  }',
        '  return nextState;',
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
        '  const llm = new ChatOpenAI({ model, apiKey: state.apiKey || state.system_api_key || "", temperature: 0 });',
        '  const response = await llm.invoke(',
        '    toLangChainMessages(state.conversation_messages, state.systemPrompt || "", state.user_input || "")',
        '  );',
        '  const completion = getLangChainMessageText(response);',
        '  return { last_llm: model, result: completion, retriever_store_id: retrieverStoreIds[0] || state.retriever_store_id };',
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
        (item) => `'${item.key}': state['${item.key}'] ?? ${getStartStateDefaultLiteral(item.key, 'js')}`
      );
      const startReturnExpr = startInitProps.length ? `{ ${startInitProps.join(', ')} }` : '{}';
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
      return sourceFn && targetFn
        ? `graph.addEdge(${JSON.stringify(sourceFn)}, ${JSON.stringify(targetFn)});`
        : '';
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
  const terminalEdgeLines = nodes
    .filter((node) => (outgoingBySource.get(node.id) || []).length === 0)
    .map((node) => idToFn[node.id])
    .filter(Boolean)
    .map((functionName) => `graph.addEdge(${JSON.stringify(functionName)}, END);`)
    .join('\n');
  const jsStatePropertyLines = stateKeys.map(
    (key) => ` * @property {${getJsDocTypeByType(getStateDatatype(key))}} ${key}`
  );
  const stateAnnotationLines = stateKeys.map((key) => `  ${JSON.stringify(key)}: Annotation(),`);

  return [
    'import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";',
    'import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";',
    'import { ChatOpenAI } from "@langchain/openai";',
    'import { createAgent, providerStrategy, tool, toolStrategy } from "langchain";',
    '',
    '/**',
    ' * @typedef {Object} State',
    ...jsStatePropertyLines,
    ' * @property {string=} system_api_key',
    ' * @property {boolean=} has_system_api_key',
    ' */',
    '',
    'const toLangChainMessages = (messages = [], systemPrompt = "", fallbackUserInput = "") => {',
    '  const normalized = Array.isArray(messages) ? messages : [];',
    '  const mapped = normalized',
    '    .map((message) => {',
    '      const role = ["system", "assistant", "user"].includes(message?.role) ? message.role : "user";',
    '      const content = Array.isArray(message?.content)',
    '        ? message.content',
    '            .map((part) => (typeof part?.text === "string" ? part.text : typeof part === "string" ? part : ""))',
    '            .filter(Boolean)',
    '            .join("\\n")',
    '        : String(message?.content || "").trim();',
    '      if (!content) return null;',
    '      if (role === "system") return new SystemMessage(content);',
    '      if (role === "assistant") return new AIMessage(content);',
    '      return new HumanMessage(content);',
    '    })',
    '    .filter(Boolean);',
    '  const output = [];',
    '  if (systemPrompt) output.push(new SystemMessage(systemPrompt));',
    '  if (mapped.length > 0) output.push(...mapped);',
    '  else if (fallbackUserInput) output.push(new HumanMessage(fallbackUserInput));',
    '  return output;',
    '};',
    '',
    'const getLangChainMessageText = (message) => {',
    '  const content = message?.content;',
    '  if (typeof content === "string") return content.trim();',
    '  if (Array.isArray(content)) {',
    '    return content',
    '      .map((part) => (typeof part?.text === "string" ? part.text : typeof part === "string" ? part : ""))',
    '      .filter(Boolean)',
    '      .join("\\n")',
    '      .trim();',
    '  }',
    '  return "";',
    '};',
    '',
    'const getTextFromStateValue = (value) => {',
    '  if (typeof value === "string") return value.trim();',
    '  if (Array.isArray(value)) {',
    '    const lastItem = value[value.length - 1];',
    '    if (typeof lastItem === "string") return lastItem.trim();',
    '    if (lastItem && typeof lastItem === "object" && typeof lastItem.content === "string") return lastItem.content.trim();',
    '  }',
    '  if (value && typeof value === "object" && typeof value.content === "string") return value.content.trim();',
    '  return "";',
    '};',
    '',
    'const GraphState = Annotation.Root({',
    ...stateAnnotationLines,
    '  "system_api_key": Annotation(),',
    '});',
    '',
    ...functionBlocks,
    'const graph = new StateGraph(GraphState);',
    ...Object.values(idToFn).map((functionName) => `graph.addNode(${JSON.stringify(functionName)}, ${functionName});`),
    edgeLines,
    conditionalEdgeLines,
    entryFn ? `graph.addEdge(START, ${JSON.stringify(entryFn)});` : '',
    terminalEdgeLines,
    'const app = graph.compile();',
  ]
    .filter(Boolean)
    .join('\n');
};
