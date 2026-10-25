import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Icon } from './ui/Icon';
import { ToastProvider } from './ui/kit';
import { HomeScreen } from './screens/Home';
import { ItemScreen, TruckScreen } from './screens/Truck';
import { ReceiveScreen, SaleScreen } from './screens/LineForms';
import { InvoiceDetailScreen, InvoicesScreen } from './screens/Invoices';
import { CustomerScreen, CustomersScreen, MoneyScreen } from './screens/People';
import { SettingsScreen } from './screens/Settings';

const FORM_ROUTES = ['/sale', '/receive'];

function Shell() {
  const { pathname, search } = useLocation();
  const showNav = !FORM_ROUTES.includes(pathname) && !search.includes('done=1');
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
          <NavLink to="/money">
            <Icon name="wallet" />
            المال
          </NavLink>
        </nav>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </ToastProvider>
  );
}
