import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from '../db/client.js';
import { imports } from '../db/schema.js';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// File type is verified by binary signature, never by the claimed extension
// or MIME type (both are trivially spoofable by renaming a file): .xlsx is an
// OOXML zip archive (starts with the "PK" local-file-header signature), .xls
// is a legacy OLE2 compound file.
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.length <= bytes.length && signature.every((byte, i) => bytes[i] === byte);
}

export function sniffExcelType(bytes: Uint8Array): 'xlsx' | 'xls' | null {
  if (startsWith(bytes, ZIP_SIGNATURE)) return 'xlsx';
  if (startsWith(bytes, OLE_SIGNATURE)) return 'xls';
  return null;
}

// Stores the file under a generated identifier (never the original filename)
// on the shared uploads volume. Original files are never deleted by
// application code (see architecture.md).
export async function saveUploadedFile(
  uploadsDir: string,
  buffer: Buffer,
  type: 'xlsx' | 'xls',
): Promise<string> {
  await mkdir(uploadsDir, { recursive: true });
  const filePath = join(uploadsDir, `${randomUUID()}.${type}`);
  await writeFile(filePath, buffer);
  return filePath;
}

export async function createImport(
  db: Db,
  params: { originalFilename: string; filePath: string },
): Promise<{ id: number }> {
  const [row] = await db
    .insert(imports)
    .values({ originalFilename: params.originalFilename, filePath: params.filePath })
    .returning({ id: imports.id });
  if (!row) throw new Error('Expected the import row to come back from the insert.');
  return row;
}
