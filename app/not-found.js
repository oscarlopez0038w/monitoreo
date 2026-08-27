import Link from 'next/link';
import { HelpCircle, Home } from 'lucide-react';

export default function NotFound() {
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
          maxWidth: '480px',
          width: '100%',
          padding: '2.5rem',
          textAlign: 'center',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}
        >
          <HelpCircle size={32} color="#38bdf8" />
        </div>

        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#38bdf8', marginBottom: '0.2rem' }}>
          404
        </h1>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', color: '#ffffff' }}>
          Página No Encontrada
        </h2>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.8rem', lineHeight: '1.6' }}>
          La página o recurso que buscas no existe o ha sido movido en Sinsa | VTEX Monitoring.
        </p>

        <Link href="/" className="btn-primary" style={{ padding: '0.65rem 1.4rem', fontSize: '0.85rem' }}>
          <Home size={16} />
          Volver al Dashboard
        </Link>
      </div>
    </div>
  );
}
