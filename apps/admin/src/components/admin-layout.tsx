'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from './admin-sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        window.location.href = '/';
        return;
      }

      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      try {
        const res = await fetch(`${API}/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;

        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_refresh');
          localStorage.removeItem('admin_user');
          window.location.href = '/';
          return;
        }

        if (!res.ok) {
          // Anything else (5xx, 4xx other than auth) is a real problem — we
          // intentionally do NOT grant access as a "best-effort fallback"
          // because that would let a client render the admin UI whenever the
          // API is down (no authorization happened).
          setError(`Tidak bisa memverifikasi akses (HTTP ${res.status}). Coba muat ulang.`);
          return;
        }

        setIsAuthed(true);
      } catch {
        if (cancelled) return;
        // Network error — again, do NOT grant access. Show a retryable error.
        setError('Tidak bisa menghubungi server untuk memverifikasi akses.');
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    verifyAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-900">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
          <p className="mt-3 text-sm text-dark-400">Memverifikasi akses...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-900 px-4">
        <div className="max-w-sm rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-sm font-medium text-red-300">Akses tidak terverifikasi</p>
          <p className="mt-2 text-xs text-dark-400">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-brand-400 px-4 py-2 text-xs font-medium text-dark-900 transition-opacity hover:opacity-90"
          >
            Muat ulang
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthed) return null;

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="ml-64 flex-1 p-8">{children}</main>
    </div>
  );
}
