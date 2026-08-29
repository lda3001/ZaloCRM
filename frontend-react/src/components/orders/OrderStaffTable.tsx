import {
  Card,
  CardBody,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { UsersThree } from '@phosphor-icons/react';
import { formatVND } from '../../lib/format';
import type { StaffStat } from '../../hooks/use-orders';

interface Props {
  staffStats: StaffStat[];
}

export default function OrderStaffTable({ staffStats }: Props) {
  return (
    <Card className="rounded-2xl border border-default bg-content1 shadow-sm">
      <CardBody className="gap-4 p-4">
        <div className="flex items-center gap-2">
          <UsersThree size={20} weight="regular" className="text-primary" />
          <h2 className="text-base font-semibold text-foreground">Hiệu suất nhân viên</h2>
        </div>

        <Table
          aria-label="Hiệu suất nhân viên"
          className="text-sm"
          classNames={{ wrapper: 'rounded-xl border border-default p-0' }}
        >
          <TableHeader>
            <TableColumn>Nhân viên</TableColumn>
            <TableColumn align="end">Số đơn</TableColumn>
            <TableColumn align="end">Doanh thu</TableColumn>
          </TableHeader>
          <TableBody
            items={staffStats}
            emptyContent={
              <div className="py-4 text-center text-sm text-foreground-500">Không có dữ liệu</div>
            }
          >
            {(s) => (
              <TableRow key={s.userId}>
                <TableCell>{s.fullName || s.userId}</TableCell>
                <TableCell className="tabular-nums">{s.orderCount}</TableCell>
                <TableCell className="tabular-nums">{formatVND(s.totalRevenue)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}
