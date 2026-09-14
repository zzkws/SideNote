import type { PDFPageProxy } from 'pdfjs-dist';
import type { PdfPageImage } from '../shared/types';

export const MAX_VISUAL_PAGES = 12;

/** 当前页供公式排版核对；此前有图表说明的页面供插图上下文。 */
export function visualPages(current: number, captionPages: number[]): number[] {
  const pages = [...new Set([...captionPages.filter(p => p <= current), current])].sort((a, b) => a - b);
  return pages.slice(-MAX_VISUAL_PAGES);
}

/** 独立画布不受当前缩放、滚动和屏幕像素比影响，也不需要截图权限。 */
export class PdfVisualContext {
  private cache = new Map<number, Promise<PdfPageImage>>();

  async collect(pages: PDFPageProxy[], indices: number[]): Promise<PdfPageImage[]> {
    const result: PdfPageImage[] = [];
    for (const index of indices) {
      let image = this.cache.get(index);
      if (!image) {
        image = this.render(pages[index], index);
        this.cache.set(index, image);
        image.catch(() => this.cache.delete(index));
      }
      result.push(await image);
    }
    for (const key of this.cache.keys()) if (!indices.includes(key)) this.cache.delete(key);
    return result;
  }

  private async render(page: PDFPageProxy, index: number): Promise<PdfPageImage> {
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1800 / Math.max(base.width, base.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    try {
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
      return { page: index + 1, dataUrl: canvas.toDataURL('image/jpeg', 0.88) };
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
}
