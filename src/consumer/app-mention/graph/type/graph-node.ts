import type { GraphInput } from './graph-input';
import type { GraphContext } from '../graph-context';
import type { RunnableInterface } from '@langchain/core/runnables';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

export type GraphNode = {
  name: string;
  action:
    | ((input: GraphInput, config: LangGraphRunnableConfig<GraphContext>) => Promise<Partial<GraphInput>>)
    | RunnableInterface<GraphInput, Partial<GraphInput>>;
};
