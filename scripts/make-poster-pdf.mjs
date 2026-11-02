#!/usr/bin/env node
/**
 * Saves the poster as a full-size PDF (48 x 36 in) and a preview image.
 *
 *   npm run build && npm run preview     (in another terminal, serves http://localhost:4180)
 *   node scripts/make-poster-pdf.mjs [url]
 *
 * Output: poster/verimove-poster.pdf and poster/verimove-poster-preview.png
 * Uses the Playwright already installed for the browser tests (Microsoft Edge).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4180/poster';
mkdirSync('poster', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1800, height: 1400 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: 'poster/verimove-poster.pdf', width: '48in', height: '36in', printBackground: true, preferCSSPageSize: true });
await page.emulateMedia({ media: 'screen' });
await page.screenshot({ path: 'poster/verimove-poster-preview.png' });
await browser.close();
console.log('Wrote poster/verimove-poster.pdf and poster/verimove-poster-preview.png');
