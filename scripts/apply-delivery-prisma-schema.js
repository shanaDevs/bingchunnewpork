/**
 * One-off helper: tag Prisma models with @@schema("public"|"delivery") for multiSchema.
 * Run from repo root: node scripts/apply-delivery-prisma-schema.js
 */
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../packages/db/prisma/schema.prisma');
const DELIVERY_MODELS = new Set([
  'DeliveryZone',
  'RiderRating',
  'DeliveryJob',
  'DeliveryJobOrder',
  'DeliveryPayout',
  'DeliveryAccessLog',
  'DriverLocation',
  'DriverShift',
  'DriverDevice',
  'DeliveryAttempt',
  'DeliveryOtp',
  'DeliveryEvent',
  'DeliveryOutbox',
  'DeliveryJobRejection',
  'DriverComplaint',
  'DriverBranchRequest',
  'MeritPointHistory',
]);

const DELIVERY_ENUMS = new Set(['DeliveryJobStatus']);

let content = fs.readFileSync(schemaPath, 'utf8');

if (!content.includes('previewFeatures = ["multiSchema"]')) {
  content = content.replace(
    /generator client \{\n/,
    'generator client {\n  previewFeatures = ["multiSchema"]\n',
  );
}

if (!content.includes('schemas    = ["public", "delivery"]')) {
  content = content.replace(
    /datasource db \{\n  provider = "postgresql"\n  url      = env\("DATABASE_URL"\)\n\}/,
    `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas    = ["public", "delivery"]
}`,
  );
}

function tagBlock(blockType, name, body, schema) {
  if (body.includes('@@schema(')) return body;
  const schemaLine = `  @@schema("${schema}")\n`;
  if (body.includes('@@map(')) {
    return body.replace(/(\n  @@map\()/, `\n${schemaLine}$1`);
  }
  return body.trimEnd() + `\n${schemaLine}`;
}

content = content.replace(/^enum (\w+) \{([\s\S]*?)^\}/gm, (full, name, body) => {
  const schema = DELIVERY_ENUMS.has(name) ? 'delivery' : 'public';
  const inner = tagBlock('enum', name, body, schema);
  return `enum ${name} {${inner}}`;
});

content = content.replace(/^model (\w+) \{([\s\S]*?)^\}/gm, (full, name, body) => {
  const schema = DELIVERY_MODELS.has(name) ? 'delivery' : 'public';
  const inner = tagBlock('model', name, body, schema);
  return `model ${name} {${inner}}`;
});

fs.writeFileSync(schemaPath, content);
console.log('Updated', schemaPath);
