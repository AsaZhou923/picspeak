import type { ReviewHistoryItem, ReviewScores } from './types';

export type GrowthTrend = 'up' | 'down' | 'flat';
export type GrowthDimensionKey = keyof ReviewScores;

export interface NextShootChecklistItem {
  title: string;
  detail: string;
  observation: string;
  reason: string;
}

export interface HistoryWeakDimension {
  key: GrowthDimensionKey;
  lowCount: number;
  average: number;
}

export interface HistoryGrowthSnapshot {
  recentItems: ReviewHistoryItem[];
  recentAverage: number | null;
  previousAverage: number | null;
  averageDelta: number | null;
  trend: GrowthTrend;
  weakDimensions: HistoryWeakDimension[];
}

const DIMENSION_KEYS: GrowthDimensionKey[] = ['composition', 'lighting', 'color', 'impact', 'technical'];

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return roundToOneDecimal(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function cleanSegment(value: string): string {
  return value
    .replace(/^\d+[.、。]\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/[。！？!?.;,，；、\s]+$/g, '')
    .trim();
}

function splitChecklistTitle(action: string): string {
  const normalized = cleanSegment(action);
  if (!normalized) return normalized;

  const delimiters = [' and ', ' then ', ' so ', ',', '，', '；', ';', '并', '同时', '然后', '再'];
  for (const delimiter of delimiters) {
    const index = normalized.indexOf(delimiter);
    if (index > 3) {
      return cleanSegment(normalized.slice(0, index));
    }
  }
  return normalized;
}

function extractLabeledSegment(point: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = point.match(new RegExp(`${escaped}\\s*[：:]\\s*([^\\n；;]+)`, 'i'));
    if (match?.[1]) {
      return cleanSegment(match[1]);
    }
  }
  return '';
}

function splitNumberedPoints(value: string): string[] {
  const numbered = value
    .split(/(?=\d+\.\s)/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (numbered.length && /^\d+\.\s/.test(numbered[0])) {
    return numbered;
  }
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildNextShootChecklist(value: string, limit = 3): NextShootChecklistItem[] {
  const points = splitNumberedPoints(value);
  return points
    .slice(0, limit)
    .map((point) => {
      const action = extractLabeledSegment(point, ['Action', '可执行动作', '可執行動作', '行动', '行動', '建议', '提案']);
      const reason = extractLabeledSegment(point, ['Reason', '原因', '理由']);
      const observation = extractLabeledSegment(point, ['Observation', '观察', '觀察', '観察']);
      const detail = action || cleanSegment(point);
      return {
        title: splitChecklistTitle(detail),
        detail,
        observation,
        reason,
      };
    })
    .filter((item) => item.title);
}

function compareByCreatedAtDesc(left: ReviewHistoryItem, right: ReviewHistoryItem): number {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

export function buildHistoryGrowthSnapshot(items: ReviewHistoryItem[], recentWindow = 3): HistoryGrowthSnapshot {
  const sortedItems = [...items].sort(compareByCreatedAtDesc);
  const recentItems = sortedItems.slice(0, recentWindow);
  const previousItems = sortedItems.slice(recentWindow, recentWindow * 2);
  const recentAverage = average(recentItems.map((item) => item.final_score));
  const previousAverage = average(previousItems.map((item) => item.final_score));
  const averageDelta =
    recentAverage !== null && previousAverage !== null
      ? roundToOneDecimal(recentAverage - previousAverage)
      : null;

  const trend: GrowthTrend =
    averageDelta === null
      ? 'flat'
      : averageDelta >= 0.3
        ? 'up'
        : averageDelta <= -0.3
          ? 'down'
          : 'flat';

  const weakDimensions = DIMENSION_KEYS
    .map((key) => ({
      key,
      lowCount: sortedItems.filter((item) => item.scores[key] < 7).length,
      average: average(sortedItems.map((item) => item.scores[key])) ?? 0,
    }))
    .filter((item) => item.lowCount > 0)
    .sort((left, right) => (
      right.lowCount - left.lowCount
      || left.average - right.average
      || DIMENSION_KEYS.indexOf(left.key) - DIMENSION_KEYS.indexOf(right.key)
    ))
    .slice(0, 3);

  return {
    recentItems,
    recentAverage,
    previousAverage,
    averageDelta,
    trend,
    weakDimensions,
  };
}
