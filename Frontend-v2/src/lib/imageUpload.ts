export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_LABEL = '5 MB';

/** Returns an error message when the file is invalid, otherwise null. */
export function validateImageFile(file: File, label: string): string | null {
  if (!file.type.startsWith('image/')) {
    return `${label} must be a JPEG, PNG, or WebP image`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${label} must be ${MAX_IMAGE_LABEL} or smaller`;
  }
  return null;
}
