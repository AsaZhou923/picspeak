import type { ReviewExportCardCopy, ReviewExportCardModel } from './reviewExportPresentation';

export interface ReviewExportCanvasResult {
  blob: Blob;
  url: string;
}

export interface ReviewExportCanvasOptions {
  token?: string | null;
}

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 1500;

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
  for (const char of chars) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      const boundary = line.lastIndexOf(' ');
      if (boundary > 0) {
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

  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = '#252018';
  ctx.font = '700 54px ui-serif, Georgia, serif';
  if (ctx.measureText(model.title).width > 650) throw new Error(copy.textTooLong);
  ctx.fillText(model.title, 72, 104);
  ctx.font = '500 28px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#6f6758';
  ctx.fillText(`#${model.reviewId.slice(0, 8)}`, 72, 150);

  if (model.showScore) {
    ctx.fillStyle = '#b98a2d';
    ctx.font = '700 88px ui-serif, Georgia, serif';
    ctx.textAlign = 'right';
    ctx.fillText(model.finalScore.toFixed(1), CARD_WIDTH - 72, 122);
    ctx.font = '500 24px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('/ 10', CARD_WIDTH - 72, 158);
    ctx.font = '500 18px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${copy.scoreContext} · ${model.scoreVersion || 'legacy'}`, CARD_WIDTH - 72, 185);
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

  const textTop = model.mode === 'retake' ? 790 : 970;
  ctx.fillStyle = '#2f2a22';
  ctx.font = '700 40px ui-sans-serif, system-ui, sans-serif';
  const summaryLines = getWrappedLines(ctx, model.summary, 1056, 3);
  if (!summaryLines) throw new Error(copy.textTooLong);
  drawWrappedLines(ctx, summaryLines, 72, textTop, 52);

  ctx.fillStyle = '#5f574a';
  ctx.font = '500 28px ui-sans-serif, system-ui, sans-serif';
  const supportText = [model.target ? `${copy.target}: ${model.target}` : '', model.suggestion].filter(Boolean).join('  ');
  const supportLines = getWrappedLines(ctx, supportText, 1056, 4);
  if (!supportLines) throw new Error(copy.textTooLong);
  drawWrappedLines(ctx, supportLines, 72, textTop + 180, 42);
  if (model.mode === 'retake' && model.evidenceLines.length > 0) {
    ctx.fillStyle = '#6f6758';
    ctx.font = '500 22px ui-sans-serif, system-ui, sans-serif';
    const evidenceLines = getWrappedLines(ctx, `${copy.evidence}: ${model.evidenceLines.join(' / ')}`, 1056, 2);
    if (!evidenceLines) throw new Error(copy.textTooLong);
    drawWrappedLines(ctx, evidenceLines, 72, textTop + 360, 32);
  }

  const badgeY = 1320;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 72, badgeY, 1056, 92, 24);
  ctx.fill();
  ctx.fillStyle = model.evidenceState === 'achieved' ? '#587d55' : model.evidenceState === 'not_achieved' ? '#9b4a37' : '#a87828';
  ctx.font = '700 26px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`${copy.evidence}: ${model.evidenceLabel}`, 104, badgeY + 38);
  ctx.fillStyle = '#6f6758';
  ctx.font = '500 22px ui-sans-serif, system-ui, sans-serif';
  const date = Number.isNaN(Date.parse(model.createdAt)) ? model.createdAt : new Date(model.createdAt).toLocaleDateString();
  ctx.fillText(`${copy.createdAt}: ${date}`, 104, badgeY + 70);
  if (model.confidence) {
    ctx.textAlign = 'right';
    const confidence = copy.confidenceLevels[model.confidence as keyof typeof copy.confidenceLevels] || model.confidence;
    ctx.fillText(`${copy.confidence}: ${confidence}`, 1096, badgeY + 70);
    ctx.textAlign = 'left';
  }
  if (model.excerptEdited) {
    ctx.fillStyle = '#8a7a62';
    ctx.font = '500 18px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(copy.editedExcerptNotice, 72, CARD_HEIGHT - 34);
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
