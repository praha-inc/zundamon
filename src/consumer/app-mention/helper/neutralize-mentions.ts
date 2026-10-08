// 検索結果に含まれるメンションがそのまま回答に使われると通知が飛んでしまうため、ただの文字列に変換する
export const neutralizeMentions = (text: string): string => {
  return text.replaceAll(
    /<([@!])([^|>]+)(?:\|([^>]+))?>/g,
    (_, _prefix: string, id: string, label: string | undefined) => `@${label?.replace(/^@/, '') ?? id}`,
  );
};
