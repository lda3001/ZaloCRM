import { useNavigate } from 'react-router-dom';
import { Button } from '@heroui/react';
import { WarningCircle } from '@phosphor-icons/react';

export default function NotFoundView() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <WarningCircle size={96} className="text-default-400" />
      <h1 className="mt-4 text-2xl font-semibold text-foreground">404 — Không tìm thấy trang</h1>
      <Button color="primary" className="mt-4" onPress={() => navigate('/')}>
        Về trang chủ
      </Button>
    </div>
  );
}
