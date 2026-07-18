export type ReviewContinuationAction = 'retake' | 'generate';

export type ReviewContinuationContext = 'readonly' | 'standard' | 'linked' | 'comparison';

export interface ReviewContinuationState {
  viewerIsOwner: boolean;
  hasSourceReview: boolean;
  isComparison: boolean;
  retakeAvailable: boolean;
  generateAvailable: boolean;
}

export interface ReviewContinuationPlan {
  context: ReviewContinuationContext;
  actions: ReviewContinuationAction[];
  recommendation: ReviewContinuationAction | 'choice' | 'none';
}

/**
 * Selects the next-action surface from review capability state only.
 * Critique and suggestion text are deliberately not part of this contract.
 */
export function getReviewContinuationPlan(
  state: ReviewContinuationState
): ReviewContinuationPlan {
  if (!state.viewerIsOwner) {
    return { context: 'readonly', actions: [], recommendation: 'none' };
  }

  const context: ReviewContinuationContext = state.isComparison
    ? 'comparison'
    : state.hasSourceReview
      ? 'linked'
      : 'standard';
  const actions: ReviewContinuationAction[] = [];

  if (state.retakeAvailable) actions.push('retake');
  if (state.generateAvailable) actions.push('generate');

  return {
    context,
    actions,
    recommendation: actions.length > 1 ? 'choice' : actions[0] ?? 'none',
  };
}
