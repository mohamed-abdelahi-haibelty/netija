/**
 * CI gate: all locale JSON files must have identical key sets.
 * A missing key in any locale fails the build.
 */
import ar from '@/dictionaries/ar.json';
import fr from '@/dictionaries/fr.json';

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const full = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? flatKeys(v as Record<string, unknown>, full)
      : [full];
  });
}

const arKeys = new Set(flatKeys(ar));
const frKeys = new Set(flatKeys(fr));

describe('i18n locale key parity', () => {
  it('fr.json contains all keys from ar.json', () => {
    const missing = [...arKeys].filter((k) => !frKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('ar.json contains all keys from fr.json', () => {
    const missing = [...frKeys].filter((k) => !arKeys.has(k));
    expect(missing).toEqual([]);
  });
});
