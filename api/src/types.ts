// Inline auth session type matching Better Auth's response shape.
// Kept separate from the better-auth import so tests can mock lib/auth.ts
// without pulling in the full auth module graph.
export type AuthSession = {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
};

export type AppEnv = {
  Variables: {
    requestId: string;
    session?: AuthSession;
  };
};
