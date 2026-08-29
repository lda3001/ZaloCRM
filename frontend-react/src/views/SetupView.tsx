import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardBody, Input } from '@heroui/react';
import { Building, EnvelopeSimple, GearSix, LockSimple, User } from '@phosphor-icons/react';
import { useAuthStore } from '../stores/auth';

export default function SetupView() {
  const navigate = useNavigate();
  const setup = useAuthStore((s) => s.setup);
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!orgName.trim()) errs.orgName = 'Bắt buộc';
    if (!fullName.trim()) errs.fullName = 'Bắt buộc';
    if (!email.trim()) errs.email = 'Bắt buộc';
    if (password.length < 6) errs.password = 'Tối thiểu 6 ký tự';
    return errs;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    setError('');
    try {
      await setup({
        orgName: orgName.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });
      setSuccess(true);
      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Thiết lập thất bại';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="crm-card rounded-2xl border border-default bg-content1/95 shadow-sm backdrop-blur">
      <CardBody className="gap-6 p-8">
        <div className="text-center">
          <GearSix size={64} className="mx-auto text-primary" />
          <h1 className="mt-2 text-xl font-bold">Thiết lập ban đầu</h1>
          <p className="mt-1 text-sm text-foreground-500">
            Tạo tổ chức và tài khoản quản trị viên
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            label="Tên tổ chức / phòng khám"
            value={orgName}
            onValueChange={setOrgName}
            startContent={<Building size={18} />}
            isInvalid={Boolean(fieldErrors.orgName)}
            errorMessage={fieldErrors.orgName}
            variant="bordered"
          />
          <Input
            label="Họ tên quản trị viên"
            value={fullName}
            onValueChange={setFullName}
            startContent={<User size={18} />}
            isInvalid={Boolean(fieldErrors.fullName)}
            errorMessage={fieldErrors.fullName}
            variant="bordered"
          />
          <Input
            label="Email đăng nhập"
            type="email"
            value={email}
            onValueChange={setEmail}
            startContent={<EnvelopeSimple size={18} />}
            isInvalid={Boolean(fieldErrors.email)}
            errorMessage={fieldErrors.email}
            variant="bordered"
          />
          <Input
            label="Mật khẩu"
            type="password"
            value={password}
            onValueChange={setPassword}
            startContent={<LockSimple size={18} />}
            isInvalid={Boolean(fieldErrors.password)}
            errorMessage={fieldErrors.password}
            variant="bordered"
          />
          <Button type="submit" color="primary" isLoading={loading} className="w-full">
            Tạo tài khoản
          </Button>
        </form>

        {error && <Alert color="danger" title={error} />}
        {success && <Alert color="success" title="Tạo thành công! Đang chuyển hướng..." />}
      </CardBody>
    </Card>
  );
}
