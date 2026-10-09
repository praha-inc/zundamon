import { SystemMessage } from '@langchain/core/messages';
import { concat } from '@langchain/core/utils/stream';
import dedent from 'dedent';
import { z } from 'zod';

import type { GraphNode } from '../type/graph-node';
import type { GraphProgressListener } from '../type/graph-progress';
import type { BindToolsInput } from '@langchain/core/language_models/chat_models';
import type { AIMessageChunk } from '@langchain/core/messages';
import type { ChatOpenAI } from '@langchain/openai';

// Web検索はOpenAIのサーバー側で実行されてtool_callsに現れないため、ストリーミング中の進捗イベントから検知する
// @langchain/openaiは進捗イベントをresponse_metadata.tool_outputsに { type, status } の形で渡してくる
const WebSearchProgressSchema = z.object({
  type: z.literal('web_search_call'),
  status: z.string(),
});

// 「最近」や「先週」のような相対的な日付を解釈できるように、曜日も含めて今日の日付を伝える
const formatToday = (): string => {
  const now = new Date();
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'long' }).format(now);
  return `${date} (${weekday})`;
};

export type CreateAgentNodeParameters = {
  model: ChatOpenAI;
  tools: BindToolsInput[];
  onProgress: GraphProgressListener;
};

export const createAgentNode = ({
  model,
  tools,
  onProgress,
}: CreateAgentNodeParameters): GraphNode => {
  const modelWithTools = model.bindTools(tools, {
    include: ['code_interpreter_call.outputs'],
  });

  return {
    name: 'agent',
    action: async ({ messages }, config) => {
      if (!config.context) {
        throw new Error('No context was given to the graph');
      }

      await onProgress({ type: 'thinking' });

      const stream = await modelWithTools.stream([
        new SystemMessage(dedent`
          Constraints:
            - Please respond in Japanese.
            - Please use markdown format text decoration.
            - Today is ${formatToday()} in Asia/Tokyo. Interpret relative dates such as "最近", "今週", or "昨日" based on this date.
            - The chatbot's UserId is ${config.context.botUserId}.
            - Each user message begins with the sender's UserId in the form "[UserId: Uxxxxxxxx]".
        `),
        ...messages,
      ], config);

      let response: AIMessageChunk | undefined;
      for await (const chunk of stream) {
        const webSearch = WebSearchProgressSchema.safeParse(chunk.response_metadata['tool_outputs']);
        if (webSearch.success) {
          await onProgress(webSearch.data.status === 'completed'
            ? { type: 'thinking' }
            : { type: 'tool-call', name: 'web_search' });
        }
        response = response ? concat(response, chunk) : chunk;
      }

      if (!response) {
        throw new Error('No response from the model');
      }

      for (const toolCall of response.tool_calls ?? []) {
        await onProgress({ type: 'tool-call', name: toolCall.name });
      }

      return {
        messages: [
          response,
        ],
      };
    },
  };
};
