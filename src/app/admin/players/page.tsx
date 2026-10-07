'use client';

import TournamentBrand from '@/components/TournamentBrand';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Player, Team } from '@/types/tournament';

type FilterTab = 'all' | 'left' | 'right' | 'filled' | 'empty';

export default function AdminPlayersPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [capacity, setCapacity] = useState(128);
  const leftCapacity = Math.ceil(capacity / 2);
  const rightCapacity = Math.floor(capacity / 2);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Teams list
  const [teams, setTeams] = useState<Team[]>([]);

  // Original data from DB & current edited values
  const [playersData, setPlayersData] = useState<Record<number, { name: string; team_id: string }>>({});
  const [editedValues, setEditedValues] = useState<Record<number, { name: string; team_id: string }>>({});

  // Search & Filter
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('all');
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<number | null>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const cookies = document.cookie.split(';');
    const hasCookie = cookies.some((c) => c.trim().startsWith('admin_session='));

    if (hasCookie) {
      setIsAdmin(true);
      fetchInitialData();
      return;
    }

    try {
      const res = await fetch('/api/admin/check');
      const data = await res.json();
      if (data.isAdmin) {
        setIsAdmin(true);
        fetchInitialData();
      } else {
        setIsAdmin(false);
        setLoading(false);
      }
    } catch {
      setIsAdmin(false);
      setLoading(false);
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const { data: config } = await supabase.from('drawing_config').select('capacity').maybeSingle();
      const activeCapacity = config?.capacity || 128;
      setCapacity(activeCapacity);
      const [{ data: playersRes, error: pErr }, { data: teamsRes, error: tErr }] = await Promise.all([
        supabase.from('players').select('*').order('slot', { ascending: true }),
        supabase.from('teams').select('*').order('name', { ascending: true }),
      ]);

      if (pErr) throw pErr;
      if (tErr) console.warn('Could not load teams:', tErr);

      if (teamsRes) {
        setTeams(teamsRes as Team[]);
      }

      const pMap: Record<number, { name: string; team_id: string }> = {};
      const editMap: Record<number, { name: string; team_id: string }> = {};

      for (let i = 1; i <= activeCapacity; i++) {
        pMap[i] = { name: '', team_id: '' };
        editMap[i] = { name: '', team_id: '' };
      }

      if (playersRes) {
        playersRes.forEach((p: Player) => {
          if (p.slot >= 1 && p.slot <= activeCapacity) {
            const item = {
              name: p.name || '',
              team_id: p.team_id || '',
            };
            pMap[p.slot] = item;
            editMap[p.slot] = item;
          }
        });
      }

      setPlayersData(pMap);
      setEditedValues(editMap);
    } catch (err) {
      console.error('Gagal mengambil data player:', err);
      showToast('error', 'Gagal memuat daftar player dari database.');
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

  const handleNameChange = (slot: number, val: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [slot]: {
        ...(prev[slot] || { name: '', team_id: '' }),
        name: val,
      },
    }));
  };

  const handleTeamChange = (slot: number, val: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [slot]: {
        ...(prev[slot] || { name: '', team_id: '' }),
        team_id: val,
      },
    }));
  };

  const teamMap = useMemo(() => {
    const map: Record<string, Team> = {};
    teams.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [teams]);

  const dirtySlots = useMemo(() => {
    const list: number[] = [];
    for (let i = 1; i <= capacity; i++) {
      const orig = playersData[i] || { name: '', team_id: '' };
      const cur = editedValues[i] || { name: '', team_id: '' };
      if (cur.name !== orig.name || cur.team_id !== orig.team_id) {
        list.push(i);
      }
    }
    return list;
  }, [editedValues, playersData]);

  const handleSaveSlot = async (slot: number) => {
    const current = editedValues[slot] || { name: '', team_id: '' };
    const newName = current.name.trim();
    const newTeamId = current.team_id || null;
    setSavingSlot(slot);

    try {
      const { error } = await supabase
        .from('players')
        .upsert({
          slot,
          name: newName,
          team_id: newTeamId,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      const updatedItem = { name: newName, team_id: current.team_id };
      setPlayersData((prev) => ({ ...prev, [slot]: updatedItem }));
      setEditedValues((prev) => ({ ...prev, [slot]: updatedItem }));

      showToast('success', `Slot #${slot} ${newName ? `diperbarui: "${newName}"` : 'dikosongkan'}`);
    } catch (err) {
      console.error('Error saving slot:', err);
      showToast('error', `Gagal menyimpan Slot #${slot}`);
    } finally {
      setSavingSlot(null);
    }
  };

  const handleClearSlot = async (slot: number) => {
    setSavingSlot(slot);
    setConfirmDeleteSlot(null);

    try {
      const { error } = await supabase
        .from('players')
        .upsert({
          slot,
          name: '',
          team_id: null,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      const emptyItem = { name: '', team_id: '' };
      setPlayersData((prev) => ({ ...prev, [slot]: emptyItem }));
      setEditedValues((prev) => ({ ...prev, [slot]: emptyItem }));
      showToast('success', `Slot #${slot} berhasil dikosongkan.`);
    } catch (err) {
      console.error('Error clearing slot:', err);
      showToast('error', `Gagal mengosongkan Slot #${slot}`);
    } finally {
      setSavingSlot(null);
    }
  };

  const handleSaveAll = async () => {
    if (dirtySlots.length === 0) return;
    setIsBatchSaving(true);

    try {
      const upsertRows = dirtySlots.map((slot) => {
        const item = editedValues[slot] || { name: '', team_id: '' };
        return {
          slot,
          name: item.name.trim(),
          team_id: item.team_id || null,
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('players')
        .upsert(upsertRows);

      if (error) throw error;

      const updatedMap = { ...playersData };
      dirtySlots.forEach((slot) => {
        const item = editedValues[slot] || { name: '', team_id: '' };
        updatedMap[slot] = {
          name: item.name.trim(),
          team_id: item.team_id,
        };
      });

      setPlayersData(updatedMap);
      setEditedValues(updatedMap);
      showToast('success', `Berhasil menyimpan ${dirtySlots.length} perubahan slot.`);
    } catch (err) {
      console.error('Error batch saving:', err);
      showToast('error', 'Gagal menyimpan perubahan massal.');
    } finally {
      setIsBatchSaving(false);
    }
  };

  const handleResetAllEdits = () => {
    setEditedValues({ ...playersData });
    showToast('success', 'Semua perubahan yang belum disimpan telah dibatalkan.');
  };

  const filteredSlots = useMemo(() => {
    const slots: number[] = [];
    const query = search.trim().toLowerCase();

    for (let i = 1; i <= capacity; i++) {
      if (activeTab === 'left' && i > leftCapacity) continue;
      if (activeTab === 'right' && i <= leftCapacity) continue;

      const currentItem = editedValues[i] || { name: '', team_id: '' };
      const isFilled = currentItem.name.trim() !== '';

      if (activeTab === 'filled' && !isFilled) continue;
      if (activeTab === 'empty' && isFilled) continue;

      if (selectedTeamFilter !== 'all') {
        if (selectedTeamFilter === 'none' && currentItem.team_id) continue;
        if (selectedTeamFilter !== 'none' && currentItem.team_id !== selectedTeamFilter) continue;
      }

      if (query) {
        const matchSlot = i.toString().includes(query);
        const matchName = currentItem.name.toLowerCase().includes(query);
        const origName = (playersData[i]?.name || '').toLowerCase().includes(query);
        const teamObj = currentItem.team_id ? teamMap[currentItem.team_id] : null;
        const matchTeam = teamObj ? teamObj.name.toLowerCase().includes(query) : false;

        if (!matchSlot && !matchName && !origName && !matchTeam) {
          continue;
        }
      }

      slots.push(i);
    }

    return slots;
  }, [activeTab, selectedTeamFilter, search, editedValues, playersData, teamMap, capacity, leftCapacity]);

  const stats = useMemo(() => {
    let totalFilled = 0;
    let leftFilled = 0;
    let rightFilled = 0;
    let totalWithTeam = 0;

    for (let i = 1; i <= capacity; i++) {
      const p = playersData[i];
      const hasName = (p?.name || '').trim() !== '';
      if (hasName) {
        totalFilled++;
        if (i <= leftCapacity) leftFilled++;
        else rightFilled++;
        if (p?.team_id) totalWithTeam++;
      }
    }

    return {
      totalFilled,
      totalEmpty: capacity - totalFilled,
      leftFilled,
      leftEmpty: leftCapacity - leftFilled,
      rightFilled,
      rightEmpty: rightCapacity - rightFilled,
      totalWithTeam,
    };
  }, [playersData, capacity, leftCapacity, rightCapacity]);

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
    <div className="player-management" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            padding: '10px 18px', borderRadius: 4,
            background: toastMessage.type === 'success' ? '#10b981' : '#ef4444',
            color: '#ffffff', fontSize: 12, fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDeleteSlot !== null && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteSlot(null); }}>
          <div className="modal-panel" style={{ maxWidth: 360, padding: 22 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800, color: 'var(--accent-red)', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase' }}>
              Kosongkan Slot #{confirmDeleteSlot}?
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Nama <strong style={{ color: 'var(--text-primary)' }}>&quot;{playersData[confirmDeleteSlot]?.name}&quot;</strong> dan pilihan tim akan dihapus dari slot #{confirmDeleteSlot}.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteSlot(null)}
                className="btn-modern btn-secondary"
                style={{ padding: '6px 12px', fontSize: 10 }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleClearSlot(confirmDeleteSlot)}
                className="btn-modern btn-danger"
                style={{ padding: '6px 14px', fontSize: 10 }}
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Minimalist Header */}
      <header className="player-admin-header"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'rgba(10, 14, 26, 0.96)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '12px 20px',
        }}
      >
        <div style={{
          maxWidth: 1320, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          {/* Title Branding */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TournamentBrand />
            <div style={{ height: 16, width: 1, background: 'var(--border-subtle)' }} />
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              color: 'var(--accent-blue)', textTransform: 'uppercase', fontFamily: "'Oswald', sans-serif",
            }}>
              KELOLA PLAYER
            </span>
          </div>

          {/* Navigation Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/" className="btn-modern btn-secondary" style={{ padding: '6px 12px', fontSize: 10 }}>
              Bagan Turnamen
            </Link>
            <Link href="/admin/teams" className="btn-modern btn-secondary" style={{ padding: '6px 12px', fontSize: 10 }}>
              Kelola Tim ({teams.length})
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

      {/* Main Content */}
      <main className="player-admin-main" style={{ flex: 1, padding: '20px 20px 60px', maxWidth: 1320, margin: '0 auto', width: '100%' }}>

        {/* Stats Overview Cards */}
        <div className="player-admin-stats" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}>
          {/* Total Players */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              TOTAL PESERTA
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Oswald', sans-serif" }}>
                {stats.totalFilled}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>/ {capacity} Slot</span>
            </div>
            <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 2 }}>
              <div style={{ width: `${(stats.totalFilled / capacity) * 100}%`, height: '100%', background: 'var(--accent-emerald)' }} />
            </div>
          </div>

          {/* With Team */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              MEMILIH TIM
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-gold)', fontFamily: "'Oswald', sans-serif" }}>
                {stats.totalWithTeam}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>/ {stats.totalFilled} Player</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {stats.totalFilled - stats.totalWithTeam} belum pilih tim
            </span>
          </div>

          {/* Left Bracket Stats */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 3, height: 12, background: 'var(--accent-blue)' }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                BRACKET KIRI (1–{leftCapacity})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Oswald', sans-serif" }}>
                {stats.leftFilled}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>/ {leftCapacity}</span>
            </div>
          </div>

          {/* Right Bracket Stats */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 3, height: 12, background: 'var(--accent-red)' }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-red)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                BRACKET KANAN ({leftCapacity + 1}–{capacity})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Oswald', sans-serif" }}>
                {stats.rightFilled}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>/ {rightCapacity}</span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="player-admin-toolbar" style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          padding: '12px 16px', marginBottom: 18,
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          {/* Search Box */}
          <div style={{ flex: '1 1 220px', position: 'relative' }}>
            <input
              aria-label="Cari slot, pemain, atau tim"
              type="text"
              placeholder="Cari slot (24), player, atau tim..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px',
                background: 'rgba(10, 14, 26, 0.9)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)', fontSize: 11, outline: 'none', borderRadius: 3,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Tabs & Team Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveTab('all')}
                className={`admin-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
              >
                Semua ({stats.totalFilled + stats.totalEmpty})
              </button>
              <button
                onClick={() => setActiveTab('left')}
                className={`admin-tab-btn ${activeTab === 'left' ? 'active' : ''}`}
              >
                Kiri
              </button>
              <button
                onClick={() => setActiveTab('right')}
                className={`admin-tab-btn ${activeTab === 'right' ? 'active' : ''}`}
              >
                Kanan
              </button>
              <button
                onClick={() => setActiveTab('filled')}
                className={`admin-tab-btn ${activeTab === 'filled' ? 'active' : ''}`}
              >
                Terisi ({stats.totalFilled})
              </button>
              <button
                onClick={() => setActiveTab('empty')}
                className={`admin-tab-btn ${activeTab === 'empty' ? 'active' : ''}`}
              >
                Kosong ({stats.totalEmpty})
              </button>
            </div>

            {/* Team Dropdown Filter */}
            <select
              value={selectedTeamFilter}
              onChange={(e) => setSelectedTeamFilter(e.target.value)}
              style={{
                padding: '6px 10px', fontSize: 11, background: 'rgba(10, 14, 26, 0.9)',
                border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', borderRadius: 3,
              }}
            >
              <option value="all">Semua Tim</option>
              <option value="none">Belum Pilih Tim</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Actions Bar (when dirty slots exist) */}
          {dirtySlots.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 10px', background: 'rgba(141, 232, 198, 0.1)',
              border: '1px solid rgba(141, 232, 198, 0.3)', borderRadius: 3,
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-blue)' }}>
                {dirtySlots.length} diubah
              </span>
              <button
                onClick={handleSaveAll}
                disabled={isBatchSaving}
                className="btn-modern btn-primary"
                style={{ padding: '5px 12px', fontSize: 10 }}
              >
                {isBatchSaving ? 'Menyimpan...' : 'Simpan Semua'}
              </button>
              <button
                onClick={handleResetAllEdits}
                className="btn-modern btn-secondary"
                style={{ padding: '5px 8px', fontSize: 10 }}
              >
                Batal
              </button>
            </div>
          )}
        </div>

        {/* Player Slot Grid */}
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            Memuat daftar {capacity} slot player...
          </div>
        ) : filteredSlots.length === 0 ? (
          <div style={{
            padding: '48px 20px', textAlign: 'center', background: 'var(--bg-card)',
            border: '1px dashed var(--border-subtle)', color: 'var(--text-muted)', fontSize: 12,
          }}>
            Tidak ada slot yang cocok dengan filter atau kata kunci pencarian &quot;{search}&quot;.
          </div>
        ) : (
          <div className="player-editor-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 10,
          }}>
            {filteredSlots.map((slotNum) => {
              const original = playersData[slotNum] || { name: '', team_id: '' };
              const current = editedValues[slotNum] || { name: '', team_id: '' };
              const isDirty = current.name !== original.name || current.team_id !== original.team_id;
              const isSaving = savingSlot === slotNum;
              const isLeftBracket = slotNum <= leftCapacity;
              const matchNum = Math.ceil(slotNum / 2);
              const opponentSlot = slotNum % 2 === 1 ? slotNum + 1 : slotNum - 1;
              const selectedTeam = current.team_id ? teamMap[current.team_id] : null;

              return (
                <div
                  key={slotNum}
                  className={`player-editor ${isDirty ? 'is-dirty' : ''} ${isLeftBracket ? 'is-left' : 'is-right'}`}
                  style={{
                    background: isDirty ? 'rgba(141, 232, 198, 0.05)' : 'var(--bg-card)',
                    border: isDirty ? '1px solid rgba(141, 232, 198, 0.5)' : '1px solid var(--border-subtle)',
                    padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  {/* Slot Header */}
                  <div className="player-editor-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="player-slot-number" style={{
                        minWidth: 32, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 800, fontFamily: "'Oswald', sans-serif",
                        color: isLeftBracket ? 'var(--accent-blue)' : 'var(--accent-red)',
                        background: 'rgba(141, 232, 198, 0.12)',
                        border: '1px solid rgba(141, 232, 198, 0.3)',
                      }}>
                        #{slotNum}
                      </span>

                      <span className="player-slot-meta" style={{
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                        color: isLeftBracket ? 'var(--accent-blue)' : 'var(--accent-red)',
                      }}>
                        {isLeftBracket ? 'Kiri' : 'Kanan'} • Match #{matchNum}
                      </span>
                    </div>

                    <div className="player-slot-opponent" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                      vs Slot #{opponentSlot}
                    </div>
                  </div>

                  {/* Player Name Input */}
                  <div>
                    <label htmlFor={`player-name-${slotNum}`} style={{ display: 'block', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                      Nama pemain
                    </label>
                    <input
                      id={`player-name-${slotNum}`}
                      type="text"
                      placeholder="Masukkan nama pemain"
                      value={current.name}
                      onChange={(e) => handleNameChange(slotNum, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && isDirty) {
                          handleSaveSlot(slotNum);
                        }
                      }}
                      style={{
                        width: '100%', padding: '6px 9px',
                        background: 'rgba(10, 14, 26, 0.85)',
                        border: isDirty ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
                        color: current.name ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontSize: 11, fontWeight: current.name ? 600 : 400,
                        outline: 'none', borderRadius: 2,
                      }}
                    />
                  </div>

                  {/* Team Selection Dropdown */}
                  <div>
                    <label htmlFor={`player-team-${slotNum}`} style={{ display: 'block', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                      Tim
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div
                        className="player-team-logo"
                        style={{
                          width: 24, height: 24, background: 'rgba(10, 14, 26, 0.8)',
                          border: '1px solid var(--border-subtle)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 2,
                        }}
                      >
                        {selectedTeam?.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedTeam.logo_url}
                            alt={selectedTeam.name}
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          />
                        ) : (
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>-</span>
                        )}
                      </div>
                      <select
                        id={`player-team-${slotNum}`}
                        value={current.team_id}
                        onChange={(e) => handleTeamChange(slotNum, e.target.value)}
                        style={{
                          flex: 1, padding: '5px 8px', fontSize: 11,
                          background: 'rgba(10, 14, 26, 0.85)',
                          border: '1px solid var(--border-subtle)',
                          color: current.team_id ? 'var(--text-primary)' : 'var(--text-muted)',
                          outline: 'none', borderRadius: 2,
                        }}
                      >
                        <option value="">Belum pilih tim</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="player-editor-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className={`player-save-status ${isDirty ? 'is-unsaved' : ''}`}>{isSaving ? 'Menyimpan…' : isDirty ? 'Belum disimpan' : current.name || current.team_id ? 'Tersimpan' : 'Slot kosong'}</span>
                    {(original.name || current.name || original.team_id || current.team_id) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (original.name || original.team_id) {
                            setConfirmDeleteSlot(slotNum);
                          } else {
                            handleNameChange(slotNum, '');
                            handleTeamChange(slotNum, '');
                          }
                        }}
                        disabled={isSaving}
                        className="btn-modern btn-danger"
                        style={{ padding: '4px 8px', fontSize: 9 }}
                      >
                        Kosongkan
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSaveSlot(slotNum)}
                      disabled={isSaving || !isDirty}
                      className={`btn-modern ${isDirty ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 10px', fontSize: 9 }}
                    >
                      {isSaving ? 'Menyimpan…' : 'Simpan'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </main>
    </div>
  );
}
