import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/context/ThemeContext';

export const metadata: Metadata = {
  title: 'Lunaria',
  description:
    'Personal finance platform with bank synchronization, investment tracking, and modular financial dashboards.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#090a0f',
};

const themeInitScript = `
  (function() {
    try {
      var saved = localStorage.getItem('lunaria_theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var theme = saved === 'light' || saved === 'dark' ? saved : (saved === 'system' ? (prefersDark ? 'dark' : 'light') : (prefersDark ? 'dark' : 'light'));
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(theme);
      document.documentElement.style.colorScheme = theme;
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark w-full max-w-full overflow-x-hidden">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-slate-50 dark:bg-[#08090d] text-slate-900 dark:text-slate-100 antialiased selection:bg-purple-500/20 selection:text-purple-700 dark:selection:bg-purple-500/30 dark:selection:text-purple-200 transition-colors duration-150">
        <ThemeProvider>
          <div className="flex min-h-[100dvh] w-full max-w-full min-w-0 overflow-x-hidden">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col w-full max-w-full min-w-0 overflow-x-hidden">
              {children}
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}


