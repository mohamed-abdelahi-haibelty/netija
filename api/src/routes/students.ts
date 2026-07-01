import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../types.js';
import { getStudentPage } from '../services/studentPage.js';
import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';

const paramsSchema = z.object({
  publicId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'publicId must contain only URL-safe characters'),
});

const students = new Hono<AppEnv>();

students.get(
  '/:publicId',
  zValidator('param', paramsSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid person ID',
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
    const { publicId } = c.req.valid('param');
    const result = await getStudentPage(db, redis, publicId);
    if (result === null) {
      throw new HTTPException(404, {
        message: 'Student not found.',
        cause: { code: 'STUDENT_NOT_FOUND' },
      });
    }
    return c.json({ data: result }, 200);
  },
);

export default students;
