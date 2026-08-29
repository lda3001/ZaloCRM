import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardBody, Input } from '@heroui/react';
import { EnvelopeSimple, LockSimple, Robot, SignIn } from '@phosphor-icons/react';
import { useAuthStore } from '../stores/auth';

export default function LoginView() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const checkSetup = useAuthStore((s) => s.checkSetup);
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      // If already authenticated, skip the login page.
      if (token) {
        try {
          await useAuthStore.getState().fetchProfile();
          if (active && Boolean(useAuthStore.getState().token && useAuthStore.getState().user)) {
            navigate('/chat', { replace: true });
            return;
          }
        } catch {
          // Ignore network errors; fall through to setup check.
        }
      }
      // Check if first-time setup is needed.
      try {
        const needs = await checkSetup();
        if (active && needs) navigate('/setup', { replace: true });
      } catch {
        // Ignore setup status errors.
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Đăng nhập thất bại';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="crm-card rounded-2xl border border-default bg-content1/95 shadow-sm backdrop-blur">
      <CardBody className="gap-6 p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Robot size={32} weight="fill" className="text-primary" />
          </div>
          <h1 className="text-xl font-bold">
            Zalo<span className="text-primary">CRM</span>
          </h1>
          <p className="mt-1 text-xs text-foreground-500">
            Quản lý Zalo đa tài khoản cho doanh nghiệp
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onValueChange={setEmail}
            startContent={<EnvelopeSimple size={18} />}
            isRequired
            variant="bordered"
          />
          <Input
            label="Mật khẩu"
            type="password"
            value={password}
            onValueChange={setPassword}
            startContent={<LockSimple size={18} />}
            isRequired
            variant="bordered"
          />
          <Button
            type="submit"
            color="primary"
            isLoading={loading}
            startContent={!loading ? <SignIn size={18} /> : undefined}
            className="w-full"
          >
            Đăng nhập
          </Button>
        </form>

        {error && <Alert color="danger" title={error} />}
      </CardBody>
    </Card>
  );
}
