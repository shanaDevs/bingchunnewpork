/** One-shot: apply runtime schema patches (e.g. before seeds when RUNTIME_SCHEMA_PATCHES=false). */
import path from 'path';
import dotenv from 'dotenv';
import { ensureAppSchema } from '../lib/appSchema';
import { prisma } from '../lib/prisma';

dotenv.config({ path: path.join(__dirname, '../../.env') });
process.env.RUNTIME_SCHEMA_PATCHES = 'true';

ensureAppSchema()
  .then(async () => {
    console.log('ensureAppSchema done.');
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
