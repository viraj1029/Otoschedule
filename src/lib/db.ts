import { sql } from '@vercel/postgres';

// Re-export the sql tag for use in API routes.
// @vercel/postgres reads POSTGRES_URL from the environment automatically.
export { sql };
