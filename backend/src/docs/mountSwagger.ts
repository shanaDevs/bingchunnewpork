import type { Express, Request, Response, NextFunction } from 'express';
import swaggerUi from 'swagger-ui-express';
import { getOpenApiSpec } from './openapi';
import { getApiPdf } from './apiPdf';

const PDF_BUTTON_JS = `
(function () {
  function docsBase() {
    return window.location.pathname.indexOf('/api/docs') === 0 ? '/api/docs' : '/api-docs';
  }
  function mount() {
    var bar = document.querySelector('.topbar-wrapper') || document.querySelector('.topbar .wrapper') || document.querySelector('.topbar');
    var link = document.getElementById('bc-pdf-btn');
    if (!link) {
      link = document.createElement('a');
      link.id = 'bc-pdf-btn';
      link.className = 'bc-pdf-btn';
      link.href = docsBase() + '/bingchun-api.pdf';
      link.setAttribute('download', 'Bing-Chun-API.pdf');
      link.textContent = 'Download PDF';
    }
    if (!bar) {
      link.classList.add('is-float');
      if (!link.parentNode) document.body.appendChild(link);
      return false;
    }
    link.classList.remove('is-float');
    bar.appendChild(link);
    return true;
  }
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (mount() || tries > 50) clearInterval(timer);
  }, 200);
})();
`;

function relaxDocsCsp(_req: Request, res: Response, next: NextFunction) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' http: https:",
      "frame-ancestors 'self'",
    ].join('; '),
  );
  next();
}

const swaggerCss = `
.swagger-ui .topbar { background: #1d4e89; }
.swagger-ui .topbar-wrapper { display: flex; align-items: center; gap: 12px; }
.bc-pdf-btn {
  margin-left: auto;
  background: #49cc90;
  color: #083321;
  font-weight: 700;
  text-decoration: none;
  padding: 8px 14px;
  border-radius: 4px;
  font-family: sans-serif;
  font-size: 14px;
  line-height: 1;
}
.bc-pdf-btn.is-float {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 9999;
}
`;

/**
 * Swagger UI for the full API, plus a PDF export of the same document.
 * Served at /api/docs (works when ingress only forwards /api) and /api-docs.
 */
export function mountSwagger(app: Express): void {
  const spec = getOpenApiSpec();
  const sendSpec = (_req: Request, res: Response) => {
    res.json(spec);
  };
  const sendPdf = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const pdf = await getApiPdf(spec);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="Bing-Chun-API.pdf"');
      res.setHeader('Content-Length', String(pdf.length));
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  };
  const sendButton = (_req: Request, res: Response) => {
    res.type('application/javascript').send(PDF_BUTTON_JS);
  };

  app.get(['/api/docs/openapi.json', '/api-docs/openapi.json'], sendSpec);
  app.get(['/api/docs/bingchun-api.pdf', '/api-docs/bingchun-api.pdf'], sendPdf);
  app.get(['/api/docs/pdf-button.js', '/api-docs/pdf-button.js'], sendButton);

  const ui = swaggerUi.setup(spec, {
    customSiteTitle: 'Bing Chun API',
    customCss: swaggerCss,
    customJs: '/api/docs/pdf-button.js',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      defaultModelsExpandDepth: 1,
      requestSnippetsEnabled: true,
    },
  });

  app.use('/api/docs', relaxDocsCsp, swaggerUi.serve, ui);
  app.use('/api-docs', relaxDocsCsp, swaggerUi.serve, ui);
}
