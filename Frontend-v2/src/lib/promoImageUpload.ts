import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

export async function uploadPromoImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`${getApiBaseUrl()}/promos/admin/upload-image`, {
    method: 'POST',
    headers: adminAuthHeaders(), credentials: 'include',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Upload failed');
  return data.data?.imageUrl ?? data.imageUrl;
}
