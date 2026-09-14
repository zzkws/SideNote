import { readFileSync, writeFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildDoc, type RawItem } from '../src/pdf/layout';

const file = process.argv[2];
const output = process.argv[3];
const task = getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true });
const pdf = await task.promise;
const pages = [];
for (let n = 1; n <= pdf.numPages; n++) {
  const page = await pdf.getPage(n);
  const tc = await page.getTextContent();
  pages.push({ width: page.getViewport({ scale: 1 }).width, height: page.getViewport({ scale: 1 }).height,
    items: tc.items.filter((i) => 'str' in i) as RawItem[] });
}
const doc = buildDoc(pages);
writeFileSync(output + '.txt', doc.text);
writeFileSync(output + '.json', JSON.stringify({ pages, doc }));
console.log(JSON.stringify({ pages: pages.length, chars: doc.text.length, spans: doc.spans.length,
  shallow: doc.text.slice(doc.text.indexOf('shallow') - 300, doc.text.indexOf('shallow') + 300),
  outsideSpans: doc.spans.filter(s => s.start < 0 || s.end > doc.text.length || s.start > s.end).length }, null, 2));
await task.destroy();
