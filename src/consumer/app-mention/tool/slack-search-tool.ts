import { DynamicStructuredTool } from '@langchain/core/tools';
import dedent from 'dedent';
import { SlackAPIError } from 'slack-edge';
import { z } from 'zod';

import { createSlackSearchPlanChain } from '../chain/slack-search-plan-chain';
import { createSlackSearchSelectChain } from '../chain/slack-search-select-chain';
import { getThreadMessages } from '../helper/get-thread-messages';
import { hasRestrictedAudience } from '../helper/has-restricted-audience';
import { neutralizeMentions } from '../helper/neutralize-mentions';
import { searchSlackMessages } from '../helper/search-slack-messages';

import type { ThreadMessage } from '../helper/get-thread-messages';
import type { SlackSearchMessage } from '../helper/search-slack-messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ToolParams } from '@langchain/core/tools';
import type { SlackAPIClient } from 'slack-edge';

// assistant.search.contextはユーザー単位で毎分10回程度に制限されているため、1回の質問で使う回数を絞る
const MAX_SEARCH_CALLS = 6;
const MAX_INITIAL_QUERIES = 4;
const MAX_FOLLOW_UP_QUERIES = 2;
const MAX_CANDIDATES = 40;
const MAX_RESULTS = 10;
const MAX_EXPANDED_THREADS = 3;
const RRF_K = 60;

const formatDate = (ts: string): string => {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(Number(ts) * 1000));
};

const toUnixTime = (date: string | null): number | undefined => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return undefined;
  }

  const time = Date.parse(`${date}T00:00:00+09:00`);
  return Number.isNaN(time) ? undefined : time / 1000;
};

const truncate = (text: string, length: number): string => {
  return text.length <= length ? text : `${text.slice(0, length)}…`;
};

const getRecencyWeight = (ts: string): number => {
  const ageInYears = (Date.now() / 1000 - Number(ts)) / (365 * 24 * 60 * 60);
  return Math.max(0.75, 1 / (1 + 0.5 * Math.max(0, ageInYears)));
};

// 複数クエリの検索結果をReciprocal Rank Fusionで統合し、古いメッセージほど少しだけ順位を下げる
const fuseRankings = (rankings: SlackSearchMessage[][]): SlackSearchMessage[] => {
  const scores = new Map<string, { message: SlackSearchMessage; score: number }>();

  for (const ranking of rankings) {
    for (const [index, message] of ranking.entries()) {
      const entry = scores.get(message.permalink) ?? { message, score: 0 };
      entry.score += 1 / (RRF_K + index + 1);
      scores.set(message.permalink, entry);
    }
  }

  return [...scores.values()]
    .map(({ message, score }) => ({ message, score: score * getRecencyWeight(message.messageTs) }))
    .toSorted((a, b) => b.score - a.score)
    .map(({ message }) => message);
};

const formatCandidates = (candidates: SlackSearchMessage[]): string => {
  if (candidates.length === 0) {
    return '(No results)';
  }

  return candidates.map((candidate, index) => [
    `[${index + 1}] #${candidate.channelName} / ${candidate.authorName} / ${formatDate(candidate.messageTs)}`,
    truncate(neutralizeMentions(candidate.content), 300),
  ].join('\n')).join('\n\n');
};

const formatResult = (
  result: SlackSearchMessage,
  index: number,
  threadMessages: ThreadMessage[] | undefined,
): string => {
  const lines = [
    `## ${index + 1}. #${result.channelName} / ${result.authorName} / ${formatDate(result.messageTs)}`,
    `Permalink: ${result.permalink}`,
    truncate(neutralizeMentions(result.content), 1000),
  ];

  if (threadMessages && 1 < threadMessages.length) {
    lines.push('', 'Thread:', ...threadMessages.slice(0, 30).map((message) => {
      return `- [UserId: ${message.userId}] ${truncate(neutralizeMentions(message.text), 300)}`;
    }));
  } else if (0 < result.contextMessages.length) {
    lines.push('', 'Surrounding messages:', ...result.contextMessages.map((text) => {
      return `- ${truncate(neutralizeMentions(text), 300)}`;
    }));
  }

  return lines.join('\n');
};

export interface SlackSearchToolParameters extends ToolParams {
  summaryModel: BaseChatModel;
  slackClient: SlackAPIClient;
  actionToken: string;
  channel: string;
  threadTs: string;
}

export const createSlackSearchTool = ({
  summaryModel,
  slackClient,
  actionToken,
  channel,
  threadTs,
  ...parameters
}: SlackSearchToolParameters) => {
  // ツールが複数回呼ばれても、1回の質問全体で検索回数の上限を超えないようにする
  let remainingSearchCalls = MAX_SEARCH_CALLS;
  let restrictedAudience: Promise<boolean> | undefined;

  return new DynamicStructuredTool({
    ...parameters,
    name: 'slack-search',
    description: dedent`
      Useful for finding past conversations in public Slack channels, such as past discussions, decisions, internal terms, or unfamiliar words.
      The tool generates keyword queries by itself, so describe what you want to find in natural language.
    `,
    schema: z.object({
      request: z.string().describe('What you want to find in past Slack conversations, described in natural language.'),
    }),
    func: async ({ request }, runManager) => {
      restrictedAudience ??= hasRestrictedAudience(slackClient, channel);
      if (await restrictedAudience) {
        return 'Slack search is not available in this channel because it includes guests or members of external organizations.';
      }

      if (remainingSearchCalls <= 0) {
        return 'The search limit for this question has been reached. Answer with the information already found.';
      }

      const planChain = createSlackSearchPlanChain(summaryModel);
      const selectChain = createSlackSearchSelectChain(summaryModel);

      const plan = await planChain.invoke({
        today: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()),
        request: request,
      }, runManager?.getChild('plan'));

      const after = toUnixTime(plan.after);
      const before = toUnixTime(plan.before);
      const triedQueries: string[] = [];
      const rankings: SlackSearchMessage[][] = [];
      const errors: unknown[] = [];

      const search = async (queries: string[]) => {
        const targets = [...new Set(queries.map((query) => query.trim()))]
          .filter((query) => query && !triedQueries.includes(query))
          .slice(0, remainingSearchCalls);

        remainingSearchCalls -= targets.length;
        triedQueries.push(...targets);

        const results = await Promise.allSettled(targets.map(async (query) => {
          return await searchSlackMessages(slackClient, {
            query: query,
            actionToken: actionToken,
            contextChannelId: channel,
            after: after,
            before: before,
          });
        }));

        for (const result of results) {
          if (result.status === 'rejected') {
            errors.push(result.reason);
            continue;
          }

          // 今回のスレッド自体は既に会話履歴として渡しているため除外する
          rankings.push(result.value.filter((message) => {
            return !(message.channelId === channel && (message.threadTs ?? message.messageTs) === threadTs);
          }));
        }
      };

      const select = async () => {
        const candidates = fuseRankings(rankings).slice(0, MAX_CANDIDATES);
        const selection = await selectChain.invoke({
          queries: triedQueries.map((query) => `- ${query}`).join('\n'),
          results: formatCandidates(candidates),
          request: request,
        }, runManager?.getChild('select'));

        return { candidates, selection };
      };

      await search(plan.queries.slice(0, MAX_INITIAL_QUERIES));

      if (rankings.length === 0 && 0 < errors.length) {
        const invalidActionToken = errors.some((error) => {
          return error instanceof SlackAPIError && error.error === 'invalid_action_token';
        });
        if (invalidActionToken) {
          return 'Slack search is unavailable because the action token has expired. Ask the user to mention you again.';
        }
        throw errors[0];
      }

      let { candidates, selection } = await select();

      if (!selection.sufficient && 0 < selection.nextQueries.length && 0 < remainingSearchCalls) {
        await search(selection.nextQueries.slice(0, MAX_FOLLOW_UP_QUERIES));
        ({ candidates, selection } = await select());
      }

      const results = [...new Set(selection.relevantNumbers)]
        .map((number) => candidates[number - 1])
        .filter((candidate) => candidate !== undefined)
        .slice(0, MAX_RESULTS);

      if (results.length === 0) {
        return 'No relevant messages were found in Slack.';
      }

      const threads = await Promise.all(results.slice(0, MAX_EXPANDED_THREADS).map(async (result) => {
        try {
          return await getThreadMessages(slackClient, result.channelId, result.threadTs ?? result.messageTs);
        } catch {
          // ボットが参加していないチャンネルなどでスレッドを取得できない場合は前後のメッセージだけを使う
          return undefined;
        }
      }));

      return [
        `Found ${results.length} relevant messages in Slack. Include their permalinks when you use them in your answer.`,
        ...results.map((result, index) => formatResult(result, index, threads[index])),
      ].join('\n\n');
    },
  });
};
