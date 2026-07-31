'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Layers, ShieldAlert, Tag, ShoppingCart, Zap, Database, ShieldCheck, AlertCircle } from 'lucide-react';

export default function Sidebar({ vtexStatus, supabaseStatus }) {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Dashboard Ventas',
      href: '/dashboard',
      icon: LayoutDashboard,
      color: '#38bdf8',
    },
    {
      label: 'Inventario & SKUs',
      href: '/',
      icon: Layers,
      color: 'var(--accent-primary)',
    },
    {
      label: 'Stock de Seguridad',
      href: '/stock-seguridad',
      icon: ShieldAlert,
      color: 'var(--accent-amber)',
    },
    {
      label: 'Precios VTEX',
      href: '/precios',
      icon: Tag,
      color: '#a5b4fc',
    },
    {
      label: 'Órdenes VTEX OMS',
      href: '/ordenes',
      icon: ShoppingCart,
      color: '#34d399',
    },
  ];

  return (
    <aside
      style={{
        width: '260px',
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        background: 'rgba(11, 15, 25, 0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '1.25rem 1rem',
        zIndex: 50,
      }}
    >
      {/* Top Header & Brand Logo */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.5rem 0.5rem 1.5rem 0.5rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'var(--gradient-btn)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 18px rgba(56, 189, 248, 0.35)',
              flexShrink: 0,
            }}
          >
            <Zap size={22} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              VTEX Extractor
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--accent-primary)' }}>SINSA</strong> • Monitoring
            </p>
          </div>
        </div>

        {/* Navigation Section */}
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600, paddingLeft: '0.75rem', marginBottom: '0.6rem', letterSpacing: '0.05em' }}>
          Menú Principal
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const IconComponent = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '12px',
                  fontSize: '0.86rem',
                  fontWeight: isActive ? 600 : 500,
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                  background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-muted)',
                  border: isActive ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid transparent',
                  boxShadow: isActive ? '0 4px 15px rgba(56, 189, 248, 0.15)' : 'none',
                }}
              >
                <IconComponent size={18} color={isActive ? item.color : 'var(--text-dim)'} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer System Status Badges */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
        {/* SKUs Activos Badge */}
        {typeof supabaseStatus?.activeSkus === 'number' && (
          <div
            style={{
              background: 'rgba(52, 211, 153, 0.12)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              borderRadius: '12px',
              padding: '0.65rem 0.85rem',
              marginBottom: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              fontSize: '0.82rem',
              color: '#34d399',
            }}
          >
            <ShieldCheck size={16} color="#34d399" />
            <div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>SKUs Activos</span>
              <strong style={{ fontSize: '0.95rem', color: '#ffffff' }}>{supabaseStatus.activeSkus.toLocaleString('es-NI')}</strong>
            </div>
          </div>
        )}

        {/* Integration Status summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>VTEX API:</span>
            <span style={{ color: vtexStatus?.configured ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
              {vtexStatus?.configured ? '● Conectado' : '○ Pendiente'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Supabase:</span>
            <span style={{ color: supabaseStatus?.configured ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
              {supabaseStatus?.configured ? '● Conectado' : '○ Sin Configurar'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
