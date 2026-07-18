export const blogOgSize = {
  width: 1200,
  height: 630,
};

export interface BlogOgFonts {
  display: ArrayBuffer;
  body: ArrayBuffer;
}

export function truncateBlogOgText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
