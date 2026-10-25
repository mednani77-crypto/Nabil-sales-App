import { ledger } from '../domain/balances';
import type { Santim } from '../domain/money';
import type { AccountKey, CompanyBank, Customer, Operation, PayDestination, Posting } from '../domain/types';

/* Account statements in 5 languages. Names, amounts and reference numbers are never translated.
 * Amharic/Somali/Oromo wording should be reviewed by a native speaker before official use. */

export type Lang = 'ar' | 'en' | 'so' | 'am' | 'om';
export const LANGS: { code: Lang; name: string }[] = [
  { code: 'ar', name: 'العربية' },
  { code: 'en', name: 'English' },
  { code: 'so', name: 'Soomaali' },
  { code: 'am', name: 'አማርኛ' },
  { code: 'om', name: 'Afaan Oromoo' },
];

type Kind = 'opening' | 'sale' | 'collect' | 'ret' | 'refund' | 'receive' | 'pay' | 'direct' | 'creturn' | 'void';

interface Dict {
  dir: 'rtl' | 'ltr';
  font: string;
  title: string;
  holder: string;
  currency: string;
  currencyValue: string;
  period: string;
  carried: string;
  date: string;
  desc: string;
  debit: string;
  credit: string;
  balance: string;
  totalDebit: string;
  totalCredit: string;
  closing: string;
  pendingNote: string;
  creditNote: string;
  issued: string;
  preparedBy: string;
  empty: string;
  page: string;
  companyAccount: string;
  k: Record<Kind, string>;
  cash: string;
  company: string;
}

export const I18N: Record<Lang, Dict> = {
  ar: {
    dir: 'rtl', font: "'IBM Plex Sans Arabic', sans-serif", title: 'كشف حساب', holder: 'صاحب الحساب', currency: 'العملة', currencyValue: 'بر إثيوبي (ETB)',
    period: 'الفترة', carried: 'الرصيد المرحّل من قبل الفترة', date: 'التاريخ', desc: 'البيان', debit: 'مدين', credit: 'دائن', balance: 'الرصيد',
    totalDebit: 'إجمالي المدين', totalCredit: 'إجمالي الدائن', closing: 'الرصيد الختامي', pendingNote: '* سداد لم يتأكد احتسابه لدى الشركة بعد',
    creditNote: 'الأرقام بين قوسين أرصدة دائنة.', issued: 'تاريخ الإصدار', preparedBy: 'أعدّه', empty: 'لا توجد حركات في هذه الفترة', page: 'صفحة',
    companyAccount: 'حساب المندوب لدى SYSCO',
    k: { opening: 'رصيد افتتاحي', sale: 'فاتورة بيع', collect: 'تحصيل', ret: 'مرتجع بضاعة', refund: 'رد مبلغ نقدًا', receive: 'استلام بضاعة', pay: 'سداد للشركة', direct: 'تحويل مباشر من عميل', creturn: 'مرتجع مقبول من الشركة', void: 'إلغاء' },
    cash: 'نقدًا', company: 'الشركة',
  },
  en: {
    dir: 'ltr', font: "'IBM Plex Sans Arabic', sans-serif", title: 'Account Statement', holder: 'Account holder', currency: 'Currency', currencyValue: 'Ethiopian Birr (ETB)',
    period: 'Period', carried: 'Balance brought forward', date: 'Date', desc: 'Description', debit: 'Debit', credit: 'Credit', balance: 'Balance',
    totalDebit: 'Total debit', totalCredit: 'Total credit', closing: 'Closing balance', pendingNote: '* Payment not yet confirmed by the company',
    creditNote: 'Figures in brackets are credit balances.', issued: 'Issued', preparedBy: 'Prepared by', empty: 'No transactions in this period', page: 'Page',
    companyAccount: 'Sales rep account at SYSCO',
    k: { opening: 'Opening balance', sale: 'Sales invoice', collect: 'Payment received', ret: 'Goods returned', refund: 'Cash refund', receive: 'Goods received', pay: 'Payment to company', direct: 'Direct transfer from customer', creturn: 'Return accepted by company', void: 'Cancelled' },
    cash: 'Cash', company: 'company',
  },
  so: {
    dir: 'ltr', font: "'IBM Plex Sans Arabic', sans-serif", title: 'Bayaanka Xisaabta', holder: 'Milkiilaha xisaabta', currency: 'Lacagta', currencyValue: 'Birta Itoobiya (ETB)',
    period: 'Muddada', carried: 'Haraaga hore ee la soo wareejiyay', date: 'Taariikhda', desc: 'Faahfaahin', debit: 'Debit', credit: 'Credit', balance: 'Haraaga',
    totalDebit: 'Wadarta debit', totalCredit: 'Wadarta credit', closing: 'Haraaga ugu dambeeya', pendingNote: '* Lacag-bixin aan weli shirkaddu xaqiijin',
    creditNote: 'Tirooyinka ku jira ( ) waa haraa credit ah.', issued: 'Taariikhda la soo saaray', preparedBy: 'Waxaa diyaariyay', empty: 'Muddadan wax dhaqdhaqaaq ah kuma jiraan', page: 'Bog',
    companyAccount: 'Xisaabta iibiyaha ee SYSCO',
    k: { opening: 'Haraaga furitaanka', sale: 'Qaansheeg iib', collect: 'Lacag la helay', ret: 'Badeeco la soo celiyay', refund: 'Lacag celin', receive: 'Badeeco la helay', pay: 'Lacag-bixin shirkadda', direct: 'Xawilaad toos ah oo macmiil', creturn: 'Celin ay shirkaddu aqbashay', void: 'La joojiyay' },
    cash: 'Lacag caddaan', company: 'shirkadda',
  },
  am: {
    dir: 'ltr', font: "'Noto Sans Ethiopic', 'IBM Plex Sans Arabic', sans-serif", title: 'የሂሳብ መግለጫ', holder: 'የሂሳብ ባለቤት', currency: 'የገንዘብ ዓይነት', currencyValue: 'የኢትዮጵያ ብር (ETB)',
    period: 'የጊዜ ገደብ', carried: 'ከቀደመው ጊዜ የተላለፈ ቀሪ ሂሳብ', date: 'ቀን', desc: 'ዝርዝር', debit: 'ዴቢት', credit: 'ክሬዲት', balance: 'ቀሪ ሂሳብ',
    totalDebit: 'ጠቅላላ ዴቢት', totalCredit: 'ጠቅላላ ክሬዲት', closing: 'የመዝጊያ ቀሪ ሂሳብ', pendingNote: '* በኩባንያው ገና ያልተረጋገጠ ክፍያ',
    creditNote: 'በቅንፍ ውስጥ ያሉት አሃዞች የክሬዲት ቀሪ ሂሳብ ናቸው።', issued: 'የወጣበት ቀን', preparedBy: 'ያዘጋጀው', empty: 'በዚህ ጊዜ ውስጥ ምንም እንቅስቃሴ የለም', page: 'ገጽ',
    companyAccount: 'የሽያጭ ተወካይ ሂሳብ በ SYSCO',
    k: { opening: 'የመክፈቻ ቀሪ ሂሳብ', sale: 'የሽያጭ ደረሰኝ', collect: 'የተቀበለ ክፍያ', ret: 'የተመለሰ ዕቃ', refund: 'የጥሬ ገንዘብ ተመላሽ', receive: 'የተረከበ ዕቃ', pay: 'ለኩባንያው የተከፈለ', direct: 'ከደንበኛ በቀጥታ የተላለፈ', creturn: 'በኩባንያው የተቀበለ ተመላሽ', void: 'የተሰረዘ' },
    cash: 'በጥሬ ገንዘብ', company: 'ኩባንያ',
  },
  om: {
    dir: 'ltr', font: "'IBM Plex Sans Arabic', sans-serif", title: 'Ibsa Herregaa', holder: 'Abbaa herregaa', currency: 'Maallaqa', currencyValue: 'Birrii Itoophiyaa (ETB)',
    period: 'Yeroo', carried: 'Haftee yeroo darbe irraa dabre', date: 'Guyyaa', desc: 'Ibsa', debit: 'Debiitii', credit: 'Kireeditii', balance: 'Haftee',
    totalDebit: 'Waliigala debiitii', totalCredit: 'Waliigala kireeditii', closing: 'Haftee xumuraa', pendingNote: '* Kaffaltii dhaabbatichi ammallee hin mirkaneessin',
    creditNote: 'Lakkoofsonni ( ) keessa jiran haftee kireeditii ti.', issued: 'Guyyaa itti kenname', preparedBy: 'Kan qopheesse', empty: 'Yeroo kana keessa sochiin hin jiru', page: 'Fuula',
    companyAccount: "Herrega gurgurtaa SYSCO",
    k: { opening: 'Haftee jalqabaa', sale: 'Nagahee gurgurtaa', collect: 'Kaffaltii argame', ret: "Meeshaa deebi'e", refund: "Maallaqa deebi'e", receive: 'Meeshaa fudhatame', pay: 'Kaffaltii dhaabbataaf', direct: 'Dabarsa kallattii maamilaa', creturn: 'Deebii dhaabbatni fudhate', void: 'Haqame' },
    cash: 'Maallaqa callaa', company: 'dhaabbata',
  },
};

const BANK: Record<CompanyBank, string> = { cbe: 'CBE', ebirr: 'Ebirr', abyssinia: 'Abyssinia', awash: 'Awash' };

function method(L: Dict, d: PayDestination | null | undefined): string {
  if (!d) return '';
  if (d.kind === 'company') return `${BANK[d.bank]} (${L.company})`;
  return d.wallet === 'cash' ? L.cash : d.wallet === 'cbe' ? 'CBE' : 'Ebirr';
}

/** Statement line text for one posting, in the chosen language. */
export function describeIn(lang: Lang, p: Posting, op: Operation | undefined, customers: Map<string, Customer>): string {
  if (!op) return '';
  const L = I18N[lang];
  const name = (id: string | null | undefined) => (id ? customers.get(id)?.name ?? '' : '');
  const j = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' · ');
  const onCustomer = p.account.startsWith('customer:');
  switch (op.type) {
    case 'opening':
      return L.k.opening;
    case 'receive':
      return j(L.k.receive, op.docNo);
    case 'sale':
      if (onCustomer && p.debit > 0) return j(L.k.sale, op.docNo);
      if (onCustomer) return j(L.k.collect, method(L, op.destination), op.docNo);
      return j(L.k.direct, name(op.customerId), method(L, op.destination), op.docNo);
    case 'collection':
      if (onCustomer) return j(L.k.collect, method(L, op.destination), op.ref);
      return j(L.k.direct, name(op.customerId), method(L, op.destination), op.ref);
    case 'companyPayment':
      return j(L.k.pay, `${BANK[op.bank]} (${L.company})`, op.ref);
    case 'customerReturn':
      return p.debit > 0 ? L.k.refund : j(L.k.ret, op.lines.map((l) => l.itemName).join('، '));
    case 'companyReturnDecision':
      return j(L.k.creturn, op.lines.map((l) => l.itemName).join('، '));
    case 'void':
      return `${L.k.void}: ${describeIn(lang, { ...p, debit: p.credit, credit: p.debit }, op.target, customers)}`;
    default:
      return '';
  }
}

export function fmtDateDMY(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export interface StatementRow {
  date: string;
  desc: string;
  debit: Santim;
  credit: Santim;
  balance: Santim;
  pending: boolean;
}

export interface Statement {
  lang: Lang;
  holder: string;
  holderSub: string;
  from: string;
  to: string;
  carried: Santim;
  rows: StatementRow[];
  totalDebit: Santim;
  totalCredit: Santim;
  closing: Santim;
  hasPending: boolean;
}

export function buildStatement(
  ops: Operation[],
  account: AccountKey,
  from: string,
  to: string,
  lang: Lang,
  customers: Map<string, Customer>,
): Statement {
  const l = ledger(ops, account, from, to);
  const byId = new Map(ops.map((o) => [o.id, o]));
  const rows = l.rows.map((r) => ({
    date: fmtDateDMY(r.posting.date),
    desc: describeIn(lang, r.posting, byId.get(r.posting.opId), customers),
    debit: r.posting.debit,
    credit: r.posting.credit,
    balance: r.balance,
    pending: !!r.posting.unconfirmed,
  }));
  const isCompany = account === 'company';
  const cust = isCompany ? undefined : customers.get(account.slice('customer:'.length));
  return {
    lang,
    holder: isCompany ? 'نبيل عادل' : cust?.name ?? '',
    holderSub: isCompany ? I18N[lang].companyAccount : cust?.phone ?? '',
    from,
    to,
    carried: l.carried,
    rows,
    totalDebit: rows.reduce((t, r) => t + r.debit, 0),
    totalCredit: rows.reduce((t, r) => t + r.credit, 0),
    closing: l.closing,
    hasPending: rows.some((r) => r.pending),
  };
}

/** Split rows into A4 pages (fewer rows on the first page, which carries the header boxes). */
export function paginate<T>(rows: T[], first = 16, rest = 24): T[][] {
  if (rows.length <= first) return [rows];
  const pages = [rows.slice(0, first)];
  for (let i = first; i < rows.length; i += rest) pages.push(rows.slice(i, i + rest));
  return pages;
}
