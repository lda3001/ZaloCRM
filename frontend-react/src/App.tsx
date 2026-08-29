import { Route, Routes } from 'react-router-dom';
import AuthLayout from './layouts/AuthLayout';
import DefaultLayout from './layouts/DefaultLayout';
import {
  ApiSettingsView,
  AppointmentsView,
  ChatView,
  ContactsView,
  DashboardView,
  LoginView,
  NotFoundView,
  OrdersView,
  ReportsView,
  RequireAuth,
  SettingsView,
  SetupView,
  ZaloAccountsView,
  appPages,
} from './router';

function AppRoute({ path }: { path: string }) {
  if (path === '/') return <DashboardView />;
  if (path === '/chat') return <ChatView />;
  if (path === '/contacts') return <ContactsView />;
  if (path === '/zalo-accounts') return <ZaloAccountsView />;
  if (path === '/appointments') return <AppointmentsView />;
  if (path === '/orders') return <OrdersView />;
  if (path === '/reports') return <ReportsView />;
  if (path === '/settings') return <SettingsView />;
  if (path === '/api-settings') return <ApiSettingsView />;
  return <NotFoundView />;
}

export default function App() {
  return (
    <Routes>
      {/* Auth routes render inside the centered auth layout. */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginView />} />
        <Route path="/setup" element={<SetupView />} />
      </Route>

      {/* App shell routes render inside the default (sidebar + top bar) layout. */}
      <Route element={<DefaultLayout />}>
        <Route element={<RequireAuth />}>
          {appPages.map((page) => (
            <Route key={page.path} path={page.path} element={<AppRoute path={page.path} />} />
          ))}
        </Route>
        <Route path="*" element={<NotFoundView />} />
      </Route>
    </Routes>
  );
}
