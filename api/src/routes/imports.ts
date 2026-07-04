import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { resolve } from 'node:path';
import type { AppEnv } from '../types.js';
import { requireSession } from '../middleware/requireSession.js';
import { db } from '../db/client.js';
import {
  MAX_UPLOAD_BYTES,
  sniffExcelType,
  saveUploadedFile,
  createImport,
} from '../services/imports.js';

// Shared volume between api and worker (see architecture.md). Defaults to the
// repo-root `uploads/` folder for local dev, where both processes run with
// api/ as cwd.
const UPLOADS_DIR = process.env['UPLOADS_DIR'] ?? resolve(process.cwd(), '../uploads');

const imports = new Hono<AppEnv>();

imports.use('*', requireSession);

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

export default imports;
