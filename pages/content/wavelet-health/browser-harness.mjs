import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { scenarioResult } from './report.mjs';

const here = path => fileURLToPath(new URL(path, import.meta.url));
const errorMessage = error => (error instanceof Error ? error.message : String(error));

export async function buildProbe(entry, name) {
  const built = await build({
    configFile: false,
    envFile: false,
    root: here('.'),
    publicDir: false,
    logLevel: 'warn',
    resolve: { alias: { 'webextension-polyfill': here('./runtime-stub.ts') } },
    build: { write: false, minify: false, lib: { entry: here(entry), name, formats: ['iife'] } },
  });
  const outputs = Array.isArray(built) ? built : [built];
  if (outputs.length !== 1 || !('output' in outputs[0])) throw new Error('Expected a single browser bundle');
  const chunk = outputs[0].output.find(output => output.type === 'chunk' && output.isEntry);
  if (!chunk) throw new Error('Browser bundle has no entry chunk');
  return chunk.code;
}

export async function runScenario({ browser, id, url, html, config, bundle, probeName, initialTime, check }) {
  const errors = [];
  let context;
  let assertions;
  try {
    context = await browser.newContext({ serviceWorkers: 'block', locale: 'en-US' });
    await context.route('**/*', route =>
      route.request().isNavigationRequest() && route.request().url() === url
        ? route.fulfill({ contentType: 'text/html', body: html })
        : route.abort(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('crash', () => errors.push('Browser page crashed'));
    await page.clock.install();
    await page.goto(url, { waitUntil: 'load' });
    await page.addScriptTag({ content: bundle });
    await page.evaluate(({ name, snapshot }) => window[name].start(snapshot), { name: probeName, snapshot: config });
    await page.clock.runFor(initialTime);
    const captures = () => page.evaluate(name => window[name].captures(), probeName);
    assertions = await check(await captures(), page, captures);
  } catch (error) {
    errors.push(errorMessage(error));
  } finally {
    try {
      await context?.close();
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  return scenarioResult(id, assertions ?? [], errors);
}
