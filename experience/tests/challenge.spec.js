import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

for (const [name, destination, challenged, showNotice] of [
  ['Claude challenge document', 'iframe', true, true],
  ['ordinary forbidden document', 'iframe', false, false],
  ['challenged API request', '', true, false],
]) {
  test(name, async () => {
    const source = await readFile(new URL('../site/sw.js', import.meta.url), 'utf8');
    const upstream = new Response('upstream body', {
      status: 403,
      headers: challenged ? { 'cf-mitigated': 'challenge' } : {},
    });
    const context = {
      importScripts() {},
      UVServiceWorker: class {
        route() { return true; }
        fetch() { return upstream; }
      },
      self: { addEventListener() {} },
      experienceConfig: { prefix: '/service/', decodeUrl: decodeURIComponent },
      location: { origin: 'https://experience.test' },
      fetch: async path => new Response(await readFile(new URL('../site' + path, import.meta.url), 'utf8')),
      Response, URL,
    };
    runInNewContext(source, context);
    const response = await context.loadExperience({ request: {
      url: 'https://experience.test/service/' + encodeURIComponent('https://claude.ai/login'),
      destination,
      mode: 'navigate',
    } });
    expect(response.status).toBe(403);
    const body = await response.text();
    if (showNotice) {
      expect(body).toContain('Open Claude directly');
      expect(body).toContain('href="https://claude.ai/"');
      expect(response.headers.get('cache-control')).toBe('no-store');
    } else {
      expect(body).toBe('upstream body');
    }
  });
}
