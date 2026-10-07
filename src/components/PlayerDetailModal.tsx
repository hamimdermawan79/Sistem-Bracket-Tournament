'use client';

import React from 'react';
import { Player, Team } from '@/types/tournament';

interface PlayerDetailModalProps {
  isOpen: boolean;
  player: Player | null;
  team: Team | null;
  isAdmin?: boolean;
  onClose: () => void;
  onEditPlayer?: (slot: number) => void;
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({
  isOpen,
  player,
  team,
  isAdmin,
  onClose,
  onEditPlayer,
}) => {
  if (!isOpen || !player) return null;

  const isLeftBracket = player.slot <= 64;
  const matchNum = Math.ceil(player.slot / 2);
  const opponentSlot = player.slot % 2 === 1 ? player.slot + 1 : player.slot - 1;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="modal-panel"
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'linear-gradient(180deg, rgba(16, 22, 42, 0.98) 0%, rgba(10, 14, 26, 0.98) 100%)',
          border: '1px solid rgba(74, 124, 255, 0.3)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(74, 124, 255, 0.15)',
          padding: '24px 28px',
          position: 'relative',
          borderRadius: 0,
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 22,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 4,
          }}
          title="Tutup"
        >
          ×
        </button>

        {/* Header Tag */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                fontFamily: "'Oswald', sans-serif",
                letterSpacing: '0.08em',
                padding: '3px 8px',
                background: isLeftBracket ? 'rgba(74, 124, 255, 0.15)' : 'rgba(232, 64, 87, 0.15)',
                border: `1px solid ${isLeftBracket ? 'rgba(74, 124, 255, 0.4)' : 'rgba(232, 64, 87, 0.4)'}`,
                color: isLeftBracket ? 'var(--accent-blue)' : 'var(--accent-red)',
                textTransform: 'uppercase',
              }}
            >
              SLOT #{player.slot} • {isLeftBracket ? 'BRACKET KIRI' : 'BRACKET KANAN'}
            </span>
          </div>

          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Match #{matchNum} (vs #{opponentSlot})
          </span>
        </div>

        {/* Center Team Logo Display */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '18px 0 14px',
            background: 'radial-gradient(circle, rgba(74, 124, 255, 0.08) 0%, transparent 70%)',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 8,
              marginBottom: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {team?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logo_url}
                alt={team.name}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                NO LOGO
              </span>
            )}
          </div>

          {/* Team Name */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: team ? 'var(--accent-gold)' : 'var(--text-muted)',
              marginBottom: 2,
            }}
          >
            {team ? team.name : 'Belum Memilih Tim'}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            TIM PILIHAN
          </div>
        </div>

        {/* Player Information Card */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            NAMA PLAYER
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              fontFamily: "'Oswald', sans-serif",
              letterSpacing: '0.04em',
              color: player.name ? 'var(--text-primary)' : 'var(--text-muted)',
              background: 'rgba(10, 14, 26, 0.6)',
              border: '1px solid var(--border-subtle)',
              padding: '8px 12px',
              fontStyle: player.name ? 'normal' : 'italic',
            }}
          >
            {player.name || '[Slot Kosong]'}
          </div>
        </div>

        {/* Details Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 20,
          }}
        >
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: player.name ? 'var(--accent-emerald)' : 'var(--accent-red)', marginTop: 2 }}>
              {player.name ? 'Terisi' : 'Kosong'}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Klub / Tim</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: team ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {team ? team.name : '-'}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {isAdmin && onEditPlayer && (
            <button
              onClick={() => {
                onClose();
                onEditPlayer(player.slot);
              }}
              className="btn-modern btn-primary"
              style={{ padding: '7px 14px', fontSize: 11 }}
            >
              Edit Player & Tim
            </button>
          )}
          <button
            onClick={onClose}
            className="btn-modern btn-secondary"
            style={{ padding: '7px 16px', fontSize: 11 }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
