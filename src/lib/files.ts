import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/** On the phone: open the share sheet (WhatsApp, Drive, Files…). On a computer: download the file. */
export async function saveOrShare(blob: Blob, fileName: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  try {
    if (Capacitor.isNativePlatform()) {
      const w = await Filesystem.writeFile({ path: fileName, data: await blobToBase64(blob), directory: Directory.Cache });
      await Share.share({ title, files: [w.uri], dialogTitle: title });
      return 'shared';
    }
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare?.({ files: [file] }) && /android|iphone/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return 'downloaded';
  } catch (e) {
    if (/cancel|abort/i.test(String((e as Error)?.message ?? e))) return 'cancelled';
    throw e;
  }
}

/** Render A4 page elements (794×1123 CSS px each) into one PDF. The browser draws the text, so
 *  Arabic shaping and Ethiopic script come out exactly as on screen. */
export async function pagesToPdf(pages: HTMLElement[]): Promise<Blob> {
  const [{ jsPDF }, { toJpeg }] = await Promise.all([import('jspdf'), import('html-to-image')]);
  await document.fonts.ready;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < pages.length; i++) {
    const url = await toJpeg(pages[i], { quality: 0.92, pixelRatio: 2, backgroundColor: '#ffffff', width: 794, height: 1123, style: { transform: 'none' } });
    if (i > 0) pdf.addPage();
    pdf.addImage(url, 'JPEG', 0, 0, 210, 297);
  }
  return pdf.output('blob');
}
