declare module 'swagger-ui-express' {
  import type { RequestHandler } from 'express';

  export interface SwaggerSetupOptions {
    customCss?: string;
    customSiteTitle?: string;
    customJs?: string;
    customJsStr?: string;
    swaggerOptions?: Record<string, unknown>;
  }

  export const serve: RequestHandler[];
  export function setup(swaggerDoc: object, options?: SwaggerSetupOptions): RequestHandler;
}
