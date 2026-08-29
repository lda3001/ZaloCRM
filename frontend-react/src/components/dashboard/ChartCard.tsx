import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/react';

/**
 * Shared card shell for dashboard charts (matches the Vue chart cards).
 */
export default function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="crm-card h-full rounded-2xl border border-default bg-content1 shadow-sm">
      <CardHeader className="px-5 pb-0 pt-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </CardHeader>
      <CardBody className="px-5 pb-5 pt-3">{children}</CardBody>
    </Card>
  );
}
