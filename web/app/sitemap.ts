import type { MetadataRoute } from 'next';
import { locales } from '@/lib/i18n/settings';

const BASE_URL = 'https://netija.mr';

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.map((locale) => ({
    url: `${BASE_URL}/${locale}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 1,
  }));
}
