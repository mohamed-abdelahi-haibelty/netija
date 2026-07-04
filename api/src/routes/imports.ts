import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { resolve } from 'node:path';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../types.js';
import { requireSession } from '../middleware/requireSession.js';
import { db } from '../db/client.js';
import {
  MAX_UPLOAD_BYTES,
  sniffExcelType,
  saveUploadedFile,
  createImport,
} from '../services/imports.js';
import { previewImport, UnsupportedFileTypeError } from '../services/preview.js';
import { confirmImport, MissingRequiredColumnsError } from '../services/confirm.js';
import { getImportStatus } from '../services/importStatus.js';
import { listImports } from '../services/importList.js';
import { getRejectReport, toRejectReportCsv } from '../services/rejects.js';
import { publishImport, unpublishImport, SmokeNotPassedError } from '../services/publish.js';
import { importQueue } from '../lib/queue.js';
import { meili } from '../lib/meili.js';
import { redis } from '../lib/redis.js';
import { importIdParamSchema } from '../schemas/preview.js';
import { confirmImportBodySchema } from '../schemas/confirm.js';

// Shared volume between api and worker (see architecture.md). Defaults to the
// repo-root `uploads/` folder for local dev, where both processes run with
// api/ as cwd.
const UPLOADS_DIR = process.env['UPLOADS_DIR'] ?? resolve(process.cwd(), '../uploads');

const imports = new Hono<AppEnv>();

imports.use('*', requireSession);

imports.get('/', async (c) => {
  const rows = await listImports(db);
  return c.json({ data: rows }, 200);
});

imports.post('/', async (c) => {
  const body = await c.req.parseBody({ all: true });
  const field = body['file'];

  if (field === undefined || typeof field === 'string') {
    throw new HTTPException(400, { message: 'A single Excel file is required.' });
  }
  if (Array.isArray(field)) {
    throw new HTTPException(400, { message: 'Only one file may be uploaded at a time.' });
  }

  const file = field;
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HTTPException(413, { message: 'File exceeds the 25 MB limit.' });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const type = sniffExcelType(buffer);
  if (type === null) {
    throw new HTTPException(415, { message: 'Only .xlsx and .xls files are accepted.' });
  }

  const filePath = await saveUploadedFile(UPLOADS_DIR, buffer, type);
  const row = await createImport(db, { originalFilename: file.name, filePath });

  return c.json({ data: { importId: row.id } }, 201);
});

imports.get(
  '/:id/preview',
  zValidator('param', importIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid import id',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    let result;
    try {
      result = await previewImport(db, id);
    } catch (err) {
      if (err instanceof UnsupportedFileTypeError) {
        // err.message is the raw Python exception text (e.g. a pandas/xlrd
        // ImportError) — never shown to the client per error-handling.md
        // ("users never see... raw driver errors"); it's still on the
        // Error object for server-side logs if needed.
        throw new HTTPException(415, {
          message: 'This file could not be read. Make sure it is a valid, uncorrupted .xlsx or .xls file.',
          cause: { code: 'UNSUPPORTED_FILE_TYPE' },
        });
      }
      throw err;
    }
    if (result === null) {
      throw new HTTPException(404, {
        message: 'Import not found.',
        cause: { code: 'IMPORT_NOT_FOUND' },
      });
    }
    return c.json({ data: result }, 200);
  },
);

imports.post(
  '/:id/confirm',
  zValidator('param', importIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid import id',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  }),
  zValidator('json', confirmImportBodySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid confirm payload',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    let result;
    try {
      result = await confirmImport(db, importQueue, id, body);
    } catch (err) {
      if (err instanceof MissingRequiredColumnsError) {
        throw new HTTPException(422, {
          message: err.message,
          cause: { code: 'MISSING_REQUIRED_COLUMNS' },
        });
      }
      throw err;
    }

    if (result === null) {
      throw new HTTPException(404, {
        message: 'Import not found.',
        cause: { code: 'IMPORT_NOT_FOUND' },
      });
    }
    return c.json({ data: result }, 202);
  },
);

imports.get(
  '/:id/status',
  zValidator('param', importIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid import id',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await getImportStatus(db, id);
    if (result === null) {
      throw new HTTPException(404, {
        message: 'Import not found.',
        cause: { code: 'IMPORT_NOT_FOUND' },
      });
    }
    return c.json({ data: result }, 200);
  },
);

imports.get(
  '/:id/rejects',
  zValidator('param', importIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid import id',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const rows = await getRejectReport(db, id);
    if (rows === null) {
      throw new HTTPException(404, {
        message: 'Import not found.',
        cause: { code: 'IMPORT_NOT_FOUND' },
      });
    }
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="import-${String(id)}-rejects.csv"`);
    c.header('Cache-Control', 'no-store');
    return c.body(toRejectReportCsv(rows));
  },
);

imports.post(
  '/:id/publish',
  zValidator('param', importIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid import id',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    let result;
    try {
      result = await publishImport(db, meili, redis, id);
    } catch (err) {
      if (err instanceof SmokeNotPassedError) {
        throw new HTTPException(409, {
          message: err.message,
          cause: { code: 'SMOKE_NOT_PASSED' },
        });
      }
      throw err;
    }

    if (result === null) {
      throw new HTTPException(404, {
        message: 'Import not found.',
        cause: { code: 'IMPORT_NOT_FOUND' },
      });
    }
    return c.json({ data: result }, 200);
  },
);

imports.post(
  '/:id/unpublish',
  zValidator('param', importIdParamSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid import id',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await unpublishImport(db, meili, redis, id);
    if (result === null) {
      throw new HTTPException(404, {
        message: 'Import not found.',
        cause: { code: 'IMPORT_NOT_FOUND' },
      });
    }
    return c.json({ data: result }, 200);
  },
);

export default imports;
