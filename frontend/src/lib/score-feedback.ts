export type ScoreFeedbackVerdict = 'accurate' | 'too_high' | 'too_low';

export interface ScoreFeedback {
  feedback_id: string;
  verdict: ScoreFeedbackVerdict;
  state: 'active' | 'withdrawn';
  feedback_version: number;
}

export interface ScoreFeedbackResponse {
  review_id?: string | null;
  score_revision?: string | null;
  eligible: boolean;
  reason?: string | null;
  role?: 'author' | 'community' | null;
  my_feedback: ScoreFeedback | null;
}

export interface ScoreFeedbackPutRequest {
  expected_score_revision: string;
  expected_feedback_version: number | null;
  verdict: ScoreFeedbackVerdict;
  source_surface: 'result' | 'gallery';
}

// A changed/hidden review must not prevent withdrawing an existing personal record.
export async function withdrawScoreFeedback(
  feedback: ScoreFeedback,
  remove: (id: string, version: number) => Promise<unknown>,
  recover: (id: string) => Promise<ScoreFeedback>,
): Promise<void> {
  try {
    await remove(feedback.feedback_id, feedback.feedback_version);
  } catch (error) {
    const failure = error as { status?: number; code?: string };
    if (failure.status === 404) return;
    if (failure.status !== 409 || failure.code !== 'SCORE_FEEDBACK_VERSION_CONFLICT') throw error;
    let current: ScoreFeedback;
    try {
      current = await recover(feedback.feedback_id);
    } catch (recoveryError) {
      if ((recoveryError as { status?: number }).status === 404) return;
      throw recoveryError;
    }
    if (current.state === 'withdrawn') return;
    try {
      await remove(current.feedback_id, current.feedback_version);
    } catch (retryError) {
      if ((retryError as { status?: number }).status !== 404) throw retryError;
    }
  }
}
