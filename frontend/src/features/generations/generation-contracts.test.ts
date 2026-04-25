import {
  GENERATION_TEMPLATES,
  GENERATION_SIZE_OPTIONS,
  type GenerationCreditsTable,
  estimateGenerationCredits,
  formatGenerationOutputSpec,
} from './generation-config.ts';
import type {
  GenerationCreateRequest,
  GenerationCreateResponse,
  GenerationTaskStatusResponse,
  GeneratedImageDetailResponse,
  GeneratedImageHistoryResponse,
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

const _creditsTable: GenerationCreditsTable = {
  medium: {
    '1024x1536': 8,
  },
};
const _templateKeys = GENERATION_TEMPLATES.map((template) => template.key);
const _sizeLabels = GENERATION_SIZE_OPTIONS.map((option) => option.label);
const _mediumPortraitCredits = estimateGenerationCredits(_creditsTable, 'medium', '1024x1536');
const _mediumPortraitOutput = formatGenerationOutputSpec('medium', '1024x1536');
const _highPortraitOutput = formatGenerationOutputSpec('high', '1024x1536');

void [
  _request,
  _response,
  _task,
  _history,
  _templateKeys,
  _sizeLabels,
  _mediumPortraitCredits,
  _mediumPortraitOutput,
  _highPortraitOutput,
];
