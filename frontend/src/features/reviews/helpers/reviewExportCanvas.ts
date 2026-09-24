import type { ReviewExportCardCopy, ReviewExportCardModel } from './reviewExportPresentation';

export interface ReviewExportCanvasResult {
  blob: Blob;
  url: string;
}

export interface ReviewExportCanvasOptions {
  token?: string | null;
}

interface WrappedTextMetrics {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  height: number;
}

export interface ReviewExportCanvasLayout {
  textTop: number;
  supportTop: number;
  evidenceTop: number;
  textEnd: number;
  footerY: number;
  footerHeight: number;
  finalHeight: number;
  summaryMetrics: WrappedTextMetrics;
  supportMetrics: WrappedTextMetrics;
  evidenceMetrics: WrappedTextMetrics;
}

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 1500;
const CARD_MARGIN = 72;

function getTrustedApiOrigins(): Set<string> {
  const origins = new Set<string>();
  if (typeof window !== 'undefined') origins.add(window.location.origin);
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // ignore invalid build-time config here; API client owns the hard failure.
    }
  }
  return origins;
}

export function shouldAttachBearerForImageFetch(src: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(src, window.location.origin);
    return getTrustedApiOrigins().has(url.origin) && /\/api(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

async function fetchImageObjectUrl(src: string, token?: string | null): Promise<string> {
  const attachBearer = Boolean(token && shouldAttachBearerForImageFetch(src));
  const response = await fetch(src, {
    credentials: attachBearer ? 'include' : 'omit',
    headers: attachBearer ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error('IMAGE_LOAD_FAILED');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('IMAGE_LOAD_FAILED');
  return URL.createObjectURL(blob);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
    image.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  ctx.save();
  roundRect(ctx, x, y, width, height, radius);
  ctx.clip();
  ctx.fillStyle = '#191713';
  ctx.fillRect(x, y, width, height);
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
}

export function getWrappedLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number, maxLines: number): string[] | null {
  const chars = [...text];
  const lines: string[] = [];
  let line = '';
  const listPrefixRe = /^\s*\d+[.、]\s*$/u;
  for (const char of chars) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      const boundary = line.lastIndexOf(' ');
      const beforeBoundary = boundary > 0 ? line.slice(0, boundary + 1) : '';
      if (boundary > 0 && !listPrefixRe.test(beforeBoundary)) {
        lines.push(line.slice(0, boundary).trimEnd());
        line = line.slice(boundary + 1) + char;
      } else {
        lines.push(line);
        line = char;
      }
      if (lines.length >= maxLines) return null;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

function drawWrappedLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number) {
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

function getAllWrappedLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string[] {
  return getWrappedLines(ctx, text, maxWidth, Number.POSITIVE_INFINITY) ?? [];
}

function measureWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontWeight: number,
  fontSize: number,
  fontFamily: string
): WrappedTextMetrics {
  const normalized = text.trim();
  const lineHeight = Math.round(fontSize * 1.36);
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const lines = normalized ? getAllWrappedLines(ctx, normalized, maxWidth) : [];
  return {
    lines,
    fontSize,
    lineHeight,
    height: lines.length ? (lines.length - 1) * lineHeight + fontSize : 0,
  };
}

export function shouldDrawEvidenceBadge(model: Pick<ReviewExportCardModel, 'evidenceState' | 'evidenceLines' | 'target'>): boolean {
  return model.evidenceState !== 'unassessed' || model.evidenceLines.length > 0 || Boolean(model.target);
}

function drawFooter(ctx: CanvasRenderingContext2D, model: ReviewExportCardModel, copy: ReviewExportCardCopy, y: number, height: number) {
  const hasEvidence = shouldDrawEvidenceBadge(model);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, CARD_MARGIN, y, CARD_WIDTH - CARD_MARGIN * 2, height, 24);
  ctx.fill();

  const date = Number.isNaN(Date.parse(model.createdAt)) ? model.createdAt : new Date(model.createdAt).toLocaleDateString();
  ctx.fillStyle = '#6f6758';
  ctx.font = '500 22px ui-sans-serif, system-ui, sans-serif';

  if (hasEvidence) {
    ctx.fillStyle = model.evidenceState === 'achieved' ? '#587d55' : model.evidenceState === 'not_achieved' ? '#9b4a37' : '#a87828';
    ctx.font = '700 26px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${copy.evidence}: ${model.evidenceLabel}`, 104, y + 38);
    ctx.fillStyle = '#6f6758';
    ctx.font = '500 22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${copy.createdAt}: ${date}`, 104, y + 70);
  } else {
    ctx.fillText(`${copy.createdAt}: ${date}`, 104, y + Math.round(height / 2) + 8);
  }

  if (model.confidence) {
    ctx.textAlign = 'right';
    const confidence = copy.confidenceLevels[model.confidence as keyof typeof copy.confidenceLevels] || model.confidence;
    ctx.fillText(`${copy.confidence}: ${confidence}`, 1096, hasEvidence ? y + 70 : y + Math.round(height / 2) + 8);
    ctx.textAlign = 'left';
  }
}

export function getReviewExportCanvasLayout(
  ctx: CanvasRenderingContext2D,
  model: ReviewExportCardModel,
  copy: ReviewExportCardCopy
): ReviewExportCanvasLayout {
  const textTop = model.mode === 'retake' ? 790 : 948;
  const summaryMetrics = measureWrappedText(ctx, model.summary, 1056, 700, 38, 'ui-sans-serif, system-ui, sans-serif');
  const supportText = [model.target ? `${copy.target}: ${model.target}` : '', model.suggestion].filter(Boolean).join('  ');
  const supportTop = textTop + Math.max(112, summaryMetrics.height + 46);
  const supportMetrics = measureWrappedText(ctx, supportText, 1056, 500, 26, 'ui-sans-serif, system-ui, sans-serif');
  const evidenceMetrics = model.mode === 'retake' && model.evidenceLines.length > 0
    ? measureWrappedText(ctx, `${copy.evidence}: ${model.evidenceLines.join(' / ')}`, 1056, 500, 22, 'ui-sans-serif, system-ui, sans-serif')
    : { lines: [], fontSize: 22, lineHeight: 30, height: 0 };
  const evidenceTop = supportTop + Math.max(84, supportMetrics.height + 34);
  const textEnd = Math.max(
    supportTop + supportMetrics.height,
    evidenceMetrics.lines.length ? evidenceTop + evidenceMetrics.height : 0,
  );
  const footerHeight = shouldDrawEvidenceBadge(model) || model.confidence ? 92 : 66;
  const footerY = Math.max(1320, textEnd + 56);
  const editedNoticeHeight = model.excerptEdited ? 46 : 0;
  const finalHeight = Math.max(CARD_HEIGHT, footerY + footerHeight + 54 + editedNoticeHeight);
  return {
    textTop,
    supportTop,
    evidenceTop,
    textEnd,
    footerY,
    footerHeight,
    finalHeight,
    summaryMetrics,
    supportMetrics,
    evidenceMetrics,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('CANVAS_EXPORT_FAILED'));
    }, 'image/png');
  });
}

export async function renderReviewExportCardPng(
  model: ReviewExportCardModel,
  copy: ReviewExportCardCopy,
  options: ReviewExportCanvasOptions = {}
): Promise<ReviewExportCanvasResult> {
  if (!model.imageUrl) throw new Error(copy.imageMissing);
  const objectUrls: string[] = [];
  try {
    const [currentObjectUrl, sourceObjectUrl] = await Promise.all([
      fetchImageObjectUrl(model.imageUrl, options.token),
      model.mode === 'retake' && model.sourceImageUrl
        ? fetchImageObjectUrl(model.sourceImageUrl, options.token)
        : Promise.resolve(null),
    ]);
    objectUrls.push(currentObjectUrl);
    if (sourceObjectUrl) objectUrls.push(sourceObjectUrl);

    const [currentImage, sourceImage] = await Promise.all([
      loadImage(currentObjectUrl),
      sourceObjectUrl ? loadImage(sourceObjectUrl) : Promise.resolve(null),
    ]);

    if (model.mode === 'retake' && !sourceImage) throw new Error(copy.imageFailed);

    const canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');

  const layout = getReviewExportCanvasLayout(ctx, model, copy);

  if (layout.finalHeight !== CARD_HEIGHT) {
    canvas.height = layout.finalHeight;
  }

  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, CARD_WIDTH, canvas.height);
  ctx.fillStyle = '#252018';
  ctx.font = '700 54px ui-serif, Georgia, serif';
  if (ctx.measureText(model.title).width > 760) ctx.font = '700 44px ui-serif, Georgia, serif';
  if (ctx.measureText(model.title).width > 760) throw new Error(copy.textTooLong);
  ctx.fillText(model.title, 72, 104);

  if (model.showScore) {
    ctx.fillStyle = '#b98a2d';
    ctx.font = '700 88px ui-serif, Georgia, serif';
    ctx.textAlign = 'right';
    ctx.fillText(model.finalScore.toFixed(1), CARD_WIDTH - 72, 122);
    ctx.font = '500 24px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('/ 10', CARD_WIDTH - 72, 158);
    ctx.font = '500 18px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(copy.scoreContext, CARD_WIDTH - 72, 185);
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = '#6f6758';
    ctx.font = '600 28px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(copy.scoreHidden, CARD_WIDTH - 72, 130);
    ctx.textAlign = 'left';
  }

  const photoY = 204;
  if (model.mode === 'retake' && sourceImage) {
    drawContainedImage(ctx, sourceImage, 72, photoY, 512, 520, 28);
    drawContainedImage(ctx, currentImage, 616, photoY, 512, 520, 28);
    ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif';
    for (const [label, left] of [[copy.before, 88], [copy.after, 632]] as const) {
      ctx.fillStyle = 'rgba(25,23,19,0.86)';
      roundRect(ctx, left, photoY + 16, ctx.measureText(label).width + 24, 40, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, left + 12, photoY + 43);
    }
  } else {
    drawContainedImage(ctx, currentImage, 72, photoY, 1056, 704, 30);
  }

  ctx.fillStyle = '#2f2a22';
  ctx.font = `700 ${layout.summaryMetrics.fontSize}px ui-sans-serif, system-ui, sans-serif`;
  drawWrappedLines(ctx, layout.summaryMetrics.lines, 72, layout.textTop, layout.summaryMetrics.lineHeight);

  ctx.fillStyle = '#5f574a';
  ctx.font = `500 ${layout.supportMetrics.fontSize}px ui-sans-serif, system-ui, sans-serif`;
  drawWrappedLines(ctx, layout.supportMetrics.lines, 72, layout.supportTop, layout.supportMetrics.lineHeight);
  if (layout.evidenceMetrics.lines.length > 0) {
    ctx.fillStyle = '#6f6758';
    ctx.font = `500 ${layout.evidenceMetrics.fontSize}px ui-sans-serif, system-ui, sans-serif`;
    drawWrappedLines(ctx, layout.evidenceMetrics.lines, 72, layout.evidenceTop, layout.evidenceMetrics.lineHeight);
  }

  drawFooter(ctx, model, copy, layout.footerY, layout.footerHeight);
  if (model.excerptEdited) {
    ctx.fillStyle = '#8a7a62';
    ctx.font = '500 18px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(copy.editedExcerptNotice, 72, canvas.height - 34);
  }

    const blob = await canvasToBlob(canvas);
    return { blob, url: URL.createObjectURL(blob) };
  } catch (error) {
    if (error instanceof Error && error.message === copy.textTooLong) throw error;
    if (error instanceof Error && error.message === copy.imageMissing) throw error;
    throw new Error(copy.imageFailed);
  } finally {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}
