'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import GlobalSyncBanner from '@/components/GlobalSyncBanner';
import { Menu, X, Zap, ShieldAlert, Lock, ArrowLeft, RefreshCw } from 'lucide-react';

const ROUTE_PERMISSIONS = {
  '/': { code: 'dashboard:view', name: 'Dashboard de Ventas & KPIs' },
  '/dashboard': { code: 'dashboard:view', name: 'Dashboard de Ventas & KPIs' },
  '/inventario': { code: 'skus:view', name: 'Inventario & SKUs' },
  '/tendencias': { code: 'tendencias:view', name: 'Tendencias E-Commerce' },
  '/minisplits': { code: 'kits:manage', name: 'Kits VTEX & Combos' },
  '/stock-seguridad': { code: 'safety_stock:manage', name: 'Stock de Seguridad' },
  '/precios': { code: 'prices:manage', name: 'Precios VTEX' },
  '/vitrinas': { code: 'showcases:manage', name: 'Vitrinas Destacadas Home' },
  '/simulador': { code: 'simulador:use', name: 'Simulador de Carrito' },
  '/ordenes': { code: 'orders:view', name: 'Órdenes VTEX OMS' },
  '/marketing': { code: 'marketing:view', name: 'Marketing & UTMs' },
  '/patrones': { code: 'patrones:view', name: 'Patrones de Compra & Horarios' },
  '/usuarios': { code: 'users:manage', name: 'Administración de Usuarios & Permisos' },
};

export default function AppLayout({ children }) {
  const [stats, setStats] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newTxCount, setNewTxCount] = useState(0);
  const [user, setUser] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
    }
  };

  const loadUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('vtex_user_session', JSON.stringify(data.user));
        }
      }
    } catch (e) {
      // Silencioso
    } finally {
      setIsLoadingUser(false);
    }
  };

  const checkNewTransactions = async () => {
    try {
      const res = await fetch('/api/transactions?limit=15');
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const latestTx = data.data[0];
        const latestKey = String(latestTx.key || latestTx.transactionId || '');
        const savedKey = typeof window !== 'undefined' ? localStorage.getItem('vtex_last_seen_tx_key') : null;

        if (!savedKey) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('vtex_last_seen_tx_key', latestKey);
          }
          setNewTxCount(0);
        } else if (savedKey !== latestKey) {
          let unreadIndex = data.data.findIndex(
            (tx) => String(tx.key || tx.transactionId || '') === savedKey
          );
          let count = unreadIndex === -1 ? data.data.length : unreadIndex;

          if (pathname === '/transacciones') {
            if (typeof window !== 'undefined') {
              localStorage.setItem('vtex_last_seen_tx_key', latestKey);
            }
            setNewTxCount(0);
          } else {
            setNewTxCount(count);
          }
        } else {
          if (pathname === '/transacciones') {
            setNewTxCount(0);
          }
        }
      }
    } catch (err) {
      console.error('Error verificando notificaciones de transacciones:', err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('vtex_user_session');
        if (cached) {
          setUser(JSON.parse(cached));
          setIsLoadingUser(false);
        }
      } catch (e) {}
    }
    fetchStats();
    loadUser();
  }, []);

  useEffect(() => {
    checkNewTransactions();
    const interval = setInterval(checkNewTransactions, 20000);
    return () => clearInterval(interval);
  }, [pathname]);

  // Evaluador instantáneo de permisos de la ruta actual
  const currentRoutePerm = ROUTE_PERMISSIONS[pathname];
  let isAccessAllowed = true;
  let missingPermName = '';

  if (currentRoutePerm && user) {
    const isSuperAdmin = user.role === 'Administrador Ejecutivo';
    const hasWildcard = user.permissions?.includes('*');
    const hasSpecificPerm = user.permissions?.includes(currentRoutePerm.code);

    if (!isSuperAdmin && !hasWildcard && !hasSpecificPerm) {
      isAccessAllowed = false;
      missingPermName = currentRoutePerm.name;
    }
  }

  // Buscar primera ruta permitida para botón de retorno
  const firstAllowedRoute = user
    ? Object.keys(ROUTE_PERMISSIONS).find((path) => {
        if (user.role === 'Administrador Ejecutivo') return true;
        if (user.permissions?.includes('*')) return true;
        return user.permissions?.includes(ROUTE_PERMISSIONS[path].code);
      }) || '/dashboard'
    : '/dashboard';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* Mobile Top Navigation Header Bar */}
      <header
        style={{
          display: 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'rgba(11, 15, 25, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
          position: 'sticky',
          top: 0,
          zIndex: 60,
        }}
        className="mobile-header"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #38bdf8, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={18} color="#ffffff" />
          </div>
          <div>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em', display: 'block', lineHeight: '1.1' }}>
              SINSA OMS
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
              Monitoreo Ejecutivo
            </span>
          </div>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            color: '#ffffff',
            padding: '0.45rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            minWidth: '44px',
            minHeight: '44px',
          }}
          aria-label="Abrir menú"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Main Body Container */}
      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        <Sidebar
          vtexStatus={stats?.vtex}
          supabaseStatus={stats?.supabase}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          newTxCount={newTxCount}
        />

        {/* Main Content Area with Instant Route Protection */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: '1.25rem 1.25rem 2.5rem 1.25rem',
            width: '100%',
          }}
          className="app-main-content"
        >
          {!isMounted || isLoadingUser ? (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
              <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                <RefreshCw size={32} color="#38bdf8" className="animate-spin" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff' }}>Verificando permisos de acceso RBAC...</span>
              </div>
            </div>
          ) : !isAccessAllowed ? (
            <div
              style={{
                maxWidth: '650px',
                margin: '4rem auto',
                background: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '24px',
                padding: '2.5rem',
                textAlign: 'center',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  padding: '1.1rem',
                  background: 'rgba(239, 68, 68, 0.15)',
                  borderRadius: '50%',
                  color: '#f87171',
                  marginBottom: '1.25rem',
                }}
              >
                <Lock size={42} />
              </div>
              <h2 style={{ color: '#ffffff', fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>
                Acceso Restringido (Permiso RBAC Insuficiente)
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.92rem', margin: '0 0 1.5rem 0', lineHeight: '1.6' }}>
                Tu usuario actual (<strong>{user?.name || user?.email}</strong>) tiene asignado el rol <strong>"{user?.role}"</strong>, el cual no posee el permiso concedido para acceder al módulo <strong>"{missingPermName}"</strong>.
              </p>

              <button
                onClick={() => router.push(firstAllowedRoute)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.8rem 1.5rem',
                  background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px -4px rgba(56, 189, 248, 0.4)',
                }}
              >
                <ArrowLeft size={18} />
                Regresar a un Módulo Autorizado
              </button>
            </div>
          ) : (
            children
          )}
        </div>
      </div>

      <GlobalSyncBanner />

      <style jsx global>{`
        @media (max-width: 768px) {
          .mobile-header {
            display: flex !important;
          }
          .app-main-content {
            padding: 1rem 0.85rem 2rem 0.85rem !important;
          }
        }
      `}</style>
    </div>
  );
}
