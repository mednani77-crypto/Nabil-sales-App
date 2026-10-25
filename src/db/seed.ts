import type { AppDB } from './db';
import { addCustomer, addItem, resetAll, saveCollection, saveCompanyPayment, saveNoticeStatus, saveOpening, saveReceive, saveSale, saveTransfer } from './repo';
import { addDaysISO, todayISO } from '../lib/dates';

const b = (birr: number) => birr * 100;

/** Realistic demo data so the app can be tried on a phone. Wipes existing local data. */
export async function loadDemo(db: AppDB) {
  await resetAll(db);
  const today = todayISO();
  const d = (n: number) => addDaysISO(today, n);

  const oil = await addItem(db, { name: 'زيت طبخ 3 لتر', minStock: 24, units: [{ name: 'كرتون', factor: 6, lastPrice: b(6300) }, { name: 'حبة', factor: 1, lastPrice: b(1080) }] });
  const rice = await addItem(db, { name: 'أرز بسمتي 25 كغ', minStock: 4, units: [{ name: 'كنتال', factor: 4, lastPrice: b(14000) }, { name: 'جونية', factor: 1, lastPrice: b(3550) }] });
  const sugar = await addItem(db, { name: 'سكر أبيض 50 كغ', minStock: 6, units: [{ name: 'جونية', factor: 1, lastPrice: b(7400) }] });
  const pasta = await addItem(db, { name: 'مكرونة 500غ', minStock: 100, units: [{ name: 'كرتون', factor: 20, lastPrice: b(1500) }, { name: 'حبة', factor: 1, lastPrice: b(80) }] });
  const paste = await addItem(db, { name: 'صلصة طماطم 400غ', minStock: 48, units: [{ name: 'كرتون', factor: 24, lastPrice: b(2160) }, { name: 'حبة', factor: 1, lastPrice: b(95) }] });
  const flour = await addItem(db, { name: 'دقيق قمح 50 كغ', minStock: 4, units: [{ name: 'كنتال', factor: 2, lastPrice: b(9600) }, { name: 'جونية', factor: 1, lastPrice: b(4850) }] });
  const soap = await addItem(db, { name: 'صابون غسيل 1 كغ', minStock: 24, units: [{ name: 'كرتون', factor: 12, lastPrice: b(2900) }, { name: 'حبة', factor: 1, lastPrice: b(250) }] });

  const abubakr = await addCustomer(db, { name: 'بقالة أبو بكر', phone: '0915 234 567', area: 'سابيان' });
  const noor = await addCustomer(db, { name: 'سوبرماركت النور', phone: '0921 445 908', area: 'كزيرا' });
  const fatima = await addCustomer(db, { name: 'محل فاطمة عبدي', phone: '0913 778 120', area: 'دجاتو' });
  const hassan = await addCustomer(db, { name: 'متجر حسن إبراهيم', phone: '0930 112 334', area: 'أشوا' });
  const amal = await addCustomer(db, { name: 'مطعم الأمل', phone: '0911 902 556', area: 'المركز' });
  const saeed = await addCustomer(db, { name: 'دكان سعيد', phone: '0944 551 230', area: 'لغهار' });

  await saveOpening(
    db,
    {
      company: b(274000),
      customers: [
        { customerId: abubakr.id, balance: b(18500) },
        { customerId: noor.id, balance: b(42300) },
        { customerId: hassan.id, balance: -b(1200) },
        { customerId: amal.id, balance: b(9800) },
      ],
      wallets: { cash: b(12000), cbe: b(9500), ebirr: b(2300) },
      stock: [
        { itemId: oil.id, qty: 40 },
        { itemId: rice.id, qty: 6 },
        { itemId: sugar.id, qty: 6 },
        { itemId: pasta.id, qty: 220 },
        { itemId: paste.id, qty: 130 },
        { itemId: flour.id, qty: 7 },
        { itemId: soap.id, qty: 48 },
      ],
    },
    d(-24),
  );

  await saveReceive(db, [
    { itemId: oil.id, unitName: 'كرتون', qty: 6, unitPrice: b(6300) },
    { itemId: rice.id, unitName: 'كنتال', qty: 2, unitPrice: b(14000) },
    { itemId: pasta.id, unitName: 'كرتون', qty: 5, unitPrice: b(1500) },
  ], d(-6));

  await saveSale(db, { customerId: noor.id, payMode: 'credit', paid: 0, destination: null, lines: [
    { itemId: rice.id, unitName: 'كنتال', qty: 1, unitPrice: b(14000) },
    { itemId: pasta.id, unitName: 'حبة', qty: 10, unitPrice: b(80) },
  ] }, d(-5));
  await saveSale(db, { customerId: saeed.id, payMode: 'cash', paid: 0, destination: { kind: 'wallet', wallet: 'cash' }, lines: [
    { itemId: flour.id, unitName: 'جونية', qty: 1, unitPrice: b(4850) },
    { itemId: soap.id, unitName: 'كرتون', qty: 1, unitPrice: b(2900) },
    { itemId: pasta.id, unitName: 'كرتون', qty: 1, unitPrice: b(1500) },
  ] }, d(-3));
  await saveSale(db, { customerId: fatima.id, payMode: 'partial', paid: b(3000), destination: { kind: 'wallet', wallet: 'ebirr' }, lines: [
    { itemId: sugar.id, unitName: 'جونية', qty: 1, unitPrice: b(7400) },
  ] }, d(-2));
  await saveSale(db, { customerId: abubakr.id, payMode: 'credit', paid: 0, destination: null, lines: [
    { itemId: oil.id, unitName: 'كرتون', qty: 2, unitPrice: b(6300) },
  ] }, d(-1));
  await saveSale(db, { customerId: null, payMode: 'cash', paid: 0, destination: { kind: 'wallet', wallet: 'cash' }, lines: [
    { itemId: pasta.id, unitName: 'كرتون', qty: 2, unitPrice: b(1500) },
    { itemId: pasta.id, unitName: 'حبة', qty: 3, unitPrice: b(80) },
  ] }, d(-1));
  await saveSale(db, { customerId: noor.id, payMode: 'cash', paid: 0, destination: { kind: 'company', bank: 'cbe' }, lines: [
    { itemId: soap.id, unitName: 'كرتون', qty: 1, unitPrice: b(2900) },
  ] }, today);
  await saveSale(db, { customerId: null, payMode: 'credit', paid: 0, destination: null, lines: [
    { itemId: paste.id, unitName: 'كرتون', qty: 1, unitPrice: b(2160) },
  ] }, today);

  // Money movements (phase 2)
  const noorDirect = await saveCollection(db, { customerId: noor.id, amount: b(20000), destination: { kind: 'company', bank: 'cbe' }, ref: 'FT26288L2MPA' }, d(-10));
  await saveNoticeStatus(db, noorDirect.id, 'sent');
  await saveNoticeStatus(db, noorDirect.id, 'confirmed');
  await saveCollection(db, { customerId: abubakr.id, amount: b(5000), destination: { kind: 'wallet', wallet: 'cash' } }, d(-1));
  await saveTransfer(db, { from: 'cash', to: 'cbe', amount: b(15000) }, d(-1));
  const pay = await saveCompanyPayment(db, { source: 'cbe', bank: 'cbe', amount: b(20000), ref: 'FT26297R3HTB' }, d(-1));
  await saveNoticeStatus(db, pay.id, 'sent');
}
