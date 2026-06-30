import fs from 'node:fs';
import path from 'node:path';

/**
 * README drift guard.
 *
 * The README's "API Endpoints" list duplicates the routes defined in `server.ts`.
 * That duplication rotted once (project-scoped rate cards, `/weekly-allocations`),
 * so this test keeps the two in sync: it parses the real routes out of `server.ts`
 * and the documented routes out of `README.md`, then asserts they match.
 *
 * If you add / remove / rename a route in `server.ts`, update the README's
 * API Endpoints list (routes are written there without the `/api` prefix).
 */

const ROOT = process.cwd();
const serverSource = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
const readmeSource = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Normalize a route so param names and the `/api` prefix don't cause false drift. */
function normalize(method: string, rawPath: string): string {
  let p = rawPath.replace(/^\/api/, ''); // README lists routes without the /api prefix
  p = p.replace(/:[A-Za-z0-9_]+/g, ':param'); // :id, :projectId, ... are interchangeable
  if (p.length > 1) p = p.replace(/\/+$/, ''); // drop trailing slash
  if (p === '') p = '/';
  return `${method.toUpperCase()} ${p}`;
}

/** Routes registered on the Express app, e.g. app.get('/api/projects/:id', ...). */
function routesFromServer(): Set<string> {
  const routes = new Set<string>();
  const re = new RegExp(
    `\\bapp\\.(${HTTP_METHODS.join('|')})\\s*\\(\\s*(['"\`])([^'"\`]+)\\2`,
    'g'
  );
  for (const m of serverSource.matchAll(re)) {
    const [, method, , routePath] = m;
    if (!routePath.startsWith('/api')) continue; // skip the SPA static catch-all etc.
    routes.add(normalize(method, routePath));
  }
  return routes;
}

/** Endpoints documented in the README, e.g. `GET /projects/:id`. */
function routesFromReadme(): Set<string> {
  const routes = new Set<string>();
  const re = /`(GET|POST|PUT|PATCH|DELETE)\s+(\/[^`]+)`/g;
  for (const m of readmeSource.matchAll(re)) {
    const [, method, routePath] = m;
    routes.add(normalize(method, routePath.trim()));
  }
  return routes;
}

const serverRoutes = routesFromServer();
const readmeRoutes = routesFromReadme();
const diff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();

describe('README API documentation', () => {
  it('parses a non-trivial number of routes from both sources (sanity)', () => {
    expect(serverRoutes.size).toBeGreaterThan(10);
    expect(readmeRoutes.size).toBeGreaterThan(10);
  });

  it('documents every route defined in server.ts', () => {
    const undocumented = diff(serverRoutes, readmeRoutes);
    expect(
      undocumented,
      `These routes exist in server.ts but are missing from the README API list:\n  ${undocumented.join(
        '\n  '
      )}`
    ).toEqual([]);
  });

  it('does not document routes that no longer exist in server.ts', () => {
    const phantom = diff(readmeRoutes, serverRoutes);
    expect(
      phantom,
      `These routes are documented in the README but do not exist in server.ts:\n  ${phantom.join(
        '\n  '
      )}`
    ).toEqual([]);
  });
});
