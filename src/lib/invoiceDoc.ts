import { fmtMoney } from '../domain/money';
import { linesTotal } from '../domain/postings';
import type { SaleOp } from '../domain/types';
import { fmtDateDMY, I18N as ST, type Lang } from './statement';

/* Sales invoice text and labels in 5 languages. Item, unit and customer names, numbers and the
 * invoice number are never translated. so/am/om wording should be reviewed by a native speaker. */

interface InvDict {
  title: string;
  invoiceNo: string;
  date: string;
  customer: string;
  cashCustomer: string;
  item: string;
  qty: string;
  price: string;
  amount: string;
  total: string;
  paid: string;
  remaining: string;
  mode: Record<SaleOp['payMode'], string>;
  status: string;
  voided: string;
  currency: string;
  thanks: string;
  seller: string;
}

export const INV: Record<Lang, InvDict> = {
  ar: {
    title: 'فاتورة بيع', invoiceNo: 'رقم الفاتورة', date: 'التاريخ', customer: 'العميل', cashCustomer: 'بيع نقدي', item: 'الصنف', qty: 'الكمية',
    price: 'السعر', amount: 'المبلغ', total: 'الإجمالي', paid: 'المدفوع', remaining: 'المتبقي', mode: { cash: 'نقدي', credit: 'آجل', partial: 'دفع جزئي' },
    status: 'طريقة الدفع', voided: 'ملغاة', currency: 'بر', thanks: 'شكرًا لتعاملكم معنا', seller: 'المندوب',
  },
  en: {
    title: 'Sales Invoice', invoiceNo: 'Invoice no.', date: 'Date', customer: 'Customer', cashCustomer: 'Cash sale', item: 'Item', qty: 'Qty',
    price: 'Price', amount: 'Amount', total: 'Total', paid: 'Paid', remaining: 'Balance due', mode: { cash: 'Cash', credit: 'Credit', partial: 'Part payment' },
    status: 'Payment', voided: 'CANCELLED', currency: 'ETB', thanks: 'Thank you for your business', seller: 'Sales rep',
  },
  so: {
    title: 'Qaansheegta Iibka', invoiceNo: 'Lambarka qaansheegta', date: 'Taariikhda', customer: 'Macmiilka', cashCustomer: 'Iib caddaan ah', item: 'Alaabta', qty: 'Tirada',
    price: 'Qiimaha', amount: 'Lacagta', total: 'Wadarta', paid: 'La bixiyay', remaining: 'Haraaga', mode: { cash: 'Caddaan', credit: 'Deyn', partial: 'Qayb la bixiyay' },
    status: 'Habka lacag-bixinta', voided: 'LA JOOJIYAY', currency: 'Birr', thanks: 'Waad ku mahadsan tihiin ganacsigiinna', seller: 'Iibiyaha',
  },
  am: {
    title: 'የሽያጭ ደረሰኝ', invoiceNo: 'የደረሰኝ ቁጥር', date: 'ቀን', customer: 'ደንበኛ', cashCustomer: 'የጥሬ ገንዘብ ሽያጭ', item: 'ዕቃ', qty: 'ብዛት',
    price: 'ዋጋ', amount: 'መጠን', total: 'ጠቅላላ', paid: 'የተከፈለ', remaining: 'ቀሪ ዕዳ', mode: { cash: 'በጥሬ ገንዘብ', credit: 'በዱቤ', partial: 'በከፊል ክፍያ' },
    status: 'የክፍያ ሁኔታ', voided: 'ተሰርዟል', currency: 'ብር', thanks: 'ስለ ግብይትዎ እናመሰግናለን', seller: 'ሻጭ',
  },
  om: {
    title: 'Nagahee Gurgurtaa', invoiceNo: 'Lakkoofsa nagahee', date: 'Guyyaa', customer: 'Maamila', cashCustomer: 'Gurgurtaa maallaqa harkaa', item: 'Meeshaa', qty: 'Baay\'ina',
    price: 'Gatii', amount: 'Hanga', total: 'Waliigala', paid: 'Kan kaffalame', remaining: 'Kan hafe', mode: { cash: 'Maallaqa harkaa', credit: 'Liqii', partial: 'Kaffaltii walakkaa' },
    status: 'Akkaataa kaffaltii', voided: 'HAQAMEERA', currency: 'Birrii', thanks: 'Daldala keessaniif galatoomaa', seller: 'Gurguraa',
  },
};

export const invDir = (lang: Lang) => ST[lang].dir;
export const invFont = (lang: Lang) => ST[lang].font;

/** Plain-text invoice for WhatsApp. WhatsApp renders *bold*. */
export function invoiceText(s: SaleOp, customer: string | undefined, lang: Lang, voided = false): string {
  const L = INV[lang];
  const total = linesTotal(s.lines);
  const out = [
    `*${L.title} ${s.docNo}*${voided ? ` — ${L.voided}` : ''}`,
    `${L.date}: ${fmtDateDMY(s.date)}`,
    `${L.customer}: ${customer ?? L.cashCustomer}`,
    '',
    ...s.lines.flatMap((l) => [`• ${l.itemName}`, `   ${l.qty} × ${fmtMoney(l.unitPrice)} = ${fmtMoney(l.qty * l.unitPrice)}  (${l.unitName})`]),
    '',
    `*${L.total}: ${fmtMoney(total)} ${L.currency}*`,
    `${L.paid} (${L.mode[s.payMode]}): ${fmtMoney(s.paid)}`,
  ];
  if (total - s.paid > 0) out.push(`*${L.remaining}: ${fmtMoney(total - s.paid)} ${L.currency}*`);
  out.push('', `${L.seller}: نبيل عادل · SYSCO ADAWEH`);
  // Numbers come before the (Arabic) unit name: digits written after Arabic letters get reordered.
  // Item/customer names stay in Arabic, so pin each line's direction to the message language
  // (an invisible LRM/RLM mark) — otherwise WhatsApp flips English/Somali lines that contain Arabic.
  const mark = invDir(lang) === 'rtl' ? '\u200F' : '\u200E';
  return out.map((line) => (line ? mark + line : line)).join('\n');
}

const LANG_KEY = 'nabil.shareLang';
export function lastShareLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v && v in INV) return v as Lang;
  } catch {
    /* storage unavailable */
  }
  return 'ar';
}
export function rememberShareLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage unavailable */
  }
}
