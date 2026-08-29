import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { HeroUIProvider, Spinner } from '@heroui/react';
import '@fontsource-variable/plus-jakarta-sans/index.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './index.css';
import App from './App';

// Default to dark mode unless the user explicitly picked light (matches the Vue app).
if (localStorage.getItem('theme') !== 'light') {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}

function Root() {
  const navigate = useNavigate();

  return (
    <HeroUIProvider navigate={navigate}>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-background">
            <Spinner label="Đang tải..." />
          </div>
        }
      >
        <App />
      </Suspense>
    </HeroUIProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
);
