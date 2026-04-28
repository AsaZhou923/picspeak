export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function canvasToRequiredBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  const blob = await canvasToBlob(canvas, type, quality);
  if (!blob) {
    throw new Error('Canvas toBlob returned null');
  }
  return blob;
}
