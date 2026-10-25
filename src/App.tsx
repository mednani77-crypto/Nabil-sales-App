import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Icon } from './ui/Icon';
import { ToastProvider } from './ui/kit';
import { HomeScreen } from './screens/Home';
import { ItemScreen, TruckScreen } from './screens/Truck';
import { ReceiveScreen, SaleScreen } from './screens/LineForms';
import { InvoiceDetailScreen, InvoicesScreen } from './screens/Invoices';
import { CompanyScreen, CustomerScreen, CustomersScreen, MoneyScreen } from './screens/People';
import { CollectScreen, PayScreen, TransferScreen } from './screens/MoneyForms';
import { SettingsScreen } from './screens/Settings';
import { NoticesScreen } from './screens/Notices';
import { CountScreen, OpeningScreen, OperationScreen, ReturnsScreen } from './screens/Stock';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { noticeCounts } from './domain/notices';
import { useEffect } from 'react';
import { LockGate } from './ui/Lock';
import { startSyncLoop } from './sync/service';

const FORM_ROUTES = ['/sale', '/receive', '/collect', '/transfer', '/pay', '/returns', '/count', '/opening'];

function Shell() {
  const { pathname, search } = useLocation();
  const showNav = !FORM_ROUTES.includes(pathname) && !search.includes('done=1');
  const unsent = useLiveQuery(async () => noticeCounts(await db.operations.toArray()).recorded, []) ?? 0;
  return (
    <div className="app">
      <main className="main">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/truck" element={<TruckScreen />} />
          <Route path="/truck/:id" element={<ItemScreen />} />
          <Route path="/receive" element={<ReceiveScreen />} />
          <Route path="/sale" element={<SaleScreen />} />
          <Route path="/invoices" element={<InvoicesScreen />} />
          <Route path="/invoices/:id" element={<InvoiceDetailScreen />} />
          <Route path="/customers" element={<CustomersScreen />} />
          <Route path="/customers/:id" element={<CustomerScreen />} />
          <Route path="/money" element={<MoneyScreen />} />
          <Route path="/company" element={<CompanyScreen />} />
          <Route path="/collect" element={<CollectScreen />} />
          <Route path="/transfer" element={<TransferScreen />} />
          <Route path="/pay" element={<PayScreen />} />
          <Route path="/notices" element={<NoticesScreen />} />
          <Route path="/returns" element={<ReturnsScreen />} />
          <Route path="/count" element={<CountScreen />} />
          <Route path="/opening" element={<OpeningScreen />} />
          <Route path="/op/:id" element={<OperationScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<HomeScreen />} />
        </Routes>
      </main>
      {showNav && (
        <nav className="nav" aria-label="التنقل الرئيسي">
          <NavLink to="/" end>
            <Icon name="home" />
            الرئيسية
          </NavLink>
          <NavLink to="/truck">
            <Icon name="truck" />
            الشاحنة
          </NavLink>
          <NavLink to="/sale" className="fab" aria-label="بيع جديد">
            <span className="c">
              <Icon name="plus" style={{ width: 30, height: 30, strokeWidth: 2.4 }} />
            </span>
            بيع جديد
          </NavLink>
          <NavLink to="/customers">
            <Icon name="users" />
            العملاء
          </NavLink>
          <NavLink to="/money" style={{ position: 'relative' }}>
            <Icon name="wallet" />
            المال
            {unsent > 0 && (
              <span className="num" aria-label={`${unsent} إشعار لم يُرسل`} style={{ position: 'absolute', top: 2, left: '50%', marginLeft: -24, minWidth: 18, height: 18, borderRadius: 9, background: '#c0362c', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unsent}</span>
            )}
          </NavLink>
        </nav>
      )}
    </div>
  );
}

export default function App() {
  useEffect(() => startSyncLoop(), []);
  return (
    <ToastProvider>
      <LockGate>
        <HashRouter>
          <Shell />
        </HashRouter>
      </LockGate>
    </ToastProvider>
  );
}
