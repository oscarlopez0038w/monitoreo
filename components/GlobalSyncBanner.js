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
    const interval = setInterval(fetchStatus, 3500); // Polling ligero cada 3.5s
    return () => clearInterval(interval);
  }, []);

  if (!syncData || !syncData.syncState?.isRunning) {
    return null; // Si no hay sincronización activa en segundo plano, no se muestra nada
  }

  const { syncState, stats } = syncData;
  const progressPct = stats?.progressPct || 0;

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
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(56, 189, 248, 0.4)',
        borderRadius: '16px',
        padding: '0.95rem 1.15rem',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.2)',
        color: '#ffffff',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', fontWeight: 700, color: '#38bdf8' }}>
          <Zap size={16} className="animate-pulse" color="#38bdf8" />
          <span>Sincronizando Precios en Segundo Plano</span>
        </div>

        <button
          onClick={handleStop}
          disabled={stopping}
          className="btn-secondary"
          style={{
            padding: '0.2rem 0.5rem',
            fontSize: '0.72rem',
            borderColor: 'rgba(248, 113, 113, 0.4)',
            color: '#fb7185',
            borderRadius: '6px',
          }}
        >
          <Square size={11} /> {stopping ? 'Deteniendo...' : 'Pausar'}
        </button>
      </div>

      {/* Progress Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
        <span>{stats?.pricedCount?.toLocaleString()} / {stats?.totalCount?.toLocaleString()} SKUs</span>
        <strong style={{ color: '#34d399' }}>{progressPct}%</strong>
      </div>

      {/* Progress Bar */}
      <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${progressPct}%`,
            height: '100%',
            background: 'linear-gradient(to right, #38bdf8, #34d399)',
            borderRadius: '3px',
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.45rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {syncState.message}
      </p>
    </div>
  );
}
