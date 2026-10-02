import { loadSummarizationChain } from '@langchain/classic/chains';
import { PromptTemplate } from '@langchain/core/prompts';
import dedent from 'dedent';

import type { BaseLanguageModel } from '@langchain/core/language_models/base';

const combinePrompt = new PromptTemplate({
  template: dedent`
    The following is set of summaries:

    {text}

    Based on this list of summaries, please combine them into finally document.
    Also, provide up to five links from within that you think may be of interest.
    If there are links, provide them as a list under the heading "Relevant Links:".

    Helpful Answer:
  `,
  inputVariables: ['text'],
});

const mapPrompt = new PromptTemplate({
  template: dedent`
    The following is a set of documents:

    {text}

    Based on this list of docs, please provide a summary.
    Also, provide up to five links from within that you think may be of interest.
    If there are links, provide them as a list under the heading "Relevant Links:".

    Helpful Answer:
  `,
  inputVariables: ['text'],
});

export const createMapReduceSummarizationChain = (model: BaseLanguageModel) => {
  return loadSummarizationChain(model, {
    type: 'map_reduce',
    combinePrompt: combinePrompt,
    combineMapPrompt: mapPrompt,
  });
};
