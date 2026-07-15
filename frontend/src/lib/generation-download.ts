export function parseContentDispositionFilename(disposition: string): string | null {
  const parts = splitContentDisposition(disposition);
  const encodedFilename = getDispositionParameter(parts, 'filename*');
  if (encodedFilename) {
    const decoded = decodeExtendedDispositionValue(encodedFilename);
    if (decoded) return sanitizeDownloadFilename(decoded);
  }

  const filename = getDispositionParameter(parts, 'filename');
  return filename ? sanitizeDownloadFilename(filename) : null;
}

function splitContentDisposition(disposition: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < disposition.length; index += 1) {
    const char = disposition[index];
    if (char === '"' && disposition[index - 1] !== '\\') {
      quoted = !quoted;
    }
    if (char === ';' && !quoted) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function getDispositionParameter(parts: string[], name: string): string | null {
  const prefix = `${name.toLowerCase()}=`;
  for (const part of parts) {
    if (!part.toLowerCase().startsWith(prefix)) continue;
    return unquoteDispositionValue(part.slice(prefix.length).trim());
  }
  return null;
}

function unquoteDispositionValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return value;
}

function decodeExtendedDispositionValue(value: string): string | null {
  const match = /^([^']*)'[^']*'(.*)$/i.exec(value);
  const encoded = match?.[2] ?? value;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded || null;
  }
}

function sanitizeDownloadFilename(filename: string): string | null {
  const sanitized = filename
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]+/g, '-')
    .trim();
  return sanitized || null;
}
