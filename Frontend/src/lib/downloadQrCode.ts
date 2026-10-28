const QR_LOGO_SRC = '/brand/mascot-hover.png';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/** Download a pickup QR card PNG with token (top) and order number (bottom). */
export async function downloadPickupQrCardPng(
  svgElement: SVGElement,
  options: {
    filename: string;
    orderNumber: string;
    tokenNumber?: number | null;
  },
): Promise<void> {
  const { filename, orderNumber, tokenNumber } = options;
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const qrSize = 280;
  const padX = 40;
  const headerH = 52;
  const footerH = 56;
  const canvasW = qrSize + padX * 2;
  const canvasH = padX + headerH + qrSize + footerH + padX;

  const [qrImg, logoImg] = await Promise.all([
    loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`),
    loadImage(QR_LOGO_SRC).catch(() => null),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const topText = tokenNumber != null ? `Token #${tokenNumber}` : 'Pickup Order';
  ctx.fillStyle = '#307ef2';
  ctx.font = 'bold 24px Poppins, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(topText, canvasW / 2, padX + headerH / 2);

  const qrY = padX + headerH;
  ctx.drawImage(qrImg, padX, qrY, qrSize, qrSize);

  if (logoImg) {
    const logoSize = Math.round(qrSize * 0.22);
    const logoX = padX + (qrSize - logoSize) / 2;
    const logoY = qrY + (qrSize - logoSize) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(logoX - 4, logoY - 4, logoSize + 8, logoSize + 8, 8);
    ctx.fill();
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
  }

  ctx.fillStyle = '#0b1220';
  ctx.font = 'bold 20px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(orderNumber, canvasW / 2, qrY + qrSize + footerH / 2);

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/** @deprecated Use downloadPickupQrCardPng for branded pickup cards */
export function downloadQrCodePng(svgElement: SVGElement, filename: string): void {
  void downloadPickupQrCardPng(svgElement, { filename, orderNumber: filename });
}
