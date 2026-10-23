// Turn a PDF challan into one image per page, in the phone's browser. Each page is then read like a photo and becomes
// its own lot (one page = one lot). Images instead of the PDF itself keep the AI step on the cheap photo path.
// The worker file in public/ is copied from node_modules/pdfjs-dist/build/pdf.worker.min.mjs; copy it again if
// pdfjs-dist is upgraded, or pages fail with a version-mismatch error.
export const MAX_PAGES = 20;

export async function pdfPages(file: File, longestSide = 1600): Promise<{ pages: HTMLCanvasElement[]; total: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: HTMLCanvasElement[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: longestSide / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    pages.push(canvas);
  }
  const total = doc.numPages;
  void doc.destroy();
  return { pages, total };
}
