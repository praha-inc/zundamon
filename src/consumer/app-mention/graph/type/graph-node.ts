import type { GraphChannels } from './graph-channels';
import type { RunnableFunc, RunnableInterface } from '@langchain/core/runnables';

export type GraphNode = {
  name: string;
  action:
    | RunnableFunc<GraphChannels, Partial<GraphChannels>>
    | RunnableInterface<GraphChannels, Partial<GraphChannels>>;
};
