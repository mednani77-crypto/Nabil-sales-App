import { useRef } from 'react';
import { compressImage } from '../lib/media';
import { Icon } from './Icon';

/** Big dashed box: take a photo of the transfer receipt or pick one from the gallery. */
export function PhotoPicker({ preview, onPick, label = 'إرفاق صورة إشعار التحويل' }: { preview: string | null; onPick: (b: Blob) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      style={{ cursor: 'pointer', border: `2px dashed ${preview ? 'var(--teal)' : 'var(--line2)'}`, background: preview ? '#f0faf8' : '#fff', borderRadius: 20, padding: 14, display: 'flex', alignItems: 'center', gap: 14, textAlign: 'right', color: 'var(--ink)' }}
    >
      {preview ? (
        <img src={preview} alt="صورة الإشعار" style={{ width: 58, height: 74, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line2)', flex: 'none' }} />
      ) : (
        <span className="avatar" style={{ width: 58, height: 58, borderRadius: 16 }}><Icon name="camera" /></span>
      )}
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 600 }}>{preview ? 'تم إرفاق الصورة' : label}</span>
        <span className="sub" style={{ fontSize: 12.5 }}>{preview ? 'اضغط للتغيير' : 'من الكاميرا أو المعرض — لمشاركتها في واتساب'}</span>
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onPick(await compressImage(f));
        }}
      />
    </button>
  );
}
