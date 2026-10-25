import { toPng } from 'html-to-image';

export async function exportCanvasPng(title: string) {
  const el = document.querySelector<HTMLElement>('.react-flow');
  if (!el) throw new Error('Canvas not found');
  const dataUrl = await toPng(el, {
    backgroundColor: '#07090f',
    pixelRatio: 2,
    filter: (node) => {
      const cls = (node as HTMLElement).classList;
      return !cls?.contains('react-flow__minimap') && !cls?.contains('react-flow__controls');
    },
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase() || 'design'}.png`;
  a.click();
}
