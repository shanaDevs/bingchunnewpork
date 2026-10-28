/**
 * Upload Frontend/public/products images to DigitalOcean Spaces and store
 * the public URLs on products.imageUrl (cover) + products.imageUrls (JSON array).
 *
 *   cd backend && npx ts-node --transpile-only scripts/upload-product-images-to-spaces.ts
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';
import { isSpacesConfigured, uploadToSpacesAtKey, rewriteSpacesPublicUrl } from '../src/lib/spaces';
import { PRODUCT_IMAGES, parseProductImageUrls, resolveProductImageFields } from '../src/lib/productImages';
import { ensureProductImageUrlsColumn } from '../src/lib/productSchema';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function resolveLocalProductsDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../Frontend/public/products'),
    path.resolve(__dirname, '../../frontend/public/products'),
    path.resolve(__dirname, '../public/products'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(`Product images folder not found. Looked in:\n${candidates.join('\n')}`);
}

function filenameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.split('?')[0].split('#')[0];
  const base = path.basename(clean);
  return base || null;
}

async function main() {
  if (!isSpacesConfigured()) {
    throw new Error('DigitalOcean Spaces is not configured. Set DO_SPACES_KEY, DO_SPACES_SECRET, and DO_SPACES_BUCKET.');
  }

  await ensureProductImageUrlsColumn();

  const localDir = resolveLocalProductsDir();
  const files = fs.readdirSync(localDir).filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()));
  if (!files.length) {
    throw new Error(`No image files in ${localDir}`);
  }

  console.log(`Uploading ${files.length} files from ${localDir}`);
  console.log(`Spaces prefix: ${config.doSpaces.prefix}/products/`);

  const uploadedByFilename = new Map<string, string>();
  for (const filename of files) {
    const buffer = fs.readFileSync(path.join(localDir, filename));
    const key = `${config.doSpaces.prefix}/products/${filename}`;
    const url = await uploadToSpacesAtKey(buffer, key);
    uploadedByFilename.set(filename, url);
    console.log(`  ${filename} -> ${url}`);
  }

  const products = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; imageUrl: string | null; imageUrls: unknown }>
  >(`SELECT "id", "name", "imageUrl", "imageUrls" FROM "products"`);

  let updated = 0;
  for (const product of products) {
    const mappedPath = PRODUCT_IMAGES[product.name];
    const mappedFile = mappedPath ? filenameFromUrl(mappedPath) : null;
    const existingUrls = [
      ...parseProductImageUrls(product.imageUrls),
      product.imageUrl,
    ]
      .filter((url): url is string => Boolean(url))
      .map((url) => (url.startsWith('http') ? rewriteSpacesPublicUrl(url) : url));

    const fromLocal: string[] = [];
    if (mappedFile && uploadedByFilename.has(mappedFile)) {
      fromLocal.push(uploadedByFilename.get(mappedFile)!);
    }
    const dbFile = filenameFromUrl(product.imageUrl);
    if (dbFile && uploadedByFilename.has(dbFile)) {
      fromLocal.push(uploadedByFilename.get(dbFile)!);
    }

    const keptRemote = existingUrls.filter((url) => url.startsWith('http'));
    const images = resolveProductImageFields({
      imageUrls: [...fromLocal, ...keptRemote],
    });

    if (!images.imageUrls.length) continue;

    const sameCover = images.imageUrl === product.imageUrl;
    const sameGallery =
      JSON.stringify(images.imageUrls) === JSON.stringify(parseProductImageUrls(product.imageUrls));
    if (sameCover && sameGallery && images.imageUrls[0]?.startsWith('http')) continue;

    await prisma.$executeRawUnsafe(
      `UPDATE "products" SET "imageUrl" = $1, "imageUrls" = $2::jsonb, "updatedAt" = NOW() WHERE "id" = $3`,
      images.imageUrl,
      JSON.stringify(images.imageUrls),
      product.id,
    );
    updated += 1;
    console.log(`  product ${product.name}: ${images.imageUrls.length} image(s)`);
  }

  console.log(`Done. Uploaded ${files.length} files, updated ${updated} products.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
