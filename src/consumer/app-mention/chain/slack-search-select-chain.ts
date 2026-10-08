import { ChatPromptTemplate } from '@langchain/core/prompts';
import dedent from 'dedent';
import { z } from 'zod';

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

const prompt = ChatPromptTemplate.fromMessages([
  ['system', dedent`
    You are evaluating the results of Slack's keyword search for the user's request.
    Slack's keyword search only returns messages that contain ALL words in a query, and does NOT support synonyms.

    Queries already tried:
    {queries}

    Search results:
    {results}

    Constraints:
      - Select the results that are relevant to the request, ordered from most to least relevant, and return their numbers. Select at most 10.
      - Decide whether the selected results are sufficient to answer the request.
      - If they are not sufficient, propose up to 2 new queries that differ from the queries already tried. Each query must consist of 1 to 3 words. Use fewer words, synonyms, or spelling variants (katakana, English, kanji, abbreviations).
      - If they are sufficient, return an empty list for new queries.
  `],
  ['human', '{request}'],
]);

const SlackSearchSelectionSchema = z.object({
  relevantNumbers: z.array(z.number().int()).describe('Numbers of the relevant results, ordered from most to least relevant.'),
  sufficient: z.boolean().describe('Whether the relevant results are sufficient to answer the request.'),
  nextQueries: z.array(z.string()).describe('New keyword queries to search next.'),
});

export type SlackSearchSelection = z.infer<typeof SlackSearchSelectionSchema>;

export const createSlackSearchSelectChain = (model: BaseChatModel) => {
  return prompt.pipe(model.withStructuredOutput(SlackSearchSelectionSchema, {
    name: 'slack_search_selection',
  }));
};
