import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BlogOgFonts } from '@/lib/blog-og-image';

let cached: BlogOgFonts | null = null;

export function loadBlogOgFonts(): BlogOgFonts {
  if (cached) return cached;

  const fontsDir = join(process.cwd(), 'public', 'fonts');
  const display = readFileSync(join(fontsDir, 'CormorantGaramond-SemiBold.woff'));
  const body = readFileSync(join(fontsDir, 'DMSans-Medium.woff'));

  cached = {
    display: display.buffer.slice(display.byteOffset, display.byteOffset + display.byteLength),
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };

  return cached;
}
