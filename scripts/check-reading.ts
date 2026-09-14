import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDoc, cleanFragment, type RawItem } from '../src/pdf/layout';
import { DocIndex } from '../src/pdf/select';
import { buildMessages, buildFollowupMessages, messageText, readContext, SYSTEM } from '../src/background/prompt';
import { buildRequestBody } from '../src/background/deepseek';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import { visualPages } from '../src/pdf/visual';

const input = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { pages: {width: number; height: number; items: RawItem[]}[] };
const doc = buildDoc(input.pages);
const idx = new DocIndex(doc);
for (const s of doc.spans) {
  const raw = input.pages[s.page].items[s.index].str;
  const clean = cleanFragment(raw).text;
  const actual = doc.text.slice(s.start, s.end);
  assert.ok(actual === clean || actual === clean.replace(/[-‐]$/, ''), `item mapping ${s.page}:${s.index}`);
  assert.ok(s.offsets?.every((n, i, arr) => n >= 0 && n <= actual.length && (!i || n >= arr[i-1])));
}
const expected = input.pages.flatMap((p, pi) => p.items.flatMap((it, i) =>
  !it.str.trim() || (/arXiv:/i.test(it.str) && Math.abs(it.transform[1]) > Math.abs(it.transform[0])) ||
  (/^\d{1,5}$/.test(it.str) && (it.transform[5] < p.height * .06 || it.transform[5] > p.height * .96)) ? [] : [`${pi}:${i}`]));
const present = new Set(doc.spans.map(s => `${s.page}:${s.index}`));
assert.ok(expected.every(k => present.has(k)), 'every substantive source item preserved');
assert.equal(present.size, doc.spans.length, 'no duplicate source items');
const captionSpan = doc.spans.find(s => s.start > doc.bodyEnd);
if (captionSpan) assert.ok(idx.contextEndFor(captionSpan.start, captionSpan.page)! >= captionSpan.end);
if (doc.text.includes('Reverse Distillation')) {
  for (const phrase of ['Hanqiu Deng Xingyu Li', 'pseudo-outlier augmentation', 'encoder on ImageNet',
    'model in our reverse distillation', 'The motivation behind this is that shallow layers']) assert.ok(doc.text.includes(phrase), phrase);
  assert.ok(doc.captions.find(c => c.text.startsWith('Figure 3.'))?.text.includes('teacher encoder E, a trainable'));
  assert.ok(doc.captions.find(c => c.text.startsWith('Table 2.'))?.text.includes('on MVTec [3]. AUROC'));
}
const position = doc.text.indexOf('shallow') >= 0 ? doc.text.indexOf('shallow') : 2000;
const para = idx.paragraphAt(position)!;
const q = { word: doc.text.slice(position, position + 7), sentence: para.text, paragraph: para.text,
  article: doc.text, title: 'Paper', url: '', selectionStart: position, selectionEnd: position + 7 };
const context = readContext(doc.text, 'intentionally wrong paragraph', position, position + 7);
assert.ok(context.startsWith(doc.text.slice(0, position + 7)), 'exact prefix preserved');
assert.ok(context.includes(doc.text.slice(position + 7, position + 1007)), '1000 following characters preserved');
assert.equal(buildMessages(q)[0].content, SYSTEM);
const withImage = { ...q, pdfImages: [{ page: 1, dataUrl: 'data:image/jpeg;base64,dGVzdA==' }] };
const body = buildRequestBody(DEFAULT_SETTINGS, buildMessages(withImage));
assert.equal(body.model, 'deepseek-v4-flash-vision-exp');
const parts = body.messages.at(-1)!.content;
assert.ok(Array.isArray(parts) && parts.some(p => p.type === 'image_url'));
assert.equal(buildFollowupMessages(withImage, [{role:'assistant',content:'Answer'}], 'Question').at(-1)!.content, 'Question');
assert.ok(messageText(body.messages.at(-1)!).includes('第 1 页'));
assert.equal(buildRequestBody(DEFAULT_SETTINGS, buildMessages(q)).model, 'deepseek-v4-flash');
assert.deepEqual(visualPages(3, [0, 1, 8]), [0, 1, 3]);
assert.equal(visualPages(30, Array.from({length:30}, (_,i)=>i)).length, 12);
console.log(JSON.stringify({passed:true, pages:input.pages.length, chars:doc.text.length,
  preservedItems:present.size, captions:doc.captions.length, contextChars:context.length}));
