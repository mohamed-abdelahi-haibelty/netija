import { describe, expect, it } from 'vitest';
import { computeMatchKey } from '../match-key.js';

describe('computeMatchKey', () => {
  it('returns null when name is absent', () => {
    expect(computeMatchKey(null, '2002-06-15', 'Nouakchott')).toBeNull();
  });

  it('returns null when birthDate is absent', () => {
    expect(computeMatchKey('Ahmed Ould Mohamed', null, 'Nouakchott')).toBeNull();
  });

  it('returns null when birthPlace is absent', () => {
    expect(computeMatchKey('Ahmed Ould Mohamed', '2002-06-15', null)).toBeNull();
  });

  it('is stable across calls with the same input', () => {
    const k1 = computeMatchKey('Ahmed Ould Mohamed', '2002-06-15', 'Nouakchott');
    const k2 = computeMatchKey('Ahmed Ould Mohamed', '2002-06-15', 'Nouakchott');
    expect(k1).toBe(k2);
    expect(k1).toHaveLength(64); // SHA-256 hex
  });

  it('is case-insensitive on name', () => {
    const k1 = computeMatchKey('Ahmed Ould Mohamed', '2002-06-15', 'Rosso');
    const k2 = computeMatchKey('AHMED OULD MOHAMED', '2002-06-15', 'Rosso');
    expect(k1).toBe(k2);
  });

  it('ignores extra whitespace in the name', () => {
    const k1 = computeMatchKey('Ahmed Ould Mohamed', '2002-06-15', 'Rosso');
    const k2 = computeMatchKey('AhmedOuld  Mohamed', '2002-06-15', 'Rosso');
    expect(k1).toBe(k2);
  });

  it('strips diacritics from name', () => {
    const k1 = computeMatchKey('Mariem Mint Salem', '2002-11-20', 'Kiffa');
    const k2 = computeMatchKey('Màrïèm Mint Sàlèm', '2002-11-20', 'Kiffa');
    expect(k1).toBe(k2);
  });

  it('strips diacritics from birthPlace', () => {
    const k1 = computeMatchKey('Ali Ba', '2001-01-15', 'Néma');
    const k2 = computeMatchKey('Ali Ba', '2001-01-15', 'Nema');
    expect(k1).toBe(k2);
  });

  it('produces different hashes for different birth places', () => {
    const k1 = computeMatchKey('Mohamed Ould Ahmed', '2001-05-10', 'Nouakchott');
    const k2 = computeMatchKey('Mohamed Ould Ahmed', '2001-05-10', 'Nouadhibou');
    expect(k1).not.toBe(k2);
  });

  it('produces different hashes for different birth dates', () => {
    const k1 = computeMatchKey('Ahmed Mint Ba', '2001-05-10', 'Rosso');
    const k2 = computeMatchKey('Ahmed Mint Ba', '2001-06-10', 'Rosso');
    expect(k1).not.toBe(k2);
  });

  it('produces different hashes for completely different names', () => {
    const k1 = computeMatchKey('Fatima Mint Cheikh', '2000-03-22', 'Kiffa');
    const k2 = computeMatchKey('Oumar Ba', '2000-03-22', 'Kiffa');
    expect(k1).not.toBe(k2);
  });
});
