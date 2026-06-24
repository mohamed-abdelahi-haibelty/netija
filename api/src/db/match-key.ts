import { createHash } from 'node:crypto';

/**
 * Computes the linking key used to match the same person across exam years.
 * Formula: sha256(normalizedName|birthDateIso|normalizedBirthPlace)
 * Normalisation: lowercase, collapse whitespace, strip combining diacritics.
 * Returns null when any of the three inputs is absent.
 */
export function computeMatchKey(
  name: string | null | undefined,
  birthDate: string | null | undefined,
  birthPlace: string | null | undefined,
): string | null {
  if (!name || !birthDate || !birthPlace) return null;
  const normName = name
    .toLowerCase()
    .replace(/\s+/g, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const normPlace = birthPlace
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return createHash('sha256').update(`${normName}|${birthDate}|${normPlace}`).digest('hex');
}
