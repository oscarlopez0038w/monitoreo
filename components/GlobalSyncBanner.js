'use client';

import { useState, useEffect } from 'react';
import { Zap, Square, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function GlobalSyncBanner() {
  const [syncData, setSyncData] = useState(null);
  const [stopping, setStopping] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/prices/sync/background');
      const json = await res.json();
      if (json.success) {
        setSyncData(json);
      }
    } catch (err) {
      console.error('Error consultando estado de sincronización:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000); // Polling ligero en tiempo real cada 2s
    return () => clearInterval(interval);
  }, []);

  if (!syncData || !syncData.syncState?.isRunning) {
    return null; // Si no hay sincronización activa en segundo plano, no se muestra nada
  }

  const { syncState } = syncData;
  const progressPct = syncState?.progressPct || 0;
  const pricedCount = syncState?.pricedCount || 0;
  const totalCatalog = syncState?.totalCatalog || 82234;

  const handleStop = async () => {
    setStopping(true);
    try {
      await fetch('/api/prices/sync/background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      fetchStatus();
    } catch (err) {
      console.error('Error deteniendo sincronización:', err);
    } finally {
      setStopping(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        width: '380px',
        maxWidth: '90vw',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(56, 189, 248, 0.4)',
        borderRadius: '16px',
        padding: '1.1rem 1.25rem',
        boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.7), 0 0 20px rgba(56, 189, 248, 0.2)',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={16} color="#38bdf8" className="animate-pulse" />
          </div>
          <div>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
              Sincronizando Precios en Segundo Plano
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Procesando catálogo masivo VTEX
            </div>
          </div>
        </div>

        <button
          onClick={handleStop}
          disabled={stopping}
          style={{
            background: 'rgba(248, 113, 113, 0.15)',
            border: '1px solid rgba(248, 113, 113, 0.4)',
            color: '#fb7185',
            fontSize: '0.72rem',
            fontWeight: 600,
            padding: '0.25rem 0.6rem',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            transition: 'all 0.2s ease',
          }}
        >
          <Square size={10} /> {stopping ? 'Pausando...' : 'Pausar'}
        </button>
      </div>

      {/* Counter & Progress bar */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
          <span style={{ color: 'var(--text-dim)' }}>
            <strong>{pricedCount.toLocaleString()}</strong> / {totalCatalog.toLocaleString()} SKUs
          </span>
          <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {progressPct}%
          </span>
        </div>

        <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background: 'linear-gradient(to right, #38bdf8, #34d399)',
              borderRadius: '4px',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' }}>
        <RefreshCw size={11} className="animate-spin" color="#38bdf8" />
        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {syncState?.message || 'Sincronizando precios en segundo plano...'}
        </span>
      </div>
    </div>
  );
}
