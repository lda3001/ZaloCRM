import { useEffect, useState } from 'react';
import { Button, Chip, Divider, Input } from '@heroui/react';
import { Plus, ShoppingCartSimple } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { formatDate, formatVND } from '../../lib/format';
import { ORDER_STATUS_OPTIONS } from '../../hooks/use-orders';

interface Props {
  contactId: string | null;
}

interface ContactOrder {
  id: string;
  orderCode: string;
  totalAmount: number;
  status: string;
  createdAt: string;
}

// Vue order status colors (grey/blue/teal/indigo/green/red) → HeroUI semantic colors.
const statusColorMap: Record<
  string,
  'default' | 'primary' | 'secondary' | 'warning' | 'success' | 'danger'
> = {
  new: 'default',
  confirmed: 'primary',
  paid: 'secondary',
  shipped: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

function statusColor(s: string) {
  return statusColorMap[s] ?? 'default';
}

function statusLabel(s: string): string {
  return ORDER_STATUS_OPTIONS.find((o) => o.value === s)?.text ?? s;
}

export default function ChatOrders({ contactId }: Props) {
  const [contactOrders, setContactOrders] = useState<ContactOrder[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrder, setNewOrder] = useState({ totalAmount: '', notes: '' });

  async function loadOrders() {
    if (!contactId) return;
    try {
      const res = await api.get(`/contacts/${contactId}/orders`);
      setContactOrders(res.data.orders || []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  async function submitCreate() {
    if (!contactId || !Number(newOrder.totalAmount)) return;
    setCreating(true);
    try {
      await api.post('/orders', {
        contactId,
        totalAmount: Number(newOrder.totalAmount),
        notes: newOrder.notes || null,
        conversationId: null,
      });
      setShowCreate(false);
      setNewOrder({ totalAmount: '', notes: '' });
      await loadOrders();
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <Divider className="my-3" />
      <div className="mb-2 flex items-center gap-1">
        <ShoppingCartSimple size={16} className="text-success" />
        <span className="text-xs font-bold">Đơn hàng ({contactOrders.length})</span>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          color="primary"
          aria-label="Thêm đơn hàng"
          className="ml-auto"
          onPress={() => setShowCreate((v) => !v)}
        >
          <Plus size={14} />
        </Button>
      </div>

      {/* Quick create form */}
      {showCreate && (
        <div className="mb-2 space-y-1 rounded-lg bg-success/5 p-2">
          <Input
            label="Tổng tiền"
            type="number"
            size="sm"
            variant="bordered"
            value={newOrder.totalAmount}
            onValueChange={(v) => setNewOrder((f) => ({ ...f, totalAmount: v }))}
          />
          <Input
            label="Ghi chú"
            size="sm"
            variant="bordered"
            value={newOrder.notes}
            onValueChange={(v) => setNewOrder((f) => ({ ...f, notes: v }))}
          />
          <Button
            size="sm"
            color="success"
            className="w-full"
            isLoading={creating}
            onPress={() => void submitCreate()}
          >
            Tạo đơn
          </Button>
        </div>
      )}

      {/* Order list */}
      {contactOrders.map((o) => (
        <div
          key={o.id}
          className="mb-1 flex items-center rounded-lg border border-success/10 bg-success/5 p-2"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium tabular-nums">{formatVND(o.totalAmount)}</div>
            <div className="text-xs opacity-60">
              {o.orderCode} · {formatDate(o.createdAt)}
            </div>
          </div>
          <Chip size="sm" variant="flat" color={statusColor(o.status)}>
            {statusLabel(o.status)}
          </Chip>
        </div>
      ))}

      {contactOrders.length === 0 && !showCreate && (
        <div className="py-2 text-center text-xs text-foreground-500">Chưa có đơn hàng</div>
      )}
    </div>
  );
}
