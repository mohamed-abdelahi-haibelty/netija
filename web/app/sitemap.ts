import type { MetadataRoute } from 'next';
import { locales } from '@/lib/i18n/settings';

const BASE_URL = 'https://netija.mr';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return locales.flatMap((locale) => [
    {
      url: `${BASE_URL}/${locale}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 1,
    },
    {
      url: `${BASE_URL}/${locale}/privacy`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/${locale}/team`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
  ]);
}
