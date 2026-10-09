export type GraphProgress
  = | { type: 'thinking' }
    | { type: 'tool-call'; name: string }
    | { type: 'answer'; delta: string };

export type GraphProgressListener = (progress: GraphProgress) => Promise<void>;
