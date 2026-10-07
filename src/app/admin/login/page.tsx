'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.message || 'Login gagal');
      }
    } catch {
      setError('Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <Link href="/" className="admin-login-back">Kembali</Link>
        <div className="admin-login-heading">
          <span className="admin-login-brand"><strong>AMMA X SAVE</strong><small>PES TOURNAMENT</small></span>
          <h1 id="admin-login-title">Admin Panel</h1>
        </div>
        {error && <div className="admin-login-error" role="alert">{error}</div>}
        <form onSubmit={handleLogin} className="admin-login-form">
          <label htmlFor="admin-username">Username</label>
          <input
            id="admin-username"
            type="text"
            placeholder="Username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={loading}
          />
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading}
            className="admin-login-submit"
          >
            {loading ? 'Memverifikasi...' : 'Masuk'}
          </button>
        </form>
      </section>
    </main>
  );
}
