/** Assemble listing address + state without duplicating an existing state suffix. */
export function buildListingAddress(address: string, stateCode: string): string {
  const trimmed = (address ?? '').trim().replace(/,$/, '');
  const code = (stateCode ?? '').trim();
  if (!trimmed) return code;
  if (!code) return trimmed;

  const upperAddr = trimmed.toUpperCase();
  const upperCode = code.toUpperCase();

  // Ends with state (e.g. "55 mainland, TX")
  if (upperAddr.endsWith(upperCode)) {
    return trimmed;
  }

  // State already embedded mid-string (e.g. "200 Park Ave, New York, NY 10166, USA")
  const escaped = upperCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(?:^|[,\\s])${escaped}(?:$|[,\\s])`).test(upperAddr)) {
    return trimmed;
  }

  return `${trimmed}, ${code}`;
}
