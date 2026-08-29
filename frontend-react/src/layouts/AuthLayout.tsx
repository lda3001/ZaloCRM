import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="auth-shell flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[450px]">
        <Outlet />
      </div>
    </div>
  );
}
