import { buildFlowGraphContext, buildNodeFunctionNameMap } from './shared.js';

export const generateLangGraphPythonCode = ({
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
    toPythonLiteral,
    getPythonAnnotationByType,
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
        `def ${functionName}(state: State):`,
        `    base_system_prompt = ${toPythonLiteral(node.data?.agentPrompt || '')}`,
        `    linked_prompts = ${toPythonLiteral(linkedPromptTexts)}`,
        "    system_prompt = '\\n\\n'.join([item for item in [base_system_prompt, *linked_prompts] if item])",
        `    llm_models = ${toPythonLiteral(linkedLlmModels)}`,
        `    linked_tools = ${toPythonLiteral(linkedTools)}`,
        `    retriever_store_ids = ${toPythonLiteral(linkedRetrieverStores)}`,
        `    output_state_key = ${toPythonLiteral(outputStateKey)}`,
        `    output_write_mode = ${toPythonLiteral(outputWriteMode)}`,
        `    structured_output_enabled = ${structuredOutputEnabled ? 'True' : 'False'}`,
        `    structured_output_strategy = ${toPythonLiteral(structuredOutputStrategy)}`,
        `    structured_output_state_key = ${toPythonLiteral(structuredOutputStateKey)}`,
        `    structured_output_schema = ${toPythonLiteral(structuredOutputSchema)}`,
        "    model_api_key = state.get('apiKey') or state.get('system_api_key', '')",
        "    if not model_api_key:",
        "        raise ValueError('Missing API key. Configure an LLM or System node before running the graph.')",
        "    model = llm_models[0] if llm_models else state.get('default_model', 'gpt-4.1-mini')",
        '    openai_client = OpenAI(api_key=model_api_key)',
        '    llm = ChatOpenAI(model=model, api_key=model_api_key, temperature=0)',
        '    tools = [',
        '        make_retriever_tool(openai_client, store_id, index + 1)',
        '        for index, store_id in enumerate(retriever_store_ids)',
        '    ]',
        '    tools.extend(',
        '        make_placeholder_tool(tool_name, index + 1)',
        '        for index, tool_name in enumerate(linked_tools)',
        '    )',
        "    response_format = None",
        "    if structured_output_enabled and structured_output_schema:",
        "        if structured_output_strategy == 'tool':",
        "            response_format = ToolStrategy(schema=structured_output_schema)",
        '        else:',
        "            response_format = ProviderStrategy(schema=structured_output_schema)",
        "    input_messages = state.get('conversation_messages') if isinstance(state.get('conversation_messages'), list) and state.get('conversation_messages') else [{'role': 'user', 'content': state.get('user_input', '')}]",
        '    agent = create_agent(',
        '        model=llm,',
        '        tools=tools,',
        '        system_prompt=system_prompt,',
        '        response_format=response_format,',
        '    )',
        "    result = agent.invoke({'messages': input_messages})",
        "    result_messages = result.get('messages', []) if isinstance(result, dict) else []",
        '    next_messages = [',
        '        {',
        "            'role': 'assistant' if getattr(message, 'type', '') == 'ai' else 'system' if getattr(message, 'type', '') == 'system' else 'user',",
        "            'content': get_message_text(message),",
        '        }',
        '        for message in result_messages',
        '        if get_message_text(message)',
        '    ]',
        "    text = get_message_text(result_messages[-1]) if result_messages else get_text_from_state_value(result.get('structured_response')) if isinstance(result, dict) else ''",
        "    structured_response = result.get('structured_response') if isinstance(result, dict) else None",
        "    previous_value = state.get(output_state_key)",
        "    if output_state_key == 'conversation_messages':",
        "        assistant_message = {'role': 'assistant', 'content': text}",
        "        if output_write_mode == 'replace':",
        '            next_value = [assistant_message]',
        '        else:',
        '            next_value = next_messages or [assistant_message]',
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
        "    next_state = {**state, 'last_agent': " +
          toPythonLiteral(node.data?.label || 'Agent') +
          ", output_state_key: next_value, 'result': text, 'systemPrompt': system_prompt, 'conversation_messages': next_messages}",
        "    if structured_output_enabled and structured_response is not None:",
        "        next_state[structured_output_state_key] = structured_response",
        '    return next_state',
        '',
      ].join('\n');
    }

    if (node.data?.nodeType === 'llm') {
      const linkedRetrieverStores = getLinkedRetrieverStoreIds(node.id);
      return [
        `def ${functionName}(state: State):`,
        `    retriever_store_ids = ${toPythonLiteral(linkedRetrieverStores)}`,
        "    model_api_key = state.get('apiKey') or state.get('system_api_key', '')",
        "    if not model_api_key:",
        "        raise ValueError('Missing API key. Configure an LLM or System node before running the graph.')",
        `    model = ${toPythonLiteral(node.data?.model || 'gpt-4.1-mini')}`,
        '    llm = ChatOpenAI(model=model, api_key=model_api_key, temperature=0)',
        "    response = llm.invoke(to_langchain_messages(state.get('conversation_messages'), state.get('systemPrompt', ''), state.get('user_input', '')))",
        "    completion = get_message_text(response)",
        "    return {**state, 'last_llm': model, 'result': completion, 'retriever_store_id': retriever_store_ids[0] if retriever_store_ids else state.get('retriever_store_id', '')}",
        '',
      ].join('\n');
    }

    if (node.data?.nodeType === 'tool') {
      if (node.data?.toolKind === 'retriever') {
        return [
          `def ${functionName}(state: State):`,
          `    vector_store_id = ${toPythonLiteral(node.data?.retriever?.vectorStoreId || '')}`,
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
      const startReturnExpr = startInitPairs.length ? `{**state, ${startInitPairs.join(', ')}}` : '{**state}';
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
        `    return {**state, 'route': state.get('route', ${toPythonLiteral(fallbackRoute)})}`,
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
  const pythonStateTypeLines = stateKeys.map(
    (key) => `    ${JSON.stringify(key)}: ${getPythonAnnotationByType(getStateDatatype(key))},`
  );
  const terminalEdgeLines = nodes
    .filter((node) => (outgoingBySource.get(node.id) || []).length === 0)
    .map((node) => idToFn[node.id])
    .filter(Boolean)
    .map((functionName) => `graph.add_edge(${toPythonLiteral(functionName)}, END)`)
    .join('\n');

  return [
    'from typing import TypedDict',
    'import re',
    'from openai import OpenAI',
    'from langchain.agents import create_agent',
    'from langchain.agents.structured_output import ProviderStrategy, ToolStrategy',
    'from langchain_core.messages import AIMessage, HumanMessage, SystemMessage',
    'from langchain_core.tools import tool',
    'from langchain_openai import ChatOpenAI',
    'from langgraph.graph import END, START, StateGraph',
    '',
    "State = TypedDict('State', {",
    ...pythonStateTypeLines,
    "    'system_api_key': str,",
    "    'has_system_api_key': bool,",
    '}, total=False)',
    '',
    'def to_langchain_messages(messages=None, system_prompt="", fallback_user_input=""):',
    '    normalized = messages if isinstance(messages, list) else []',
    '    mapped = []',
    '    for message in normalized:',
    "        role = message.get('role') if isinstance(message, dict) else 'user'",
    "        role = role if role in ('system', 'assistant', 'user') else 'user'",
    "        raw_content = message.get('content') if isinstance(message, dict) else ''",
    '        if isinstance(raw_content, list):',
    '            content = "\\n".join(',
    '                part.get("text", "") if isinstance(part, dict) else str(part)',
    '                for part in raw_content',
    '            ).strip()',
    '        else:',
    '            content = str(raw_content or "").strip()',
    '        if not content:',
    '            continue',
    "        if role == 'system':",
    '            mapped.append(SystemMessage(content=content))',
    "        elif role == 'assistant':",
    '            mapped.append(AIMessage(content=content))',
    '        else:',
    '            mapped.append(HumanMessage(content=content))',
    '    output = []',
    '    if system_prompt:',
    '        output.append(SystemMessage(content=system_prompt))',
    '    if mapped:',
    '        output.extend(mapped)',
    '    elif fallback_user_input:',
    '        output.append(HumanMessage(content=fallback_user_input))',
    '    return output',
    '',
    'def get_message_text(message):',
    "    content = getattr(message, 'content', '')",
    '    if isinstance(content, str):',
    '        return content.strip()',
    '    if isinstance(content, list):',
    '        parts = []',
    '        for part in content:',
    '            if isinstance(part, dict):',
    '                parts.append(str(part.get("text", "")).strip())',
    '            else:',
    '                parts.append(str(part).strip())',
    '        return "\\n".join([part for part in parts if part]).strip()',
    "    return str(content or '').strip()",
    '',
    'def get_text_from_state_value(value):',
    '    if value is None:',
    "        return ''",
    '    if isinstance(value, str):',
    '        return value.strip()',
    '    if isinstance(value, list):',
    '        for item in reversed(value):',
    '            text = get_text_from_state_value(item)',
    '            if text:',
    '                return text',
    "        return ''",
    '    if isinstance(value, dict):',
    '        for key in ("content", "answer", "text", "output_text"):',
    '            text = get_text_from_state_value(value.get(key))',
    '            if text:',
    '                return text',
    "        return ''",
    "    return str(value).strip()",
    '',
    'def search_openai_vector_store(client: OpenAI, vector_store_id: str, query: str, max_num_results: int = 4) -> list[str]:',
    '    if not vector_store_id or not query:',
    '        return []',
    '    response = client.responses.create(',
    '        model="gpt-4.1-mini",',
    '        input=query,',
    '        tools=[',
    '            {',
    '                "type": "file_search",',
    '                "vector_store_ids": [vector_store_id],',
    '                "max_num_results": max_num_results,',
    '            }',
    '        ],',
    '        include=["file_search_call.results"],',
    '    )',
    '    output = []',
    '    for item in getattr(response, "output", []) or []:',
    '        if getattr(item, "type", "") != "file_search_call":',
    '            continue',
    '        for result in getattr(item, "results", []) or []:',
    '            text = ""',
    '            content = getattr(result, "content", None)',
    '            if isinstance(content, str):',
    '                text = content.strip()',
    '            elif isinstance(content, list):',
    '                parts = []',
    '                for part in content:',
    '                    text_value = getattr(part, "text", None) if part is not None else None',
    '                    if text_value is None and isinstance(part, dict):',
    '                        text_value = part.get("text") or part.get("content")',
    '                    parts.append(str(text_value or "").strip())',
    '                text = "\\n".join([part for part in parts if part]).strip()',
    '            if text:',
    '                output.append(text)',
    '    return output',
    '',
    'def make_retriever_tool(client: OpenAI, vector_store_id: str, index: int):',
    '    @tool',
    '    def retrieve_context(query: str) -> str:',
    '        rows = search_openai_vector_store(client, vector_store_id, query)',
    '        return "\\n\\n".join(rows) if rows else "No relevant context found."',
    '    retrieve_context.name = f"retrieve_context_{index}"',
    '    retrieve_context.description = f"Retrieve relevant context from OpenAI vector store {vector_store_id}."',
    '    return retrieve_context',
    '',
    'def make_placeholder_tool(tool_name: str, index: int):',
    '    normalized_name = re.sub(r"[^a-z0-9]+", "_", str(tool_name or f"tool_{index}").lower()).strip("_") or f"tool_{index}"',
    '    @tool',
    '    def linked_tool(input: str) -> str:',
    '        return f"Tool {tool_name} is linked but has no concrete runtime implementation. Input: {input}"',
    '    linked_tool.name = normalized_name',
    '    linked_tool.description = str(tool_name or "Tool")',
    '    return linked_tool',
    '',
    ...functionBlocks,
    'graph = StateGraph(State)',
    ...Object.values(idToFn).map((functionName) => `graph.add_node('${functionName}', ${functionName})`),
    edgeLines,
    conditionalEdgeLines,
    '',
    entryFn ? `graph.add_edge(START, ${toPythonLiteral(entryFn)})` : '',
    terminalEdgeLines,
    '',
    'app = graph.compile()',
  ]
    .filter(Boolean)
    .join('\n');
};
