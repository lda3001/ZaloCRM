import type { ReactNode } from 'react';
import { Card, CardBody } from '@heroui/react';
import {
  CalendarCheck,
  ChatCircleDots,
  ChatText,
  EnvelopeSimple,
  UserPlus,
  UsersThree,
} from '@phosphor-icons/react';
import type { KpiData } from '../../hooks/use-dashboard';

interface KpiCardDef {
  title: string;
  value: number | '—';
  icon: ReactNode;
  color: string;
}

const colorClass: Record<string, string> = {
  primary: 'bg-primary-50 text-primary dark:bg-primary/10',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success',
  secondary: 'bg-secondary-50 text-secondary dark:bg-secondary/10',
};

function buildCards(kpi: KpiData | null): KpiCardDef[] {
  return [
    {
      title: 'Tin nhắn hôm nay',
      value: kpi?.messagesToday ?? '—',
      icon: <ChatText size={24} weight="regular" />,
      color: 'primary',
    },
    {
      title: 'Chưa trả lời',
      value: kpi?.messagesUnreplied ?? '—',
      icon: <ChatCircleDots size={24} weight="regular" />,
      color: 'warning',
    },
    {
      title: 'Chưa đọc',
      value: kpi?.messagesUnread ?? '—',
      icon: <EnvelopeSimple size={24} weight="regular" />,
      color: 'warning',
    },
    {
      title: 'Lịch hẹn hôm nay',
      value: kpi?.appointmentsToday ?? '—',
      icon: <CalendarCheck size={24} weight="regular" />,
      color: 'success',
    },
    {
      title: 'KH mới tuần này',
      value: kpi?.newContactsThisWeek ?? '—',
      icon: <UserPlus size={24} weight="regular" />,
      color: 'primary',
    },
    {
      title: 'Tổng khách hàng',
      value: kpi?.totalContacts ?? '—',
      icon: <UsersThree size={24} weight="regular" />,
      color: 'secondary',
    },
  ];
}

export default function KpiCards({ kpi }: { kpi: KpiData | null }) {
  const cards = buildCards(kpi);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="crm-card crm-card-interactive rounded-2xl border border-default bg-content1 shadow-sm">
          <CardBody className="flex flex-col items-center gap-2 px-4 py-5 text-center">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${colorClass[card.color]}`}>
              {card.icon}
            </span>
            <div className="tabular-nums text-2xl font-semibold text-foreground">{card.value}</div>
            <div className="text-xs text-foreground-600">{card.title}</div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
