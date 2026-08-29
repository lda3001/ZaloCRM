import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/react';
import {
  CalendarCheck,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretDown,
  ChartPie,
  ChatText,
  DeviceMobile,
  PlugsConnected,
  ShoppingCart,
  SignOut,
  SquaresFour,
  UserGear,
  UsersThree,
} from '@phosphor-icons/react';
import { appPages } from '../router';
import { useAuthStore } from '../stores/auth';
import GlobalSearch from '../components/GlobalSearch';
import { OPEN_CHAT_EVENT } from '../utils/desktop-notify';
import { startChatSocket, stopChatSocket } from '../services/chat-socket';
import NotificationBell from '../components/NotificationBell';
import ThemeToggle from '../components/ThemeToggle';

const navIcons: Record<string, ReactNode> = {
  '/': <SquaresFour size={22} weight="regular" />,
  '/chat': <ChatText size={22} weight="regular" />,
  '/contacts': <UsersThree size={22} weight="regular" />,
  '/zalo-accounts': <DeviceMobile size={22} weight="regular" />,
  '/appointments': <CalendarCheck size={22} weight="regular" />,
  '/orders': <ShoppingCart size={22} weight="regular" />,
  '/reports': <ChartPie size={22} weight="regular" />,
  '/settings': <UserGear size={22} weight="regular" />,
  '/api-settings': <PlugsConnected size={22} weight="regular" />,
};

export default function DefaultLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') !== 'false',
  );

  const currentPage = appPages.find((p) => p.path === location.pathname);

  // The chat socket lives for the whole session, not just while the Chat
  // screen is mounted: start it on login, stop it on logout.
  useEffect(() => {
    if (useAuthStore.getState().token) startChatSocket();
    const unsub = useAuthStore.subscribe((state, prev) => {
      if (state.token && !prev.token) startChatSocket();
      else if (!state.token && prev.token) stopChatSocket();
    });
    return () => {
      unsub();
      stopChatSocket();
    };
  }, []);

  // Clicking a desktop notification from any page opens the Chat screen.
  useEffect(() => {
    const openChat = (event: Event) => {
      const conversationId = (event as CustomEvent<{ conversationId?: string }>).detail
        ?.conversationId;
      const target = conversationId
        ? `/chat?conversation=${encodeURIComponent(conversationId)}`
        : '/chat';
      if (`${location.pathname}${location.search}` !== target) navigate(target);
    };
    window.addEventListener(OPEN_CHAT_EVENT, openChat);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, openChat);
  }, [location.pathname, location.search, navigate]);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell flex h-screen w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside
        style={{ width: collapsed ? 64 : 264 }}
        className="app-sidebar flex shrink-0 flex-col border-r border-default bg-content1 transition-[width] duration-200"
      >
        <div className="flex h-14 items-center justify-center gap-2 px-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-300 text-base font-extrabold text-white shadow-lg shadow-primary/25 dark:text-[#06111f]">
            Z
          </span>
          {!collapsed && (
            <span className="truncate text-base font-bold tracking-tight">
              Zalo<span className="text-primary">CRM</span>
            </span>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {appPages.map((page) => (
            <NavLink
              key={page.path}
              to={page.path}
              end={page.path === '/'}
              className={({ isActive }) =>
                `app-nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${collapsed ? 'justify-center px-0' : ''} ${
                  isActive
                    ? 'bg-primary-50 text-primary dark:bg-primary-500/15'
                    : 'text-foreground-600 hover:bg-default-100 hover:text-foreground'
                }`
              }
            >
              <span className="shrink-0">{navIcons[page.path]}</span>
              {!collapsed && <span className="truncate">{page.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-default p-2">
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground-600 transition-colors hover:bg-default-100 hover:text-foreground"
          >
            <span className="shrink-0">
              {collapsed ? (
                <CaretDoubleRight size={22} weight="regular" />
              ) : (
                <CaretDoubleLeft size={22} weight="regular" />
              )}
            </span>
            {!collapsed && <span className="truncate">Thu gọn</span>}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="app-header z-20 flex h-14 shrink-0 items-center gap-4 border-b border-default px-4">
          <h1 className="min-w-0 truncate text-base font-semibold">
            {currentPage?.title ?? 'ZaloCRM'}
          </h1>

          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <NotificationBell />
            <ThemeToggle />

            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <Button variant="light" className="h-9 gap-2 px-2">
                  <Avatar
                    name={user?.fullName || '?'}
                    size="sm"
                    className="bg-primary text-primary-foreground"
                  />
                  <span className="hidden max-w-40 truncate text-sm font-medium md:inline">
                    {user?.fullName}
                  </span>
                  <CaretDown size={14} />
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Tài khoản"
                variant="flat"
                onAction={(key) => {
                  if (key === 'logout') handleLogout();
                }}
              >
                <DropdownItem key="profile" textValue={user?.fullName ?? ''} isReadOnly>
                  <div className="py-1">
                    <p className="font-semibold">{user?.fullName}</p>
                    <p className="text-xs text-foreground-500">{user?.email}</p>
                  </div>
                </DropdownItem>
                <DropdownItem
                  key="logout"
                  color="danger"
                  className="text-danger"
                  startContent={<SignOut size={18} />}
                >
                  Đăng xuất
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </header>

        {/* Main content */}
        <main className="app-main flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
