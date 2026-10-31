/**
 * @file frontend/src/mocks/MockBadge.jsx
 * @description Small fixed badge shown only while the dev mock API is active,
 * so nobody mistakes fixture data for live portal data.
 */
import { isMockEnabled, setMockEnabled, MOCK_OTP } from './mockApi';

export function MockBadge() {
  if (!import.meta.env.DEV || !isMockEnabled()) return null;

  const disable = () => {
    setMockEnabled(false);
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('tenderhub_user');
    } catch { /* ignore */ }
    window.location.reload();
  };

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-[60] flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50/95 px-3 py-1.5 text-[11px] font-medium text-amber-900 shadow-md backdrop-blur dark:border-amber-700/60 dark:bg-amber-950/80 dark:text-amber-200"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      <span>Mock data · any email, OTP {MOCK_OTP}</span>
      <button
        type="button"
        onClick={disable}
        className="ml-1 rounded-full border border-amber-300/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/60"
      >
        Off
      </button>
    </div>
  );
}
