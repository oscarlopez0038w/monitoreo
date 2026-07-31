'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Layers, ShieldAlert, Tag, ShoppingCart, Zap, ShieldCheck, X } from 'lucide-react';

export default function Sidebar({ vtexStatus, supabaseStatus, mobileOpen, onCloseMobile }) {
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
    <>
      {/* Backdrop for Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: 90,
          }}
          className="mobile-backdrop"
        />
      )}

      <aside
        style={{
          width: '260px',
          flexShrink: 0,
          height: '100vh',
          position: 'sticky',
          top: 0,
          background: 'rgba(11, 15, 25, 0.95)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '1.25rem 1rem',
          zIndex: 100,
        }}
        className={`app-sidebar ${mobileOpen ? 'mobile-sidebar-open' : ''}`}
      >
        {/* Top Header & Brand Logo */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.5rem 1.25rem 0.5rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
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

            {/* Mobile Close Button */}
            <button
              onClick={onCloseMobile}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'none' }}
              className="sidebar-close-btn"
            >
              <X size={20} />
            </button>
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
                  onClick={() => {
                    if (onCloseMobile) onCloseMobile();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 0.95rem',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    fontWeight: isActive ? 600 : 500,
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                    border: isActive ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid transparent',
                    boxShadow: isActive ? '0 4px 15px rgba(56, 189, 248, 0.15)' : 'none',
                    minHeight: '44px',
                  }}
                >
                  <IconComponent size={19} color={isActive ? item.color : 'var(--text-dim)'} />
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

      <style jsx global>{`
        @media (max-width: 768px) {
          .app-sidebar {
            position: fixed !important;
            top: 0 !important;
            bottom: 0 !important;
            left: 0 !important;
            height: 100vh !important;
            transform: translateX(-100%);
            transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 4px 0 25px rgba(0, 0, 0, 0.6);
          }
          .mobile-sidebar-open {
            transform: translateX(0) !important;
          }
          .sidebar-close-btn {
            display: flex !important;
          }
        }
      `}</style>
    </>
  );
}
