import { ChatPromptTemplate } from '@langchain/core/prompts';
import dedent from 'dedent';
import { z } from 'zod';

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

const prompt = ChatPromptTemplate.fromMessages([
  ['system', dedent`
    You are a query planner for Slack's keyword search.
    Slack's keyword search only returns messages that contain ALL words in a query.
    It supports stemming but does NOT support synonyms, so long queries tend to return nothing.

    Create search queries to find Slack messages that help with the user's request.

    Constraints:
      - Create 1 to 4 queries. Each query must consist of 1 to 3 words separated by spaces.
      - The first query must consist of the key terms of the request as they are written.
      - Add queries with single key terms so that messages containing only some of the terms are also found.
      - Add spelling variants commonly used in Japanese workplaces: katakana, English, and kanji (e.g. デプロイ, deploy, リリース), with and without long vowel marks (e.g. サーバー, サーバ), and abbreviations (e.g. MTG, 打ち合わせ).
      - Split long Japanese compound nouns into their parts (e.g. 障害対応手順 -> 障害 手順).
      - Keep names of people, projects, products, and technical terms.
      - Do not include meta words such as 議論, 話, 件, メッセージ, 教えて, discussed, or messages.
      - Do not include time expressions in queries. Instead, set "after" and "before" as dates in YYYY-MM-DD format when the request specifies a time range. Otherwise, set them to null.
      - Today is {today} in Asia/Tokyo.
      - Only when the request explicitly mentions a channel such as <#C0123456> or a user such as <@U0123456>, you may add "in:<#C0123456>" or "from:<@U0123456>" to queries.
  `],
  ['human', '{request}'],
]);

const SlackSearchPlanSchema = z.object({
  queries: z.array(z.string()).describe('Keyword queries for Slack search.'),
  after: z.string().nullable().describe('Search messages on or after this date (YYYY-MM-DD).'),
  before: z.string().nullable().describe('Search messages before this date (YYYY-MM-DD).'),
});

export type SlackSearchPlan = z.infer<typeof SlackSearchPlanSchema>;

export const createSlackSearchPlanChain = (model: BaseChatModel) => {
  return prompt.pipe(model.withStructuredOutput(SlackSearchPlanSchema, {
    name: 'slack_search_plan',
  }));
};
