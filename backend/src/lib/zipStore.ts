import AdmZip from 'adm-zip';

/** Build an in-memory ZIP from named file buffers (e.g. payout statement PDFs). */
export function buildStoredZip(files: Array<{ path: string; data: Buffer }>): Buffer {
  const zip = new AdmZip();
  for (const file of files) {
    zip.addFile(file.path, file.data);
  }
  return zip.toBuffer();
}