import PDFDocument from 'pdfkit';
import type { OpenApiSpec } from './openapi';
import { getOpenApiSpec } from './openapi';

type Parameter = {
  name: string;
  in: string;
  required?: boolean;
  example?: string | number;
  description?: string;
};

type Operation = {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: {
    content?: Record<string, { example?: unknown; schema?: { example?: unknown; properties?: Record<string, { example?: unknown }> } }>;
  };
  responses?: Record<string, { description?: string; content?: Record<string, { example?: unknown }> }>;
  servers?: { url: string }[];
};

const METHOD_COLOR: Record<string, string> = {
  GET: '#1b7f4e',
  POST: '#1d4e89',
  PUT: '#b86e00',
  PATCH: '#6b3fa0',
  DELETE: '#a32020',
};

function jsonBlock(value: unknown): string {
  const text = JSON.stringify(value, null, 2) ?? '';
  if (text.length <= 3500) return text;
  return `${text.slice(0, 3500)}\n… truncated. The live example is in Swagger at /api/docs.`;
}

function exampleFromContent(content: Record<string, { example?: unknown; schema?: { example?: unknown } }> | undefined): unknown {
  if (!content) return undefined;
  const json = content['application/json'];
  if (!json) return undefined;
  return json.example ?? json.schema?.example;
}

function requestExample(op: Operation): { kind: string; value: unknown } | null {
  const content = op.requestBody?.content;
  if (!content) return null;
  if (content['application/json']) {
    const value = content['application/json'].example ?? content['application/json'].schema?.example;
    if (value !== undefined) return { kind: 'json', value };
  }
  if (content['multipart/form-data']) {
    const props = content['multipart/form-data'].schema?.properties ?? {};
    const fields = Object.fromEntries(
      Object.entries(props).map(([name, schema]) => [name, schema.example ?? `<${name} file>`]),
    );
    return { kind: 'multipart', value: fields };
  }
  return null;
}

function curlFor(base: string, method: string, openPath: string, op: Operation): string {
  let url = `${base}${openPath}`;
  const query = (op.parameters ?? []).filter((p) => p.in === 'query' && p.example !== undefined);
  if (query.length) {
    const qs = query.map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(p.example))}`).join('&');
    url += `?${qs}`;
  }
  for (const p of op.parameters ?? []) {
    if (p.in === 'path') url = url.replace(`{${p.name}}`, encodeURIComponent(String(p.example ?? p.name)));
  }
  const lines = [`curl -X ${method.toUpperCase()} '${url}'`];
  const secured = (op.description ?? '').includes('Authorization: Bearer') || (op.description ?? '').startsWith('Admin') || (op.description ?? '').startsWith('Customer') || (op.description ?? '').startsWith('Driver') || (op.description ?? '').startsWith('Optional');
  if ((op.description ?? '').startsWith('Internal')) lines.push(`  -H 'x-internal-secret: <INTERNAL_SERVICE_SECRET>'`);
  else if (secured && !(op.description ?? '').startsWith('Public')) lines.push(`  -H 'Authorization: Bearer <accessToken>'`);
  const body = requestExample(op);
  if (body?.kind === 'json') {
    lines.push(`  -H 'Content-Type: application/json'`);
    lines.push(`  -d '${JSON.stringify(body.value)}'`);
  } else if (body?.kind === 'multipart' && body.value && typeof body.value === 'object') {
    for (const [name, value] of Object.entries(body.value as Record<string, unknown>)) {
      const rendered = typeof value === 'string' && value.startsWith('<') ? `@./${name}` : String(value);
      lines.push(`  -F '${name}=${rendered}'`);
    }
  }
  return lines.join(' \\\n');
}

function renderPdf(spec: OpenApiSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      bufferPages: true,
      info: {
        Title: 'Bing Chun API',
        Author: 'Bing Chun',
        Subject: 'Full application API reference with sample requests and responses',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;

    const ensure = (needed: number) => {
      if (doc.y + needed > bottom) doc.addPage();
    };

    const h1 = (text: string) => {
      ensure(36);
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a1a').text(text, { width });
      doc.moveDown(0.3);
    };

    const para = (text: string) => {
      doc.font('Helvetica').fontSize(10).fillColor('#222').text(text, { width });
      doc.moveDown(0.35);
    };

    const code = (text: string) => {
      ensure(24);
      doc.font('Courier').fontSize(8).fillColor('#1a1a1a').text(text, { width });
      doc.moveDown(0.4);
    };

    const core = spec.servers[0]?.url ?? 'http://localhost:4000';
    const endpointCount = Object.values(spec.paths).reduce((n, item) => n + Object.keys(item).length, 0);

    doc.font('Helvetica-Bold').fontSize(26).fillColor('#1d4e89').text('Bing Chun');
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1a1a').text('API reference');
    doc.moveDown(0.6);
    para('Full application document: customer shop, POS, admin, driver app, and the delivery microservice. Every operation includes sample data you can send and a sample success response.');
    para(`Core base URL: ${core}`);
    para(`Interactive Swagger: ${core}/api/docs`);
    para(`Endpoints in this document: ${endpointCount}`);
    para(`Generated: ${new Date().toISOString().slice(0, 10)}`);

    h1('How to call the API');
    para('Send JSON as Content-Type: application/json. Protected routes take Authorization: Bearer <access token>. Internal routes take header x-internal-secret.');
    para('Customer token: POST /api/auth/login or /api/auth/register. Staff token: POST /api/auth/admin/login. Driver token: POST /api/auth/delivery/login (phone, 6-digit code, and the challenge from the OTP request).');
    para('Success: { "success": true, "data": { } }. Lists add meta.total, meta.page, meta.limit, meta.pages. Errors: { "success": false, "message": "...", "details": null }. 400 business rule, 401 missing token, 403 role or permission, 404 missing record, 422 validation, 429 rate limit.');
    code(jsonBlock({ success: false, message: 'Invalid promo code', details: null }));
    para('Amounts in samples are Sri Lankan rupees unless a field name says otherwise. Phone numbers use 07XXXXXXXX or +94XXXXXXXXX. Ids in samples are fixed placeholders, not production records.');
    para('Socket.io uses the same host. Client events: trackOrder (order id or number), joinUser (user id), joinAdmin ({ adminId, storeId? }).');

    h1('Contents');
    const byTag = new Map<string, { method: string; path: string; op: Operation }[]>();
    for (const tag of spec.tags) byTag.set(tag.name, []);
    for (const [pathKey, item] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(item as Record<string, Operation>)) {
        const tag = op.tags?.[0] ?? 'Other';
        const list = byTag.get(tag) ?? [];
        list.push({ method, path: pathKey, op });
        byTag.set(tag, list);
      }
    }
    for (const tag of spec.tags) {
      const count = byTag.get(tag.name)?.length ?? 0;
      if (!count) continue;
      doc.font('Helvetica').fontSize(10).fillColor('#222').text(`${tag.name}  (${count})`, { width });
    }
    doc.moveDown(0.6);

    for (const tag of spec.tags) {
      const ops = byTag.get(tag.name) ?? [];
      if (!ops.length) continue;
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#1d4e89').text(tag.name, { width });
      doc.moveDown(0.2);
      para(tag.description);

      for (const { method, path: opPath, op } of ops) {
        ensure(72);
        const color = METHOD_COLOR[method.toUpperCase()] ?? '#222';
        doc.font('Helvetica-Bold').fontSize(11).fillColor(color).text(`${method.toUpperCase()}  ${opPath}`, { width });
        doc.font('Helvetica').fontSize(10).fillColor('#333').text(op.summary ?? '', { width });
        const authLine = (op.description ?? '').split('\n\n')[0] ?? '';
        if (authLine) doc.font('Helvetica-Oblique').fontSize(9).fillColor('#444').text(authLine, { width });
        const permission = (op.description ?? '').split('\n\n').find((line) => line.startsWith('Permission:'));
        if (permission) doc.font('Helvetica').fontSize(9).fillColor('#444').text(permission, { width });
        const pathParams = (op.parameters ?? []).filter((p) => p.in === 'path');
        if (pathParams.length) {
          doc.font('Helvetica').fontSize(9).fillColor('#222').text(
            `Path sample: ${pathParams.map((p) => `${p.name}=${p.example}`).join(', ')}`,
            { width },
          );
        }
        doc.moveDown(0.25);
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#1a1a1a').text('Sample call');
        const base = op.servers?.[0]?.url ?? core;
        code(curlFor(base, method, opPath, op));

        const req = requestExample(op);
        if (req?.kind === 'json') {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#1a1a1a').text('Sample request body');
          code(jsonBlock(req.value));
        }

        const success = Object.entries(op.responses ?? {}).find(([status]) => status.startsWith('2'));
        if (success) {
          const [status, response] = success;
          const example = exampleFromContent(response.content);
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#1a1a1a').text(`Sample response ${status}`);
          if (example !== undefined) code(jsonBlock(example));
          else doc.font('Helvetica').fontSize(9).fillColor('#333').text(response.description ?? 'No JSON body', { width });
        }
        doc.moveDown(0.35);
        doc.strokeColor('#e4e4e4').moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
        doc.moveDown(0.45);
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor('#777').text(
        `Bing Chun API  ·  ${i + 1} / ${range.count}`,
        doc.page.margins.left,
        doc.page.height - 32,
        { width, align: 'right' },
      );
    }

    doc.end();
  });
}

let cached: Buffer | null = null;

export async function getApiPdf(spec: OpenApiSpec = getOpenApiSpec()): Promise<Buffer> {
  if (!cached) cached = await renderPdf(spec);
  return cached;
}
