import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/react';
import { Bell, Info, Warning, WarningCircle } from '@phosphor-icons/react';
import { api } from '../api/client';
import { openChatConversation } from '../utils/desktop-notify';

interface Notification {
  id: string;
  type: string;
  title: string;
  detail: string;
  priority: string;
  conversationId?: string;
}

function notificationIcon(type: string) {
  if (type === 'error') {
    return <WarningCircle size={20} weight="fill" className="text-danger" />;
  }
  if (type === 'warning') {
    return <Warning size={20} weight="fill" className="text-warning" />;
  }
  return <Info size={20} className="text-primary" />;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  async function fetchNotifications() {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
    } catch {
      // Silently ignore fetch errors.
    }
  }

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  function handleClick(id: string) {
    if (id === 'unreplied') {
      const conversationId = notifications.find((n) => n.id === id)?.conversationId;
      if (conversationId) openChatConversation(conversationId);
      else navigate('/chat');
    }
    else if (id.startsWith('apt-')) navigate('/appointments');
    else if (id.startsWith('zalo-')) navigate('/zalo-accounts');
    else if (id === 'tmr-apts') navigate('/appointments');
  }

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button isIconOnly variant="light" aria-label="Thông báo">
          <Badge
            content={notifications.length}
            color="danger"
            isInvisible={notifications.length === 0}
            shape="circle"
            size="sm"
          >
            <Bell size={22} />
          </Badge>
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Thông báo"
        className="max-h-96 w-80 overflow-y-auto"
        onAction={(key) => handleClick(String(key))}
      >
        {notifications.length === 0 ? (
          <DropdownItem key="empty" isReadOnly className="text-foreground-500">
            Không có thông báo
          </DropdownItem>
        ) : (
          notifications.map((n) => (
            <DropdownItem
              key={n.id}
              description={n.detail}
              startContent={notificationIcon(n.type)}
              className="py-2"
            >
              {n.title}
            </DropdownItem>
          ))
        )}
      </DropdownMenu>
    </Dropdown>
  );
}
