import { toIdentifier } from './utils.js';

export const buildFlowGraphContext = ({
  nodes,
  edges,
  startAgentId,
  stateKeys,
  configuredStartKeys,
}) => {
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
    nodes[0] ||
    null;
  const entryNode = startNode || nodes.find((node) => !connectedTargets.has(node.id)) || null;
  const entryId = entryNode?.id || '';

  return {
    nodeMap,
    edgePairs,
    connectedTargets,
    outgoingBySource,
    startInputNode,
    startNode,
    entryNode,
    entryId,
    stateKeys,
    configuredStartKeys,
  };
};

export const buildNodeFunctionNameMap = (nodes) => {
  const idToFn = {};
  nodes.forEach((node, index) => {
    const safeName = toIdentifier(node.data?.label, `node_${index + 1}`);
    idToFn[node.id] = `${safeName}_${node.id}`;
  });
  return idToFn;
};
