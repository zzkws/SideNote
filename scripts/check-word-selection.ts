import { readSelection } from '../src/content/selection';
import { buildDoc, type RawItem } from '../src/pdf/layout';
import { DocIndex, readPdfSelection } from '../src/pdf/select';
import { wholeWordBounds } from '../src/shared/word-selection';
import { buildMessages, SYSTEM } from '../src/background/prompt';

/** 浏览器回归：同一套生产选择逻辑，检查发送文字、偏移、原生高亮及反向选择。 */
export function run() {
  let checks = 0;
  const equal = (actual: unknown, expected: unknown) => {
    checks++;
    if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  for (const token of ['representation', 'one-class', 'teacher’s', 'ResNet50', 'naïve']) {
    const text = `The ${token} model.`;
    for (let start = 4; start < 4 + token.length; start++) {
      if (!/[\p{Script=Latin}0-9]/u.test(text[start])) continue;
      const bounds = wholeWordBounds(text, start, start + 1);
      equal(text.slice(bounds.start, bounds.end), token);
    }
  }
  for (const [text, start, end, expected] of [
    ['shallow neural architectures', 2, 24, 'shallow neural architectures'],
    ['word next', 0, 4, 'word'],
    ['word next', 0, 5, 'word'],
    ['(word), next', 2, 4, 'word'],
    ['a—word', 3, 5, 'word'],
    ['α + β', 0, 1, 'α'],
    ['x + y', 0, 1, 'x'],
    ['  ', 0, 2, ''],
  ] as const) {
    const b = wholeWordBounds(text, start, end);
    equal(text.slice(b.start, b.end), expected);
  }
  const fixture = document.createElement('section');
  document.body.append(fixture);
  const select = (a: Node, from: number, b: Node, to: number, backwards = false) => {
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(backwards ? b : a, backwards ? to : from,
      backwards ? a : b, backwards ? from : to);
  };
  try {
    fixture.innerHTML = '<p id="phrase">The shal<em>low neu</em>ral architectures help.</p>';
    const p = fixture.querySelector('p')!;
    for (const backwards of [false, true]) {
      select(p.firstChild!, 6, p.lastChild!, 10, backwards);
      equal(readSelection()?.word, 'shallow neural architectures');
      equal(window.getSelection()!.toString(), 'shallow neural architectures');
      if (backwards) equal(window.getSelection()!.focusOffset, 4);
    }
    fixture.innerHTML = '<p>first<br>second</p>';
    const line = fixture.querySelector('p')!;
    select(line.lastChild!, 1, line.lastChild!, 4);
    equal(readSelection()?.word, 'second');
    select(line.firstChild!, 1, line.firstChild!, 3);
    equal(readSelection()?.word, 'first');
    fixture.innerHTML = '<p>alpha <em>beta</em> gamma</p>';
    const element = fixture.querySelector('p')!;
    select(element.firstChild!, 2, element, 2);
    equal(readSelection()?.word, 'alpha beta');
    fixture.innerHTML = '<p>α + β</p>';
    select(fixture.querySelector('p')!.firstChild!, 0, fixture.querySelector('p')!.firstChild!, 1);
    equal(readSelection()?.word, 'α');

    const raw = (str: string, y: number): RawItem => ({str, width: 240, height: 10, transform: [10,0,0,10,40,y]});
    const pages = [{width: 600, height: 800, items: [
      raw('Anomaly detec-', 700), raw('tion uses neural networks.', 688),
      raw('A one-class model improves efficiency.', 640),
    ]}];
    const doc = buildDoc(pages);
    equal(doc.text.includes('Anomaly detection uses neural networks.'), true);
    const idx = new DocIndex(doc);
    fixture.innerHTML = '<div class="textLayer"></div>';
    const layer = fixture.firstElementChild!;
    const spans = pages[0].items.map((item, i) => {
      const span = document.createElement('span');
      span.dataset.p = '0'; span.dataset.i = String(i); span.textContent = item.str;
      layer.append(span);
      return span;
    });
    const pdfCase = (a: number, from: number, b: number, to: number, expected: string, highlight: string, backwards = false) => {
      select(spans[a].firstChild!, from, spans[b].firstChild!, to, backwards);
      const pick = readPdfSelection(idx)!;
      equal(pick?.word, expected);
      equal(window.getSelection()!.toString(), highlight);
      equal(doc.text.slice(pick.selectionStart, pick.selectionEnd), expected);
      equal(buildMessages({...pick, article:doc.text, title:'Test',url:''})[1].content.toString().includes(`【选中】${expected}`), true);
    };
    pdfCase(0, 10, 0, 12, 'detection', 'detec-tion');
    pdfCase(1, 0, 1, 2, 'detection', 'detec-tion');
    pdfCase(0, 10, 1, 2, 'detection', 'detec-tion', true);
    pdfCase(0, 10, 1, 15, 'detection uses neural', 'detec-tion uses neural');
    pdfCase(2, 4, 2, 8, 'one-class', 'one-class');
    const ligatureDoc = buildDoc([{width:600, height:800, items:[raw('An efﬁcient model.',700)]}]);
    layer.replaceChildren();
    const span = document.createElement('span');
    span.dataset.p='0';span.dataset.i='0';span.textContent='An efﬁcient model.';layer.append(span);
    select(span.firstChild!, 5, span.firstChild!, 6);
    equal(readPdfSelection(new DocIndex(ligatureDoc))?.word, 'efficient');
    equal(window.getSelection()!.toString(), 'efﬁcient');
    equal(SYSTEM.includes('**英文释意**'), false);
    return {passed:true,checks};
  } finally {
    window.getSelection()?.removeAllRanges();
    fixture.remove();
  }
}
