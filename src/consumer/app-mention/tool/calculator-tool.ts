import { DynamicStructuredTool } from '@langchain/core/tools';
import Mexp from 'math-expression-evaluator';
import { z } from 'zod';

import type { ToolParams } from '@langchain/core/tools';

const parser = new Mexp();

export type CreateCalculatorToolParameters = ToolParams;

export const createCalculatorTool = (parameters: CreateCalculatorToolParameters = {}) => new DynamicStructuredTool({
  ...parameters,
  name: 'calculator',
  description: 'Useful for getting the result of a math expression. The input to this tool should be a valid mathematical expression that could be executed by a simple calculator.',
  schema: z.object({
    expression: z.string().describe('The mathematical expression to evaluate.'),
  }),
  func: ({ expression }) => {
    try {
      return Promise.resolve(parser.eval(expression).toString());
    } catch {
      return Promise.resolve('I don\'t know how to do that.');
    }
  },
});
