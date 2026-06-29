import { Meilisearch } from 'meilisearch';

export type MeiliClient = Meilisearch;

export const PERSONS_INDEX = 'persons';

export const meili = new Meilisearch({
  host: process.env['MEILI_HOST'] ?? 'http://localhost:7700',
  apiKey: process.env['MEILI_MASTER_KEY'],
});
