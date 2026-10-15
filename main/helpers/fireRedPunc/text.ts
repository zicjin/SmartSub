/**
 * FireRedPunc outputs a complete sentence terminator. Subtitle delivery does
 * not show a full stop at the end of a cue, while all internal punctuation and
 * interrogative/exclamatory endings remain visible.
 */
const CLOSING =
  '["\u2019\u201d\u3009\u300b\u300d\u300f\u3011\u3015\u3017\u3019\u301b\u301e\u301f\u300d\u300f\u3011\u3009\u300b\u300d\u300f\u3011\u0027)\\]»”’';
const PROTECTED_ABBREVIATION =
  /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|no)\.$/i;

function removeOneTerminalPeriod(text: string): string {
  let value = text.trimEnd();
  const suffix = value.match(new RegExp(`([${CLOSING}]+)$`))?.[1] ?? '';
  const body = (suffix ? value.slice(0, -suffix.length) : value).trimEnd();
  if (
    !body ||
    PROTECTED_ABBREVIATION.test(body) ||
    /\b(?:[A-Za-z]\.){2,}$/.test(body) ||
    /\b(?:a\.m|p\.m)\.$/i.test(body)
  )
    return value;

  // Keep decimal points and the dots in an ellipsis. A terminal dot after a
  // word or CJK character is the ordinary sentence full stop.
  if (body.endsWith('。')) return `${body.slice(0, -1)}${suffix}`;
  if (body.endsWith('.') && !body.endsWith('...')) {
    const before = body[body.length - 2] ?? '';
    if (/\d/.test(before) && /\d/.test(body[body.length - 1] ?? '')) {
      return value;
    }
    return `${body.slice(0, -1)}${suffix}`;
  }
  return value;
}

export function normalizeFireRedCueText(text: string): string {
  return removeOneTerminalPeriod(text);
}

export function normalizeFireRedCueTexts(texts: string[]): string[] {
  return texts.map(normalizeFireRedCueText);
}

/** Normalize only subtitle text lines in a canonical SRT document. */
export function normalizeFireRedSrtContent(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n');
      const timing = lines.findIndex((line) => line.includes('-->'));
      if (timing < 0) return block;
      for (let i = lines.length - 1; i > timing; i -= 1) {
        if (lines[i].trim()) {
          lines[i] = normalizeFireRedCueText(lines[i]);
          break;
        }
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

export function normalizeFireRedBilingualSrtContent(
  content: string,
  translateContent: string | undefined,
): string {
  const sourceFirst = translateContent !== 'translateAndSource';
  return content
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n');
      const timing = lines.findIndex((line) => line.includes('-->'));
      if (timing < 0) return block;
      const textIndexes = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line, index }) => index > timing && line.trim())
        .map(({ index }) => index);
      const sourceIndex = sourceFirst
        ? textIndexes[0]
        : textIndexes[textIndexes.length - 1];
      if (sourceIndex !== undefined)
        lines[sourceIndex] = normalizeFireRedCueText(lines[sourceIndex]);
      return lines.join('\n');
    })
    .join('\n\n');
}

export function prepareFireRedPuncInput(text: string): string {
  // Official FireRedPunc expects unpunctuated text. Keep letters, numbers,
  // CJK and spaces; remove existing sentence punctuation without joining words.
  return text
    .replace(/[，。？！、；：,.?!;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
