// =============================================================================
// AEMS v2 — Client-safe error messages.
// Business-rule messages thrown by the store pass through; anything that looks
// like a database, network or runtime internal is logged and replaced.
// =============================================================================

const INTERNAL_ERROR_PATTERN =
  /\bER_[A-Z_]+|\bsql\b|mysql|\bsyntax\b|\bcolumn\b|\btable\b|foreign key|duplicate entry|\becon\w+|etimedout|enotfound|eai_again|\bsocket\b|\bstack\b|cannot read|\bundefined\b|is not a function|unexpected token|\bjson\b|\bs3\b|\baws\b|credential|access key|\bat\s+\S+\s+\(/i;

export function safeErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : '';
  if (!message || message.length > 300 || INTERNAL_ERROR_PATTERN.test(message)) {
    if (err) console.error('[AEMS API]', err);
    return fallback;
  }
  return message;
}
