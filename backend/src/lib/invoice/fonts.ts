import fs from 'fs';
import path from 'path';
import type PDFKit from 'pdfkit';

export const WD_FONT = {
  regular: 'Inter',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
} as const;

function backendRoot(): string {
  return path.resolve(__dirname, '../../..');
}

function interFontDir(): string {
  return path.join(backendRoot(), 'assets', 'fonts', 'inter');
}

export function withdrawalMascotPath(): string | null {
  const candidates = [
    path.join(backendRoot(), 'assets', 'brand', 'mascot.png'),
    path.join(process.cwd(), 'assets', 'brand', 'mascot.png'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function fontPath(fileName: string): string {
  const candidates = [
    path.join(interFontDir(), fileName),
    path.join(process.cwd(), 'assets', 'fonts', 'inter', fileName),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`Inter font missing: ${fileName}`);
  }
  return found;
}

/** Register Inter Regular / Medium / SemiBold / Bold on a PDFKit document. */
export function registerWithdrawalFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont(WD_FONT.regular, fontPath('Inter-Regular.ttf'));
  doc.registerFont(WD_FONT.medium, fontPath('Inter-Medium.ttf'));
  doc.registerFont(WD_FONT.semibold, fontPath('Inter-SemiBold.ttf'));
  doc.registerFont(WD_FONT.bold, fontPath('Inter-Bold.ttf'));
}
