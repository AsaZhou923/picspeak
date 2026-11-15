/**
 * Critique text arrives as a numbered list. When the list has one entry,
 * a lone "1." in running text only reads as a typo, so drop the marker.
 * Lists with two or more entries are returned unchanged.
 */
export function stripSoleListMarker(body: string | null | undefined): string {
  const text = (body ?? '').trim();
  if (!/^1[.、．]\s*/.test(text)) return text;
  if (/(?:^|\s)2[.、．]\s/.test(text)) return text;
  return text.replace(/^1[.、．]\s*/, '');
}
