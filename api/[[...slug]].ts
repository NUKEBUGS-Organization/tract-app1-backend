import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import 'reflect-metadata';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';

let handler: ReturnType<typeof serverless> | undefined;

export default async function (req: VercelRequest, res: VercelResponse) {
  try {
    if (!handler) {
      const entry = pathToFileURL(join(process.cwd(), 'dist', 'serverless.js')).href;
      const { getCachedExpressApp } = (await import(entry)) as {
        getCachedExpressApp: () => Promise<import('express').Express>;
      };
      const expressApp = await getCachedExpressApp();
      handler = serverless(expressApp);
    }
    return handler(req, res);
  } catch (err) {
    console.error('[api] bootstrap failed', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server bootstrap failed', error: String(err) });
    }
  }
}
