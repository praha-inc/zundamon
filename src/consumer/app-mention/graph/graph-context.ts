import { z } from 'zod';

// 1回の質問の間で変わらない値は、ステートではなくランタイムコンテキストとしてノードに渡す
export const GraphContextSchema = z.object({
  botUserId: z.string(),
});

export type GraphContext = z.infer<typeof GraphContextSchema>;
