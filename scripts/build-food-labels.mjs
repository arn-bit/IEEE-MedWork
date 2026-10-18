#!/usr/bin/env node
/**
 * Developer tool (not part of the app build): turns the food names in src/nutrition/{foods,world}.ts
 * into CLIP text vectors, so the app only needs CLIP's IMAGE model at runtime.
 *
 *   npm i --no-save @huggingface/transformers      (dev-time only; not a project dependency)
 *   node scripts/build-food-labels.mjs
 *
 * Output (committed, ~0.7 MB):
 *   public/models/food/clip_labels.json   the food ids, in order
 *   public/models/food/clip_text.bin      Float32 [labels x 512], each row L2-normalised
 *
 * Text model: Xenova/clip-vit-base-patch32 (OpenAI CLIP, MIT), the same family as the image model the app ships.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rowRe = /^\s*\['([a-z0-9_]+)',\s*'((?:[^'\\]|\\.)+)',\s*\d/;

function readRows(file) {
  const out = [];
  for (const line of readFileSync(join(root, file), 'utf8').split(/\r?\n/)) {
    const m = rowRe.exec(line);
    if (m) out.push({ id: m[1], name: m[2].replace(/\\'/g, "'") });
  }
  return out;
}

const rows = [...readRows('src/nutrition/foods.ts'), ...readRows('src/nutrition/world.ts')];
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.id)) throw new Error(`duplicate food id: ${r.id}`);
  seen.add(r.id);
}
console.log(`[labels] ${rows.length} foods`);

const MODEL = 'Xenova/clip-vit-base-patch32';
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });

const TEMPLATES = (n) => [`a photo of ${n}, a type of food.`, `a close-up photo of ${n}.`, `a plate of ${n}.`];
const DIM = 512;
const out = new Float32Array(rows.length * DIM);

const norm = (v) => {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return v.map((x) => x / s);
};

for (let i = 0; i < rows.length; i++) {
  const name = rows[i].name.toLowerCase();
  const inputs = tokenizer(TEMPLATES(name), { padding: true, truncation: true });
  const { text_embeds } = await textModel(inputs);
  const acc = new Float32Array(DIM);
  const n = text_embeds.dims[0];
  for (let t = 0; t < n; t++) {
    const v = norm(Array.from(text_embeds.data.slice(t * DIM, (t + 1) * DIM)));
    for (let d = 0; d < DIM; d++) acc[d] += v[d] / n;
  }
  out.set(norm(Array.from(acc)), i * DIM);
  if (i % 40 === 0) console.log(`[labels] ${i}/${rows.length}`);
}

const dir = join(root, 'public', 'models', 'food');
writeFileSync(join(dir, 'clip_labels.json'), JSON.stringify(rows.map((r) => r.id)));
writeFileSync(join(dir, 'clip_text.bin'), Buffer.from(out.buffer));
console.log(`[labels] wrote ${rows.length} labels and ${out.byteLength} bytes of vectors`);
