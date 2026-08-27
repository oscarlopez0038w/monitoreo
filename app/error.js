'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ShieldAlert, RefreshCw, Home } from 'lucide-react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('Error no capturado detectado en la aplicación:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'var(--bg-dark)',
        color: 'var(--text-main)',
      }}
    >
      <div
        className="glass-card"
        style={{
          maxWidth: '520px',
          width: '100%',
          padding: '2.5rem',
          textAlign: 'center',
          border: '1px solid rgba(251, 113, 133, 0.3)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'rgba(251, 113, 133, 0.15)',
            border: '1px solid rgba(251, 113, 133, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}
        >
          <ShieldAlert size={32} color="#fb7185" />
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem', color: '#ffffff' }}>
          Ocurrió un error inesperado
        </h2>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.8rem', lineHeight: '1.6' }}>
          {error?.message || 'La aplicación experimentó un problema temporal. Puedes reintentar cargar la vista o volver al dashboard.'}
        </p>

        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => reset()}
            className="btn-primary"
            style={{ padding: '0.65rem 1.3rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={16} />
            Reintentar Cargar
          </button>

          <Link href="/" className="btn-secondary" style={{ padding: '0.65rem 1.3rem', fontSize: '0.85rem' }}>
            <Home size={16} />
            Ir al Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
