import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardBody, Input } from '@heroui/react';
import { api } from '../../api/client';
import { selectIsOwner, useAuthStore } from '../../stores/auth';

export default function OrgSettings() {
  const isOwner = useAuthStore(selectIsOwner);

  const [orgName, setOrgName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function fetchOrg() {
    try {
      const res = await api.get('/organization');
      setOrgName(res.data.name ?? '');
    } catch {
      // Silently ignore — endpoint may not exist yet.
    }
  }

  useEffect(() => {
    void fetchOrg();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.put('/organization', { name: orgName.trim() });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Lỗi lưu thông tin tổ chức');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[480px]">
      <div className="mb-4 text-lg font-semibold text-foreground">Thông tin tổ chức</div>

      <Card className="rounded-2xl border border-default bg-content1 shadow-sm">
        <CardBody className="gap-3 p-4">
          <Input
            label="Tên tổ chức"
            value={orgName}
            onValueChange={setOrgName}
            variant="bordered"
            isDisabled={!isOwner || saving}
          />

          {error && <Alert color="danger" title={error} onClose={() => setError('')} />}
          {saved && <Alert color="success" title="Đã lưu thành công" onClose={() => setSaved(false)} />}

          {isOwner ? (
            <Button
              color="primary"
              isLoading={saving}
              isDisabled={!orgName.trim()}
              onPress={() => void handleSave()}
            >
              Lưu
            </Button>
          ) : (
            <p className="text-sm text-foreground-500">
              Chỉ chủ sở hữu mới có thể chỉnh sửa thông tin tổ chức.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
