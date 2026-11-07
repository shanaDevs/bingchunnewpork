/** Stored paths may reference .avif while assets ship as .png under /products.
 *  Full Spaces URLs with dotted bucket names are rewritten to path-style (TLS-safe). */
/** https://bucket.with.dots.sgp1.digitaloceanspaces.com/key → path-style */
function rewriteSpacesPublicUrl(fileUrl: string): string {
  const m = fileUrl.match(
    /^https?:\/\/(.+)\.([a-z0-9]+)\.digitaloceanspaces\.com\/(.+)$/i,
  );
  if (!m) return fileUrl;
  const [, bucket, region, key] = m;
  if (!bucket.includes('.')) return fileUrl;
  return `https://${region}.digitaloceanspaces.com/${bucket}/${key}`;
}

export function resolveProductImageUrl(imageUrl?: string | null): string | undefined {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    return rewriteSpacesPublicUrl(imageUrl);
  }
  let url = imageUrl;
  if (url.startsWith('/products/') && url.endsWith('.avif')) {
    url = `${url.slice(0, -5)}.png`;
  }
  if (url.startsWith('/products/')) {
    // Static product art lives in frontend public/ — keep same-origin so the
    // browser does not resolve to localhost when NEXT_PUBLIC_API_URL is /api.
    return url;
  }
  return url;
}
