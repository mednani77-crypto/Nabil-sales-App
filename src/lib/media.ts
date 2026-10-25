import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { latestAttachment } from '../db/repo';

/** Shrink a camera photo so storage and sync stay light (max side 1600px, JPEG). */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', quality));
  } catch {
    return file;
  }
}

/** Object URL of the latest photo attached to an operation (revoked automatically). */
export function useAttachmentUrl(opId: string | undefined): string | null {
  const att = useLiveQuery(() => (opId ? latestAttachment(db, opId) : undefined), [opId]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!att) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(att.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [att]);
  return url;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export type ShareResult = 'shared' | 'cancelled' | 'unavailable';

/**
 * Open the phone's share sheet with the notice photo + text (Nabil picks the WhatsApp group).
 * The app cannot know whether the message really reached the group, so callers ask him afterwards.
 */
export async function shareImageAndText(blob: Blob | undefined, text: string, fileName: string): Promise<ShareResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      const files: string[] = [];
      if (blob) {
        const w = await Filesystem.writeFile({ path: fileName, data: await blobToBase64(blob), directory: Directory.Cache });
        files.push(w.uri);
      }
      await Share.share({ text, files: files.length ? files : undefined, dialogTitle: 'مشاركة الإشعار' });
      return 'shared';
    }
    if (blob && navigator.canShare?.({ files: [new File([blob], fileName, { type: blob.type || 'image/jpeg' })] })) {
      await navigator.share({ text, files: [new File([blob], fileName, { type: blob.type || 'image/jpeg' })] });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    return 'shared';
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/cancel|abort/i.test(msg)) return 'cancelled';
    return 'unavailable';
  }
}
