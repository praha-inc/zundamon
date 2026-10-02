import { ToolNode } from '@langchain/langgraph/prebuilt';

import type { GraphNode } from '../type/graph-node';
import type { StructuredTool } from '@langchain/core/tools';

export type CreateToolNodeParameters = {
  tools: StructuredTool[];
};

export const createToolNode = ({
  tools,
}: CreateToolNodeParameters): GraphNode => {
  return {
    name: 'tool',
    action: new ToolNode(tools),
  };
};
