const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

// Fires on every publish/unpublish flip (project-overview.md release flow:
// "an atomic flag flip ... also purges the Cloudflare cache"). Silently a
// no-op when the token/zone aren't configured — local dev has no real
// Cloudflare zone, and a missing credential there shouldn't fail the whole
// publish over a purge that only matters in production/staging.
export async function purgeCloudflareCache(): Promise<void> {
  const token = process.env['CLOUDFLARE_API_TOKEN'];
  const zoneId = process.env['CLOUDFLARE_ZONE_ID'];
  if (!token || !zoneId) return;

  const res = await fetch(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ purge_everything: true }),
  });

  if (!res.ok) {
    throw new Error(`Cloudflare purge failed with status ${String(res.status)}`);
  }
}
