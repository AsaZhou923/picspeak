import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERATION_TEMPLATES,
  GENERATION_SIZE_OPTIONS,
  type GenerationCreditsTable,
  estimateGenerationCredits,
  formatGenerationOutputSpec,
} from './generation-config.ts';
import type {
  ActivationCodeRedeemResponse,
  GenerationCreateRequest,
  GenerationCreateResponse,
  GenerationTaskStatusResponse,
  GenerationTemplatesResponse,
  GeneratedImageDetailResponse,
  GeneratedImageHistoryResponse,
  UsageResponse,
} from '@/lib/types';

const _request: GenerationCreateRequest = {
  generation_mode: 'general',
  intent: 'social_visual',
  prompt: 'cinematic rainy street portrait',
  template_key: 'social_visual',
  quality: 'medium',
  size: '1024x1536',
  output_format: 'webp',
  async: true,
};

const _response: GenerationCreateResponse = {
  task_id: 'igt_test',
  status: 'PENDING',
  estimated_seconds: 45,
  credits_reserved: 8,
};

const _task: GenerationTaskStatusResponse = {
  task_id: 'igt_test',
  status: 'SUCCEEDED',
  progress: 100,
  generation_id: 'gen_test',
  generation_mode: 'general',
  intent: 'social_visual',
  source_review_id: null,
  attempt_count: 1,
  max_attempts: 2,
  next_attempt_at: null,
  last_heartbeat_at: null,
  started_at: null,
  finished_at: null,
  error: null,
};

const _detail: GeneratedImageDetailResponse = {
  generation_id: 'gen_test',
  task_id: 'igt_test',
  image_url: 'https://object.example.com/generated/gen_test.webp',
  generation_mode: 'general',
  intent: 'social_visual',
  prompt: 'cinematic rainy street portrait',
  revised_prompt: null,
  model_name: 'gpt-image-2',
  model_snapshot: 'gpt-image-2-2026-04-21',
  quality: 'medium',
  size: '1024x1536',
  output_format: 'webp',
  credits_charged: 8,
  template_key: 'social_visual',
  source_photo_id: null,
  source_review_id: null,
  created_at: '2026-04-25T00:00:00Z',
  cost_usd: 0.041,
  input_text_tokens: 12,
  input_image_tokens: 0,
  output_image_tokens: 100,
  metadata: {},
};

const _history: GeneratedImageHistoryResponse = {
  items: [_detail],
  next_cursor: null,
};
const _usage: UsageResponse = {
  plan: 'free',
  quota: {
    daily_total: 5,
    daily_used: 2,
    daily_remaining: 3,
    monthly_total: 60,
    monthly_used: 12,
    monthly_remaining: 48,
    pro_monthly_total: 10,
    pro_monthly_used: 1,
    pro_monthly_remaining: 9,
  },
  generation_credits: {
    monthly_total: 3,
    monthly_used: 1,
    monthly_remaining: 2,
  },
  features: {
    review_modes: ['flash', 'pro'],
    history_retention_days: 30,
    priority_queue: false,
  },
  subscription: null,
  rate_limit: {
    limit_per_min: 60,
    remaining: 59,
    reset_at: '2026-04-25T00:01:00Z',
  },
};
const _activationCodeResponse: ActivationCodeRedeemResponse = {
  status: 'redeemed',
  plan: 'pro',
  provider: 'activation_code',
  message: 'Activation code redeemed successfully',
  activated_until: '2026-05-25T00:00:00Z',
};
const _templatesResponse: GenerationTemplatesResponse = {
  items: [],
  credits_table: {
    medium: {
      '1024x1536': 8,
    },
  },
};

const _creditsTable: GenerationCreditsTable = {
  medium: {
    '1024x1536': 8,
  },
};
test('generation create contract includes async task handoff fields', () => {
  assert.equal(_request.async, true);
  assert.equal(_response.status, 'PENDING');
  assert.equal(_response.task_id.startsWith('igt_'), true);
  assert.equal(_response.credits_reserved, 8);
});

test('generation task and detail contracts expose stable identifiers', () => {
  assert.equal(_task.status, 'SUCCEEDED');
  assert.equal(_task.generation_id, _detail.generation_id);
  assert.equal(_detail.task_id, _task.task_id);
  assert.equal(_history.items[0].generation_id, _detail.generation_id);
});

test('generation catalog and pricing helpers stay aligned', () => {
  const templateKeys = GENERATION_TEMPLATES.map((template) => template.key);
  const sizeLabels = GENERATION_SIZE_OPTIONS.map((option) => option.label);

  assert.equal(templateKeys.includes('social_visual'), true);
  assert.equal(sizeLabels.length > 0, true);
  assert.equal(estimateGenerationCredits(_creditsTable, 'medium', '1024x1536'), 8);
  assert.equal(formatGenerationOutputSpec('medium', '1024x1536'), '9:16 - 2K - 1152 x 2048');
  assert.equal(formatGenerationOutputSpec('high', '1024x1536'), '9:16 - 4K - 2160 x 3840');
  assert.deepEqual(_templatesResponse.credits_table, _creditsTable);
});

test('usage and activation-code contracts expose quota and Pro grant fields', () => {
  assert.equal(_usage.generation_credits.monthly_remaining, 2);
  assert.equal(_activationCodeResponse.status, 'redeemed');
  assert.equal(_activationCodeResponse.plan, 'pro');
  assert.match(_activationCodeResponse.activated_until, /^2026-05-25/);
});
