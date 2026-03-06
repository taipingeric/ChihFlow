import { buildFlowGraphContext, buildNodeFunctionNameMap } from '../codegen/shared.js';
import { toIdentifier } from '../codegen/utils.js';

export const searchOpenAIVectorStore = async ({
  apiKey,
  vectorStoreId,
  query,
  maxNumResults = 4,
  fetchImpl = fetch,
}) => {
  if (!apiKey || !vectorStoreId || !query) {
    return [];
  }

  const response = await fetchImpl(
    `https://api.openai.com/v1/vector_stores/${encodeURIComponent(vectorStoreId)}/search`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
        return row.content
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
      }
      return '';
    })
    .filter(Boolean);
};

export const buildCompiledLangGraphApp = async ({
  loadLangChainRuntime,
  nodes,
  edges,
  startAgentId,
  apiKey,
  defaultModel,
  systemApiKey,
  getStartStateKeysForCode,
  getConfiguredStartStateKeys,
  getLinkedRetrieverStoreIds,
  getLinkedLlmNodes,
  getLinkedPromptNodes,
  getLinkedToolNodes,
  parseStructuredOutputSchemaText,
  parseBranches,
  getDefaultStateValueByType,
  getTextFromStateValue,
  toLangChainMessages,
  getLangChainMessageText,
  searchOpenAIVectorStoreImpl = searchOpenAIVectorStore,
}) => {
  const {
    Annotation,
    END,
    START,
    StateGraph,
    ChatOpenAI,
    createAgent,
    providerStrategy,
    tool,
    toolStrategy,
    AIMessage,
    HumanMessage,
    SystemMessage,
  } = await loadLangChainRuntime();

  const graphContext = buildFlowGraphContext({
    nodes,
    edges,
    startAgentId,
    stateKeys: getStartStateKeysForCode(),
    configuredStartKeys: getConfiguredStartStateKeys(),
  });
  const { edgePairs, outgoingBySource, entryId, stateKeys, configuredStartKeys } = graphContext;

  const graphStateShape = Object.fromEntries(stateKeys.map((key) => [key, Annotation()]));
  graphStateShape.system_api_key = Annotation();
  const GraphState = Annotation.Root(graphStateShape);
  const graph = new StateGraph(GraphState);
  const idToFn = buildNodeFunctionNameMap(nodes);

  nodes.forEach((node) => {
    const functionName = idToFn[node.id];

    if (node.data?.nodeType === 'prompt') {
      const promptText = node.data?.prompt?.trim() || node.data?.label || 'Prompt';
      graph.addNode(functionName, async () => ({ prompt: promptText }));
      return;
    }

    if (node.data?.nodeType === 'agent') {
      graph.addNode(functionName, async (state) => {
        const linkedRetrieverStores = getLinkedRetrieverStoreIds(node.id);
        const linkedLlmModels = getLinkedLlmNodes(node.id).map(
          (llmNode) => llmNode.data?.model || 'gpt-4.1-mini'
        );
        const linkedPromptTexts = getLinkedPromptNodes(node.id)
          .map((promptNode) => promptNode.data?.prompt?.trim() || promptNode.data?.label || 'Prompt')
          .filter(Boolean);
        const linkedToolNodes = getLinkedToolNodes(node.id);
        const outputStateKey = String(node.data?.outputStateKey || 'result').trim() || 'result';
        const outputWriteMode = String(node.data?.outputWriteMode || 'append').trim() || 'append';
        const structuredOutputEnabled = Boolean(node.data?.structuredOutputEnabled);
        const structuredOutputStateKey =
          String(node.data?.structuredOutputStateKey || 'structured_response').trim() ||
          'structured_response';
        const modelName = linkedLlmModels[0] || state.defaultModel || defaultModel || 'gpt-4.1-mini';
        const modelApiKey = state.apiKey || state.system_api_key || apiKey || systemApiKey || '';
        if (!modelApiKey) {
          throw new Error('缺少 API Key。請在 LLM 或 System 節點設定後再執行。');
        }

        const tools = [];
        for (let toolIndex = 0; toolIndex < linkedRetrieverStores.length; toolIndex += 1) {
          const storeId = linkedRetrieverStores[toolIndex];
          tools.push(
            tool(
              async ({ query }) => {
                const rows = await searchOpenAIVectorStoreImpl({
                  apiKey: modelApiKey,
                  vectorStoreId: storeId,
                  query,
                });
                return rows.join('\n\n') || 'No relevant context found.';
              },
              {
                name: `retrieve_context_${toolIndex + 1}`,
                description: `Retrieve relevant context from OpenAI vector store ${storeId}.`,
                schema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'The search query.' },
                  },
                  required: ['query'],
                  additionalProperties: false,
                },
              }
            )
          );
        }

        linkedToolNodes
          .filter((toolNode) => toolNode.data?.toolKind !== 'retriever')
          .forEach((toolNode, toolIndex) => {
            const toolName = toolNode.data?.label || `tool_${toolIndex + 1}`;
            tools.push(
              tool(
                async ({ input }) =>
                  `Tool ${toolName} is linked but has no concrete runtime implementation. Input: ${input}`,
                {
                  name: toIdentifier(toolName, `tool_${toolIndex + 1}`),
                  description: String(toolName),
                  schema: {
                    type: 'object',
                    properties: {
                      input: { type: 'string', description: 'Tool input.' },
                    },
                    required: ['input'],
                    additionalProperties: false,
                  },
                }
              )
            );
          });

        const systemPrompt = [String(node.data?.agentPrompt || '').trim(), ...linkedPromptTexts]
          .filter(Boolean)
          .join('\n\n');
        const llm = new ChatOpenAI({
          model: modelName,
          apiKey: modelApiKey,
          temperature: 0,
        });

        let responseFormat;
        if (structuredOutputEnabled) {
          const schema = parseStructuredOutputSchemaText(node.data?.structuredOutputSchemaText);
          const jsonSchemaFormat = { name: 'structured_output', schema };
          const strategy = String(node.data?.structuredOutputStrategy || 'auto').trim() || 'auto';
          responseFormat =
            strategy === 'tool' ? toolStrategy(jsonSchemaFormat) : providerStrategy(jsonSchemaFormat);
        }

        const agent = createAgent({
          model: llm,
          tools,
          systemPrompt,
          ...(responseFormat ? { responseFormat } : {}),
        });
        const inputMessages =
          Array.isArray(state.conversation_messages) && state.conversation_messages.length
            ? state.conversation_messages
            : [{ role: 'user', content: state.user_input || '' }];
        const agentResult = await agent.invoke({ messages: inputMessages });
        const nextMessages = Array.isArray(agentResult?.messages)
          ? agentResult.messages.map((message) => ({
              role:
                message?.getType?.() === 'ai'
                  ? 'assistant'
                  : message?.getType?.() === 'system'
                    ? 'system'
                    : 'user',
              content: getLangChainMessageText(message),
            }))
          : state.conversation_messages;
        const completion =
          getLangChainMessageText(agentResult?.messages?.[agentResult.messages.length - 1]) ||
          getTextFromStateValue(agentResult?.structuredResponse) ||
          '';
        const previousValue = state?.[outputStateKey];
        const nextValue = (() => {
          if (outputStateKey === 'conversation_messages') {
            if (outputWriteMode === 'replace') {
              return [{ role: 'assistant', content: completion }];
            }
            return Array.isArray(nextMessages)
              ? nextMessages
              : [{ role: 'assistant', content: completion }];
          }
          if (outputWriteMode === 'replace') return completion;
          if (Array.isArray(previousValue)) return previousValue.concat(completion);
          if (typeof previousValue === 'string' && previousValue) return `${previousValue}\n${completion}`;
          if (previousValue == null || previousValue === '') return completion;
          return [previousValue, completion];
        })();
        const nextState = {
          last_agent: node.data?.label || 'Agent',
          [outputStateKey]: nextValue,
          result: completion,
          systemPrompt,
          conversation_messages: nextMessages,
        };
        if (structuredOutputEnabled && agentResult?.structuredResponse != null) {
          nextState[structuredOutputStateKey] = agentResult.structuredResponse;
        }
        return nextState;
      });
      return;
    }

    if (node.data?.nodeType === 'llm') {
      graph.addNode(functionName, async (state) => {
        const modelApiKey = state.apiKey || state.system_api_key || apiKey || systemApiKey || '';
        if (!modelApiKey) {
          throw new Error('缺少 API Key。請在 LLM 或 System 節點設定後再執行。');
        }
        const llm = new ChatOpenAI({
          model: node.data?.model || 'gpt-4.1-mini',
          apiKey: modelApiKey,
          temperature: 0,
        });
        const response = await llm.invoke(
          toLangChainMessages(
            state.conversation_messages,
            state.systemPrompt || '',
            state.user_input || '',
            {
              AIMessage,
              HumanMessage,
              SystemMessage,
            }
          )
        );
        return {
          last_llm: node.data?.model || 'gpt-4.1-mini',
          result: getLangChainMessageText(response),
        };
      });
      return;
    }

    if (node.data?.nodeType === 'tool') {
      if (node.data?.toolKind === 'retriever') {
        graph.addNode(functionName, async () => ({
          retriever_store_id: node.data?.retriever?.vectorStoreId || '',
        }));
      } else {
        graph.addNode(functionName, async () => ({}));
      }
      return;
    }

    if (node.data?.nodeType === 'system') {
      graph.addNode(functionName, async (state) => ({
        has_system_api_key: Boolean(state.system_api_key),
      }));
      return;
    }

    if (node.data?.nodeType === 'start') {
      graph.addNode(functionName, async (state) =>
        Object.fromEntries(
          configuredStartKeys.map((item) => [
            item.key,
            state[item.key] ?? getDefaultStateValueByType(item.type),
          ])
        )
      );
      return;
    }

    if (node.data?.nodeType === 'condition') {
      const branchLabels = parseBranches(node.data?.branches);
      const fallbackRoute = branchLabels[0] || 'default';
      graph.addNode(functionName, async (state) => ({
        route: state.route || fallbackRoute,
      }));
      return;
    }

    graph.addNode(functionName, async () => ({}));
  });

  const conditionNodeIds = new Set(
    nodes.filter((node) => node.data?.nodeType === 'condition').map((node) => node.id)
  );

  edgePairs
    .filter(([source]) => !conditionNodeIds.has(source))
    .forEach(([source, target]) => {
      const sourceFn = idToFn[source];
      const targetFn = idToFn[target];
      if (sourceFn && targetFn) {
        graph.addEdge(sourceFn, targetFn);
      }
    });

  nodes
    .filter((node) => node.data?.nodeType === 'condition')
    .forEach((conditionNode) => {
      const sourceFn = idToFn[conditionNode.id];
      const targetIds = outgoingBySource.get(conditionNode.id) || [];
      if (!sourceFn || targetIds.length === 0) {
        return;
      }
      const labels = parseBranches(conditionNode.data?.branches);
      const routeMap = Object.fromEntries(
        targetIds
          .map((targetId, index) => {
            const targetFn = idToFn[targetId];
            return targetFn ? [labels[index] || `branch_${index + 1}`, targetFn] : null;
          })
          .filter(Boolean)
      );
      graph.addConditionalEdges(
        sourceFn,
        (state) => state.route || labels[0] || 'branch_1',
        routeMap
      );
    });

  const entryFn = entryId && idToFn[entryId] ? idToFn[entryId] : Object.values(idToFn)[0];
  if (entryFn) {
    graph.addEdge(START, entryFn);
  }
  nodes.forEach((node) => {
    const fnName = idToFn[node.id];
    if (fnName && (outgoingBySource.get(node.id) || []).length === 0) {
      graph.addEdge(fnName, END);
    }
  });

  return graph.compile();
};
