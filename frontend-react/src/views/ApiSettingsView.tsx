import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Input } from '@heroui/react';
import { ArrowsClockwise, Copy, PlugsConnected } from '@phosphor-icons/react';
import { api } from '../api/client';

interface Snack {
  show: boolean;
  text: string;
  color: 'success' | 'danger';
}

export default function ApiSettingsView() {
  const [apiKey, setApiKey] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [snack, setSnack] = useState<Snack>({ show: false, text: '', color: 'success' });
  const snackTimer = useRef<number | undefined>(undefined);

  function showSnack(text: string, color: 'success' | 'danger' = 'success') {
    if (snackTimer.current) window.clearTimeout(snackTimer.current);
    setSnack({ show: true, text, color });
    snackTimer.current = window.setTimeout(
      () => setSnack((s) => ({ ...s, show: false })),
      3000,
    );
  }

  useEffect(() => {
    return () => {
      if (snackTimer.current) window.clearTimeout(snackTimer.current);
    };
  }, []);

  async function loadApiKey() {
    try {
      const res = await api.get('/settings/api-key');
      setApiKey(res.data.apiKey ?? '');
    } catch {
      setApiKey('');
    }
  }

  async function loadWebhook() {
    try {
      const res = await api.get('/settings/webhook');
      setWebhookUrl(res.data.webhookUrl ?? '');
      setWebhookSecret(res.data.webhookSecret ?? '');
    } catch {
      setWebhookUrl('');
      setWebhookSecret('');
    }
  }

  useEffect(() => {
    void loadApiKey();
    void loadWebhook();
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateKey() {
    setGeneratingKey(true);
    try {
      const res = await api.post('/settings/api-key/generate');
      setApiKey(res.data.apiKey ?? '');
      showSnack('API key mới đã được tạo');
    } catch {
      showSnack('Tạo key thất bại', 'danger');
    } finally {
      setGeneratingKey(false);
    }
  }

  async function copyKey() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    showSnack('Đã sao chép API key');
  }

  async function saveWebhook() {
    setSaving(true);
    try {
      await api.put('/settings/webhook', {
        webhookUrl,
        webhookSecret,
      });
      showSnack('Đã lưu cấu hình webhook');
    } catch {
      showSnack('Lưu thất bại', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function testWebhook() {
    setTesting(true);
    try {
      await api.post('/settings/webhook/test');
      showSnack('Gửi test webhook thành công');
    } catch {
      showSnack('Test webhook thất bại', 'danger');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex max-w-[700px] flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
        <PlugsConnected size={22} weight="regular" className="text-primary" />
        API &amp; Webhook
      </h1>

      {/* API Key */}
      <Card className="rounded-2xl border border-default bg-content1 shadow-sm">
        <CardHeader className="text-base font-semibold text-foreground">API Key</CardHeader>
        <CardBody className="gap-3">
          <Input
            label="API Key"
            value={apiKey}
            isReadOnly
            variant="bordered"
            endContent={
              <Button
                isIconOnly
                size="sm"
                variant="light"
                aria-label="Sao chép"
                title="Sao chép"
                isDisabled={!apiKey}
                onPress={() => void copyKey()}
              >
                <Copy size={18} />
              </Button>
            }
          />
          <Button
            variant="bordered"
            color="primary"
            startContent={<ArrowsClockwise size={18} />}
            isLoading={generatingKey}
            onPress={() => void generateKey()}
          >
            Tạo key mới
          </Button>
        </CardBody>
      </Card>

      {/* Webhook */}
      <Card className="rounded-2xl border border-default bg-content1 shadow-sm">
        <CardHeader className="text-base font-semibold text-foreground">Webhook</CardHeader>
        <CardBody className="gap-3">
          <Input
            label="Webhook URL"
            placeholder="https://your-server.com/webhook"
            value={webhookUrl}
            onValueChange={setWebhookUrl}
            variant="bordered"
          />
          <Input
            label="Secret (HMAC)"
            type="password"
            value={webhookSecret}
            onValueChange={setWebhookSecret}
            variant="bordered"
          />
          <div className="flex flex-wrap gap-2">
            <Button color="primary" isLoading={saving} onPress={() => void saveWebhook()}>
              Lưu
            </Button>
            <Button variant="bordered" isLoading={testing} onPress={() => void testWebhook()}>
              Test Webhook
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* API Documentation */}
      <Card className="rounded-2xl border border-default bg-content1 shadow-sm">
        <CardHeader className="text-base font-semibold text-foreground">
          API Documentation
        </CardHeader>
        <CardBody>
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground-600">
{`Header: X-API-Key: your-key

GET  /api/public/contacts
POST /api/public/contacts
GET  /api/public/conversations
POST /api/public/messages/send
GET  /api/public/appointments
POST /api/public/appointments

Webhook events:
- message.received
- message.sent
- contact.created
- zalo.connected
- zalo.disconnected`}
          </pre>
        </CardBody>
      </Card>

      {/* Snackbar */}
      {snack.show && (
        <div className="fixed bottom-4 right-4 z-50">
          <Alert
            color={snack.color}
            title={snack.text}
            onClose={() => setSnack((s) => ({ ...s, show: false }))}
          />
        </div>
      )}
    </div>
  );
}
