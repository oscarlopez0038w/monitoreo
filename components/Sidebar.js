'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Layers,
  ShieldAlert,
  Tag,
  ShoppingCart,
  Zap,
  ShieldCheck,
  X,
  Gift,
  CreditCard,
  TrendingUp,
  User,
  LogOut,
  Users,
  Megaphone,
  Clock,
  Filter,
  BookOpen,
  Truck,
  Sparkles,
  Package,
} from 'lucide-react';

export default function Sidebar({ vtexStatus, supabaseStatus, mobileOpen, onCloseMobile, newTxCount = 0 }) {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const router = useRouter();

  const navItems = [
    {
      label: 'Dashboard Ventas',
      href: '/',
      icon: LayoutDashboard,
      color: '#38bdf8',
      permission: 'dashboard:view',
    },
    {
      label: 'Tendencias E-Commerce',
      href: '/tendencias',
      icon: TrendingUp,
      color: '#10b981',
      permission: 'tendencias:view',
    },
    {
      label: 'Patrones de Compra',
      href: '/patrones',
      icon: Clock,
      color: '#fbbf24',
      permission: 'patrones:view',
    },
    {
      label: 'Embudo de Checkout',
      href: '/embudo',
      icon: Filter,
      color: '#34d399',
      permission: 'embudo:view',
    },
    {
      label: 'Publicidad & Extractor PDP',
      href: '/marketing',
      icon: Megaphone,
      color: '#a5b4fc',
      permission: 'marketing:view',
    },
    {
      label: 'Inventario & SKUs',
      href: '/inventario',
      icon: Layers,
      color: 'var(--accent-primary)',
      permission: 'skus:view',
    },
    {
      label: 'Kits & Combos VTEX',
      href: '/minisplits',
      icon: Package,
      color: '#38bdf8',
      permission: 'kits:manage',
    },
    {
      label: 'Stock de Seguridad',
      href: '/stock-seguridad',
      icon: ShieldAlert,
      color: 'var(--accent-amber)',
      permission: 'safety_stock:manage',
    },

    {
      label: 'Precios VTEX',
      href: '/precios',
      icon: Tag,
      color: '#a5b4fc',
      permission: 'prices:manage',
    },
    {
      label: 'Vitrinas Home',
      href: '/vitrinas',
      icon: Sparkles,
      color: '#38bdf8',
      permission: 'showcases:manage',
    },
    {
      label: 'Simulador Carrito',
      href: '/simulador',
      icon: Gift,
      color: '#e879f9',
      permission: 'simulador:use',
    },
    {
      label: 'Órdenes VTEX OMS',
      href: '/ordenes',
      icon: ShoppingCart,
      color: '#34d399',
      permission: 'orders:view',
    },
    {
      label: 'Transacciones VTEX',
      href: '/transacciones',
      icon: CreditCard,
      color: '#f43f5e',
      permission: 'transactions:view',
    },
    {
      label: 'Gestión Usuarios',
      href: '/usuarios',
      icon: Users,
      color: '#c084fc',
      permission: 'users:manage',
    },
  ];

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

    async function loadUser() {
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
    }

    async function loadPendingUsers() {
      try {
        const res = await fetch('/api/users?status=pending');
        const data = await res.json();
        if (data.success && data.stats) {
          setPendingUsersCount(data.stats.pending || 0);
        }
      } catch (e) {
        // Silencioso
      }
    }

    loadUser();
    loadPendingUsers();
  }, []);

  const handleLogout = async () => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('vtex_user_session');
      }
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (e) {
      router.push('/login');
    }
  };

  // Filtrar estrictamente las opciones de menú según los permisos concedidos al rol en la matriz RBAC
  const visibleNavItems = navItems.filter((item) => {
    if (!user) return false;
    if (user.role === 'Administrador Ejecutivo') return true;
    if (user.permissions?.includes('*')) return true;
    return user.permissions?.includes(item.permission);
  });

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 49,
          }}
          className="mobile-backdrop"
        />
      )}

      {/* Sidebar Main Drawer Container */}
      <aside
        style={{
          width: '270px',
          minWidth: '270px',
          background: 'rgba(11, 15, 25, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem 1rem 1rem 1rem',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 50,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
        className={`app-sidebar ${mobileOpen ? 'mobile-open' : ''}`}
      >
        {/* Fixed Header Section (Logo + Title) */}
        <div style={{ flexShrink: 0, marginBottom: '0.85rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.25rem',
              padding: '0 0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(56, 189, 248, 0.35)',
                }}
              >
                <Zap size={22} color="#ffffff" />
              </div>
              <div>
                <h1
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                    margin: 0,
                    lineHeight: '1.1',
                  }}
                >
                  VTEX Extractor
                </h1>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--accent-primary)',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                  }}
                >
                  SINSA • Monitoring
                </span>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={onCloseMobile}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'none',
                padding: '0.4rem',
              }}
              className="mobile-close-btn"
            >
              <X size={20} />
            </button>
          </div>

          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '0 0.75rem',
              display: 'block',
            }}
          >
            Menú Principal
          </span>
        </div>

        {/* Scrollable Navigation Area (Only module titles scroll) */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            paddingRight: '0.2rem',
            marginRight: '-0.2rem',
            marginBottom: '0.75rem',
          }}
          className="custom-sidebar-scroll"
        >
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {!isMounted || isLoadingUser ? (
              <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center' }}>
                Cargando permisos RBAC...
              </div>
            ) : visibleNavItems.length === 0 ? (
              <div style={{ padding: '1rem', color: '#fca5a5', fontSize: '0.8rem', textAlign: 'center' }}>
                ⚠️ Rol sin permisos de menú concedidos
              </div>
            ) : (
              visibleNavItems.map((item) => {
                const isActive = pathname === item.href;
                const IconComponent = item.icon;
                const isTxItem = item.href === '/transacciones';
                const isUserItem = item.href === '/usuarios';
                const showBadge = isTxItem ? newTxCount > 0 : isUserItem ? pendingUsersCount > 0 : false;
                const badgeCount = isTxItem ? newTxCount : pendingUsersCount;
                const badgeColor = isTxItem ? 'linear-gradient(135deg, #ef4444, #f43f5e)' : 'linear-gradient(135deg, #f59e0b, #d97706)';

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
                      position: 'relative',
                    }}
                  >
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <IconComponent size={19} color={isActive ? item.color : 'var(--text-dim)'} />
                      {showBadge && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '-4px',
                            right: '-4px',
                            width: '9px',
                            height: '9px',
                            borderRadius: '50%',
                            backgroundColor: isTxItem ? '#f43f5e' : '#f59e0b',
                            boxShadow: isTxItem ? '0 0 10px #f43f5e' : '0 0 10px #f59e0b',
                            border: '2px solid rgba(11, 15, 25, 0.95)',
                          }}
                        />
                      )}
                    </div>
                    <span>{item.label}</span>

                    {showBadge && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          background: badgeColor,
                          color: '#ffffff',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.55rem',
                          borderRadius: '20px',
                          boxShadow: isTxItem ? '0 0 14px rgba(244, 63, 94, 0.6)' : '0 0 14px rgba(245, 158, 11, 0.6)',
                          letterSpacing: '0.02em',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '22px',
                          height: '20px',
                        }}
                      >
                        {badgeCount > 99 ? '99+' : isTxItem ? `+${badgeCount}` : badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })
            )}
          </nav>
        </div>

        {/* Fixed Footer Section (User Profile Card & System Status) */}
        <div style={{ flexShrink: 0, paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* User Profile Card */}
          {user && (
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '0.75rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #38bdf8, #2563eb)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    flexShrink: 0,
                  }}
                >
                  <User size={16} />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <strong
                    style={{
                      color: '#ffffff',
                      fontSize: '0.84rem',
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {user.name || 'Usuario'}
                  </strong>
                  <span style={{ color: '#38bdf8', fontSize: '0.7rem', fontWeight: 600, display: 'block' }}>
                    {user.role}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowLogoutConfirm(true)}
                title="Cerrar Sesión"
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '8px',
                  color: '#fca5a5',
                  padding: '0.4rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          )}

          {/* System Connection Indicators */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.4)',
              borderRadius: '12px',
              padding: '0.65rem 0.85rem',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              fontSize: '0.74rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.35rem',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>VTEX API:</span>
              <span
                style={{
                  color: (vtexStatus === 'online' || vtexStatus?.configured === true) ? '#34d399' : '#f87171',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                ● {(vtexStatus === 'online' || vtexStatus?.configured === true) ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Supabase:</span>
              <span
                style={{
                  color: (supabaseStatus === 'online' || supabaseStatus?.configured === true) ? '#34d399' : '#f87171',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                ● {(supabaseStatus === 'online' || supabaseStatus?.configured === true) ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Modal Confirmación de Cerrar Sesión (Centrado en Pantalla Completa) */}
      {showLogoutConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(11, 15, 25, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.99))',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 30px rgba(248, 113, 113, 0.15)',
              borderRadius: '18px',
              maxWidth: '420px',
              width: '100%',
              padding: '1.5rem',
              color: '#ffffff',
              boxSizing: 'border-box',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem auto',
                color: '#f87171',
              }}
            >
              <LogOut size={24} />
            </div>

            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0 0 0.5rem 0' }}>
              ¿Estás seguro de que deseas salir?
            </h3>

            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: '0 0 1.5rem 0', lineHeight: '1.4' }}>
              Cerrarás la sesión activa de tu usuario. Tendrás que volver a iniciar sesión para acceder al sistema.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="btn-secondary"
                style={{ padding: '0.55rem 1.25rem', fontSize: '0.85rem', flex: 1, display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem', }}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
                style={{
                  padding: '0.55rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: '10px',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                }}
              >
                Sí, Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-sidebar-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .custom-sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-sidebar-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 4px;
        }
        .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(56, 189, 248, 0.4);
        }
        @media (max-width: 768px) {
          .app-sidebar {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            height: 100vh !important;
            transform: translateX(-100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .app-sidebar.mobile-open {
            transform: translateX(0) !important;
          }
          .mobile-close-btn {
            display: flex !important;
          }
        }
      `}</style>
    </>
  );
}
