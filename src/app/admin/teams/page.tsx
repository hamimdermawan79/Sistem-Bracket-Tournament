'use client';

import TournamentBrand from '@/components/TournamentBrand';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Team, Player } from '@/types/tournament';
import { PRESET_TEAMS, PresetTeam } from '@/lib/teamPresets';

export default function AdminTeamsPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search
  const [search, setSearch] = useState('');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamLogoUrl, setTeamLogoUrl] = useState('');
  const [logoInputType, setLogoInputType] = useState<'preset' | 'upload' | 'url'>('preset');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState<Team | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const cookies = document.cookie.split(';');
    const hasCookie = cookies.some((c) => c.trim().startsWith('admin_session='));

    if (hasCookie) {
      setIsAdmin(true);
      fetchData();
      return;
    }

    try {
      const res = await fetch('/api/admin/check');
      const data = await res.json();
      if (data.isAdmin) {
        setIsAdmin(true);
        fetchData();
      } else {
        setIsAdmin(false);
        setLoading(false);
      }
    } catch {
      setIsAdmin(false);
      setLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: teamsData, error: teamErr }, { data: playersData, error: playerErr }] = await Promise.all([
        supabase.from('teams').select('*').order('name', { ascending: true }),
        supabase.from('players').select('*'),
      ]);

      if (teamErr) {
        console.warn('Teams table might not exist yet:', teamErr);
      } else if (teamsData) {
        setTeams(teamsData as Team[]);
      }

      if (playersData) {
        setPlayers(playersData as Player[]);
      }
    } catch (err) {
      console.error('Error fetching teams:', err);
      showToast('error', 'Gagal memuat daftar tim.');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    setIsAdmin(false);
    router.push('/admin/login');
  };

  const teamUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    players.forEach((p) => {
      if (p.team_id) {
        map[p.team_id] = (map[p.team_id] || 0) + 1;
      }
    });
    return map;
  }, [players]);

  const openAddModal = () => {
    setEditingTeam(null);
    setTeamName('');
    setTeamLogoUrl('');
    setLogoInputType('preset');
    setIsModalOpen(true);
  };

  const openEditModal = (team: Team) => {
    setEditingTeam(team);
    setTeamName(team.name);
    setTeamLogoUrl(team.logo_url);
    setLogoInputType(team.logo_url.startsWith('data:') ? 'upload' : 'url');
    setIsModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1.5 * 1024 * 1024) {
      showToast('error', 'Ukuran gambar maksimal 1.5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setTeamLogoUrl(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSelectPreset = (preset: PresetTeam) => {
    setTeamName(preset.name);
    setTeamLogoUrl(preset.logo_url);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      showToast('error', 'Nama tim tidak boleh kosong!');
      return;
    }
    if (!teamLogoUrl.trim()) {
      showToast('error', 'Logo tim wajib diisi / dipilih!');
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const teamId = editingTeam ? editingTeam.id : `team-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const payload = {
        id: teamId,
        name: teamName.trim(),
        logo_url: teamLogoUrl.trim(),
        updated_at: now,
        ...(editingTeam ? {} : { created_at: now }),
      };

      const { error } = await supabase.from('teams').upsert(payload);
      if (error) throw error;

      showToast('success', editingTeam ? `Tim "${teamName}" berhasil diperbarui!` : `Tim "${teamName}" berhasil ditambahkan!`);
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving team:', err);
      showToast('error', `Gagal menyimpan tim: ${err.message || 'Error database'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    setSubmitting(true);
    try {
      await supabase.from('players').update({ team_id: null }).eq('team_id', team.id);
      const { error } = await supabase.from('teams').delete().eq('id', team.id);
      if (error) throw error;

      showToast('success', `Tim "${team.name}" berhasil dihapus.`);
      setConfirmDeleteTeam(null);
      fetchData();
    } catch (err: any) {
      console.error('Error deleting team:', err);
      showToast('error', `Gagal menghapus tim: ${err.message || 'Error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSeedPresets = async () => {
    setIsSeeding(true);
    try {
      const seedData = PRESET_TEAMS.map((p) => ({
        id: `team-${p.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: p.name,
        logo_url: p.logo_url,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from('teams').upsert(seedData, { onConflict: 'id' });
      if (error) throw error;

      showToast('success', `Berhasil menambahkan ${seedData.length} tim preset ke database.`);
      fetchData();
    } catch (err: any) {
      console.error('Error seeding presets:', err);
      showToast('error', 'Gagal memasukkan preset tim.');
    } finally {
      setIsSeeding(false);
    }
  };

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, search]);

  if (loading && isAdmin === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Memverifikasi...</div>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="modal-panel" style={{ maxWidth: 380, textAlign: 'center', padding: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Oswald', sans-serif", letterSpacing: '0.08em', marginBottom: 8, color: 'var(--accent-red)', textTransform: 'uppercase' }}>
            Akses Terbatas
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Silakan login terlebih dahulu untuk mengakses panel ini.
          </p>
          <Link href="/admin/login" className="btn-modern btn-primary" style={{ width: '100%' }}>
            Login Admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 60 }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed', top: 20, right: 20, zIndex: 9999,
            padding: '10px 18px', borderRadius: 4,
            background: toastMessage.type === 'success' ? '#10b981' : '#ef4444',
            color: '#ffffff', fontWeight: 700, fontSize: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Clean Minimalist Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(10, 14, 26, 0.96)',
          backdropFilter: 'blur(12px)',
          position: 'sticky', top: 0, zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 1320, margin: '0 auto', padding: '12px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          }}
        >
          {/* Title Branding */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TournamentBrand />
            <div style={{ height: 16, width: 1, background: 'var(--border-subtle)' }} />
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              color: 'var(--accent-gold)', textTransform: 'uppercase', fontFamily: "'Oswald', sans-serif",
            }}>
              KELOLA TIM
            </span>
          </div>

          {/* Navigation Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/" className="btn-modern btn-secondary" style={{ padding: '6px 12px', fontSize: 10 }}>
              Bagan Turnamen
            </Link>
            <Link href="/admin/players" className="btn-modern btn-secondary" style={{ padding: '6px 12px', fontSize: 10 }}>
              Kelola Player
            </Link>
            <button
              onClick={handleLogout}
              className="btn-modern btn-danger"
              style={{ padding: '6px 12px', fontSize: 10 }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 1320, margin: '24px auto 0', padding: '0 20px' }}>
        {/* Top Overview Card & Action Toolbar */}
        <div
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
          }}
        >
          {/* Stats Counters */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                TOTAL TIM TERDAFTAR
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Oswald', sans-serif", color: 'var(--accent-gold)' }}>
                {teams.length} <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Tim</span>
              </div>
            </div>

            <div style={{ width: 1, height: 32, background: 'var(--border-subtle)' }} />

            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                DIGUNAKAN PLAYER
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Oswald', sans-serif", color: 'var(--accent-emerald)' }}>
                {Object.keys(teamUsageMap).length} <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Dipakai</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {teams.length === 0 && (
              <button
                onClick={handleSeedPresets}
                disabled={isSeeding}
                className="btn-modern btn-gold"
              >
                {isSeeding ? 'Memasang Preset...' : 'Muat 18 Preset Klub'}
              </button>
            )}
            <button
              onClick={openAddModal}
              className="btn-modern btn-primary"
            >
              + Tambah Tim Baru
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              placeholder="Cari nama tim..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', fontSize: 12,
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)', outline: 'none', borderRadius: 3,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
                }}
              >
                ✕
              </button>
            )}
          </div>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="btn-modern btn-secondary"
              style={{ padding: '8px 12px', fontSize: 10 }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Teams Grid */}
        {filteredTeams.length === 0 ? (
          <div
            style={{
              background: 'var(--bg-card)', border: '1px dashed var(--border-subtle)',
              padding: 48, textAlign: 'center', color: 'var(--text-muted)',
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {search ? 'Tidak ada tim yang cocok dengan pencarian' : 'Belum ada tim yang ditambahkan'}
            </h3>
            <p style={{ fontSize: 11, marginBottom: 18 }}>
              {search ? 'Coba gunakan kata kunci pencarian yang lain.' : 'Mulai dengan menambahkan tim atau gunakan preset klub.'}
            </p>
            {!search && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                <button
                  onClick={handleSeedPresets}
                  disabled={isSeeding}
                  className="btn-modern btn-gold"
                >
                  Muat 18 Preset Klub
                </button>
                <button
                  onClick={openAddModal}
                  className="btn-modern btn-primary"
                >
                  + Tambah Tim Manual
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
              gap: 14,
            }}
          >
            {filteredTeams.map((team) => {
              const count = teamUsageMap[team.id] || 0;
              return (
                <div
                  key={team.id}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                    padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    transition: 'border-color 0.15s, transform 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  <div>
                    {/* Header: Logo and Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div
                        style={{
                          width: 44, height: 44,
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 4, flexShrink: 0,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={team.logo_url}
                          alt={team.name}
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4
                          style={{
                            margin: '0 0 3px', fontSize: 14, fontWeight: 700,
                            color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                          title={team.name}
                        >
                          {team.name}
                        </h4>
                        <div>
                          <span
                            style={{
                              fontSize: 9, fontWeight: 700, padding: '2px 6px', letterSpacing: '0.04em',
                              background: count > 0 ? 'rgba(52, 211, 153, 0.1)' : 'rgba(120, 135, 165, 0.1)',
                              border: `1px solid ${count > 0 ? 'rgba(52, 211, 153, 0.25)' : 'var(--border-subtle)'}`,
                              color: count > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {count > 0 ? `${count} Player` : 'Belum Dipakai'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    style={{
                      display: 'flex', gap: 6, borderTop: '1px solid var(--border-subtle)',
                      paddingTop: 10, marginTop: 4, justifyContent: 'flex-end',
                    }}
                  >
                    <button
                      onClick={() => openEditModal(team)}
                      className="btn-modern btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 10 }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDeleteTeam(team)}
                      className="btn-modern btn-danger"
                      style={{ padding: '4px 10px', fontSize: 10 }}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add / Edit Team Modal */}
      {isModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) setIsModalOpen(false);
          }}
        >
          <div className="modal-panel" style={{ maxWidth: 500, padding: 24 }}>
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              disabled={submitting}
              style={{
                position: 'absolute', top: 14, right: 14,
                background: 'none', border: 'none', color: 'var(--text-muted)',
                fontSize: 20, cursor: 'pointer', lineHeight: 1,
              }}
            >
              ×
            </button>

            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 3, height: 16, background: 'var(--accent-gold)' }} />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: "'Oswald', sans-serif", letterSpacing: '0.08em', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                {editingTeam ? 'EDIT DATA TIM' : 'TAMBAH TIM BARU'}
              </h3>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 11, color: 'var(--text-muted)' }}>
              Masukkan nama tim dan logo yang akan ditampilkan pada bagan turnamen.
            </p>

            <form onSubmit={handleSaveTeam}>
              {/* Team Name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Nama Tim / Klub *
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Real Madrid, Manchester City, Arsenal..."
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px', fontSize: 12,
                    background: 'rgba(10, 14, 26, 0.8)', border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)', outline: 'none',
                  }}
                  required
                  autoFocus
                />
              </div>

              {/* Logo Source Selector */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Sumber Logo *
                </label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setLogoInputType('preset')}
                    className={`btn-modern ${logoInputType === 'preset' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '6px 8px', fontSize: 10 }}
                  >
                    Preset Klub
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogoInputType('upload')}
                    className={`btn-modern ${logoInputType === 'upload' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '6px 8px', fontSize: 10 }}
                  >
                    Upload Gambar
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogoInputType('url')}
                    className={`btn-modern ${logoInputType === 'url' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '6px 8px', fontSize: 10 }}
                  >
                    URL Logo
                  </button>
                </div>

                {/* Preset List Selection */}
                {logoInputType === 'preset' && (
                  <div
                    style={{
                      maxHeight: 150, overflowY: 'auto', background: 'rgba(10, 14, 26, 0.8)',
                      border: '1px solid var(--border-subtle)', padding: 6,
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 4,
                    }}
                  >
                    {PRESET_TEAMS.map((p) => {
                      const isSelected = teamLogoUrl === p.logo_url;
                      return (
                        <div
                          key={p.name}
                          onClick={() => handleSelectPreset(p)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                            background: isSelected ? 'rgba(74, 124, 255, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                            border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.06)'}`,
                            cursor: 'pointer', fontSize: 11,
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.logo_url} alt={p.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isSelected ? 'white' : 'var(--text-secondary)' }}>
                            {p.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* File Upload */}
                {logoInputType === 'upload' && (
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      style={{
                        width: '100%', padding: '8px 10px', fontSize: 11,
                        background: 'rgba(10, 14, 26, 0.8)', border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                      Format: PNG, JPG, SVG, WebP (Maks. 1.5 MB)
                    </div>
                  </div>
                )}

                {/* URL Input */}
                {logoInputType === 'url' && (
                  <input
                    type="url"
                    placeholder="https://..."
                    value={teamLogoUrl}
                    onChange={(e) => setTeamLogoUrl(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px', fontSize: 12,
                      background: 'rgba(10, 14, 26, 0.8)', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)', outline: 'none',
                    }}
                  />
                )}
              </div>

              {/* Logo Preview Banner */}
              <div
                style={{
                  background: 'rgba(15, 20, 38, 0.7)', border: '1px solid var(--border-subtle)',
                  padding: '10px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div
                  style={{
                    width: 36, height: 36, background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {teamLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={teamLogoUrl}
                      alt="Preview"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>-</span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Preview Bagan</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {teamLogoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={teamLogoUrl} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                      PlayerName
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      ({teamName || 'Nama Tim'})
                    </span>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="btn-modern btn-secondary"
                  style={{ padding: '8px 14px' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-modern btn-primary"
                  style={{ padding: '8px 18px' }}
                >
                  {submitting ? 'Menyimpan...' : (editingTeam ? 'Simpan' : 'Tambahkan')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Team Modal */}
      {confirmDeleteTeam && (
        <div className="modal-overlay" onClick={() => !submitting && setConfirmDeleteTeam(null)}>
          <div className="modal-panel" style={{ maxWidth: 380, padding: 22 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800, color: 'var(--accent-red)', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase' }}>
              Konfirmasi Hapus Tim
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Yakin ingin menghapus tim <strong>&quot;{confirmDeleteTeam.name}&quot;</strong>?
              {teamUsageMap[confirmDeleteTeam.id] ? (
                <span style={{ display: 'block', marginTop: 6, color: 'var(--accent-gold)', fontSize: 10 }}>
                  Ada {teamUsageMap[confirmDeleteTeam.id]} player yang memilih tim ini. Tim mereka akan dikosongkan.
                </span>
              ) : null}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteTeam(null)}
                disabled={submitting}
                className="btn-modern btn-secondary"
                style={{ padding: '6px 12px', fontSize: 10 }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTeam(confirmDeleteTeam)}
                disabled={submitting}
                className="btn-modern btn-danger"
                style={{ padding: '6px 14px', fontSize: 10 }}
              >
                {submitting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
