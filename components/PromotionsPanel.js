'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Gift,
  Search,
  RefreshCw,
  Play,
  Square,
  CheckCircle2,
  Clock,
  Tag,
  AlertCircle,
  Layers,
  ChevronLeft,
  ChevronRight,
  Zap,
  ExternalLink,
  Percent,
} from 'lucide-react';

export default function PromotionsPanel() {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'completed' | 'scheduled' | 'inactive' | 'all'
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [syncingPromoId, setSyncingPromoId] = useState(null);
  const [stats, setStats] = useState({
    totalPromotions: 0,
    activePromotionsCount: 0,
    skusWithPromoInDb: 0,
  });
  const [banner, setBanner] = useState(null);
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const syncRef = useRef(false);

  const addLog = (msg) => {
    const timestamp = new Date().toLocaleTimeString('es-NI');
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const fetchPromotions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/promotions');
      const data = await res.json();

      if (data.success) {
        setPromotions(data.promotions || []);
        setStats({
          totalPromotions: data.totalPromotions || 0,
          activePromotionsCount: data.activePromotionsCount || 0,
          skusWithPromoInDb: data.skusWithPromoInDb || 0,
        });
      } else {
        setBanner({ type: 'error', text: data.error || 'Error cargando promociones de VTEX.' });
      }
    } catch (err) {
      console.error('Error fetching promotions:', err);
      setBanner({ type: 'error', text: `Error de conexión: ${err.message}` });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  useEffect(() => {
    if (banner) {
      const timer = setTimeout(() => setBanner(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [banner]);

  // Sincronizar una única promoción en particular
  const handleSyncSinglePromo = async (promoId, promoName) => {
    setSyncingPromoId(promoId);
    addLog(`🎯 Iniciando simulación de checkout para: "${promoName}"...`);

    try {
      const res = await fetch('/api/promotions/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promoId }),
      });
      const data = await res.json();

      if (data.success) {
        addLog(`✅ "${promoName}": ${data.updatedCount} SKUs actualizados con precios finales.`);
        setBanner({
          type: 'success',
          text: `🎉 Promoción "${promoName}" simulada: ${data.updatedCount} SKUs actualizados en Supabase.`,
        });
        fetchPromotions(true);
      } else {
        addLog(`⚠️ Error en "${promoName}": ${data.error}`);
        setBanner({ type: 'error', text: `Error: ${data.error}` });
      }
    } catch (err) {
      addLog(`⚠️ Error de red al sincronizar "${promoName}": ${err.message}`);
    } finally {
      setSyncingPromoId(null);
    }
  };

  // Sincronización masiva de promociones activas
  const handleToggleSyncAll = async () => {
    if (syncing) {
      syncRef.current = false;
      setSyncing(false);
      addLog('⏹️ Sincronización masiva detenida por el usuario.');
      return;
    }

    syncRef.current = true;
    setSyncing(true);
    setLogs([]);
    addLog('🚀 Iniciando análisis y simulación masiva de promociones activas en VTEX...');

    let currentOffset = 0;
    const batchLimit = 10;
    let totalActive = stats.activePromotionsCount || 100;

    while (syncRef.current) {
      try {
        const res = await fetch('/api/promotions/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset: currentOffset, limit: batchLimit }),
        });

        const data = await res.json();
        if (!syncRef.current) break;

        if (data.success) {
          totalActive = data.totalActivePromotions || totalActive;
          currentOffset = data.nextOffset;

          const pct = Math.min(100, Math.round((currentOffset / totalActive) * 100));
          setSyncProgress({ current: currentOffset, total: totalActive, percentage: pct });

          addLog(
            `📦 Lote procesado: ${currentOffset} de ${totalActive} promociones (${pct}%). ${data.updatedSkusCount} SKUs simulados.`
          );

          fetchPromotions(true);

          if (data.completed || currentOffset >= totalActive) {
            addLog('🎉 ¡Sincronización completa de todas las promociones vigentes finalizada!');
            setBanner({
              type: 'success',
              text: '🎉 ¡Sincronización masiva de promociones y precios finales finalizada exitosamente!',
            });
            syncRef.current = false;
            setSyncing(false);
            break;
          }
        } else {
          addLog(`⚠️ Error en lote: ${data.error}. Reintentando en 3s...`);
          await new Promise((r) => setTimeout(r, 3000));
        }

        await new Promise((r) => setTimeout(r, 250));
      } catch (err) {
        if (!syncRef.current) break;
        addLog(`⚠️ Error de conexión: ${err.message}. Reintentando...`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };

  // Filtrado
  const filteredPromos = promotions.filter((p) => {
    if (statusFilter === 'active' && !p.isCurrent) return false;
    if (statusFilter === 'completed' && p.humanStatus !== 'completed') return false;
    if (statusFilter === 'scheduled' && p.humanStatus !== 'scheduled') return false;
    if (statusFilter === 'inactive' && p.humanStatus !== 'inactive') return false;
    if (search) {
      const q = search.toLowerCase();
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchId = (p.id || '').toLowerCase().includes(q);
      const matchType = (p.type || '').toLowerCase().includes(q);
      const matchDesc = (p.description || '').toLowerCase().includes(q);
      if (!matchName && !matchId && !matchType && !matchDesc) return false;
    }
    return true;
  });

  const totalFiltered = filteredPromos.length;
  const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
  const paginatedPromos = filteredPromos.slice((page - 1) * pageSize, page * pageSize);

  const formatDate = (isoStr) => {
    if (!isoStr) return 'Indefinido';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 'Indefinido';
    return d.toLocaleDateString('es-NI', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderStatusBadge = (promo) => {
    switch (promo.humanStatus) {
      case 'active':
        return (
          <span
            style={{
              background: 'rgba(52, 211, 153, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(52, 211, 153, 0.35)',
              padding: '0.2rem 0.55rem',
              borderRadius: '20px',
              fontSize: '0.72rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <CheckCircle2 size={12} /> Active (Vigente)
          </span>
        );
      case 'completed':
        return (
          <span
            style={{
              background: 'rgba(148, 163, 184, 0.12)',
              color: '#94a3b8',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              padding: '0.2rem 0.55rem',
              borderRadius: '20px',
              fontSize: '0.72rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            Completed (Finalizada)
          </span>
        );
      case 'scheduled':
        return (
          <span
            style={{
              background: 'rgba(251, 191, 36, 0.15)',
              color: '#fbbf24',
              border: '1px solid rgba(251, 191, 36, 0.35)',
              padding: '0.2rem 0.55rem',
              borderRadius: '20px',
              fontSize: '0.72rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <Clock size={12} /> Scheduled (Programada)
          </span>
        );
      case 'archived':
        return (
          <span
            style={{
              background: 'rgba(71, 85, 105, 0.2)',
              color: '#64748b',
              border: '1px solid rgba(71, 85, 105, 0.3)',
              padding: '0.2rem 0.55rem',
              borderRadius: '20px',
              fontSize: '0.72rem',
              fontWeight: 600,
            }}
          >
            Archivada
          </span>
        );
      default:
        return (
          <span
            style={{
              background: 'rgba(248, 113, 113, 0.1)',
              color: '#f87171',
              border: '1px solid rgba(248, 113, 113, 0.25)',
              padding: '0.2rem 0.55rem',
              borderRadius: '20px',
              fontSize: '0.72rem',
              fontWeight: 600,
            }}
          >
            Pausada / Inactiva
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Header & KPI Cards */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#ffffff',
                margin: 0,
              }}
            >
              <Gift size={22} color="#ec4899" />
              Promociones VTEX Rates & Benefits y Precios Finales
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
              Identifica promociones activas por colecciones y calcula automáticamente los precios finales con descuento de carrito.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => fetchPromotions(false)}
              className="btn-secondary"
              disabled={loading || syncing}
              title="Refrescar promociones desde VTEX"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Refrescar
            </button>

            <button
              onClick={handleToggleSyncAll}
              className={syncing ? 'btn-secondary' : 'btn-primary'}
              style={{
                background: syncing ? 'rgba(248, 113, 113, 0.2)' : 'linear-gradient(135deg, #ec4899, #be185d)',
                borderColor: syncing ? '#fb7185' : '#ec4899',
                color: syncing ? '#fb7185' : '#ffffff',
                boxShadow: syncing ? 'none' : '0 4px 15px rgba(236, 72, 153, 0.35)',
              }}
            >
              {syncing ? <Square size={16} className="animate-pulse" /> : <Play size={16} />}
              {syncing ? 'Detener Sincronización' : '⚡ Sincronizar Precios de Promociones'}
            </button>
          </div>
        </div>

        {/* Stat Boxes */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '1rem',
            marginBottom: syncing || logs.length > 0 ? '1.25rem' : '0',
          }}
        >
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
              TOTAL PROMOCIONES VTEX
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              {stats.totalPromotions.toLocaleString('es-NI')}
            </div>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Rates & Benefits configuradas</span>
          </div>

          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
              PROMOCIONES VIGENTES HOY
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
              {stats.activePromotionsCount.toLocaleString('es-NI')}
            </div>
            <span style={{ fontSize: '0.74rem', color: '#34d399' }}>Activas en tienda ahora</span>
          </div>

          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
              SKUS CON PRECIO FINAL EN BD
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ec4899', fontFamily: 'var(--font-mono)' }}>
              {stats.skusWithPromoInDb.toLocaleString('es-NI')}
            </div>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Simulados y guardados</span>
          </div>

          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
              ESTADO DEL MOTOR
            </div>
            <div
              style={{
                fontSize: '0.9rem',
                fontWeight: 700,
                color: syncing ? '#ec4899' : '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                marginTop: '0.3rem',
              }}
            >
              {syncing ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Simulando en checkout...
                </>
              ) : (
                'Listo para simular.'
              )}
            </div>
          </div>
        </div>

        {/* Progress Bar during Batch Sync */}
        {syncing && (
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.82rem' }}>
              <span style={{ color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Zap size={15} color="#ec4899" /> Progreso de Simulación y Descubrimiento
              </span>
              <span style={{ color: '#ec4899', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {syncProgress.current} / {syncProgress.total} Promociones ({syncProgress.percentage}%)
              </span>
            </div>
            <div style={{ width: '100%', height: '10px', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${syncProgress.percentage}%`,
                  height: '100%',
                  background: 'linear-gradient(to right, #ec4899, #be185d)',
                  borderRadius: '5px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Log Console */}
        {logs.length > 0 && (
          <div
            style={{
              background: '#090d16',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '0.85rem 1.15rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: '#f472b6',
              maxHeight: '130px',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              &gt; REGISTRO DE SIMULACIÓN DE PROMOCIONES
            </div>
            {logs.map((log, i) => (
              <div key={i} style={{ opacity: i === 0 ? 1 : 0.7, marginBottom: '0.2rem' }}>
                {log}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Notification Banner */}
      {banner && (
        <div
          style={{
            padding: '0.85rem 1.15rem',
            borderRadius: '12px',
            fontSize: '0.86rem',
            background: banner.type === 'success' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)',
            border: `1px solid ${banner.type === 'success' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`,
            color: banner.type === 'success' ? '#34d399' : '#fb7185',
          }}
        >
          {banner.text}
        </div>
      )}

      {/* 2. Promociones Table */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        {/* Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Tag size={18} color="#ec4899" />
              Listado de Promociones en VTEX
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
              Mostrando {filteredPromos.length} promociones coincidentes.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <Search size={15} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="glass-input"
                style={{ width: '100%', paddingLeft: '2.3rem', fontSize: '0.84rem' }}
                placeholder="Buscar por nombre o tipo..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Selector de Estado */}
            <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setStatusFilter('active');
                  setPage(1);
                }}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  background: statusFilter === 'active' ? 'rgba(52, 211, 153, 0.2)' : 'transparent',
                  color: statusFilter === 'active' ? '#34d399' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <CheckCircle2 size={13} /> Activas Hoy ({stats.activePromotionsCount})
              </button>

              <button
                onClick={() => {
                  setStatusFilter('completed');
                  setPage(1);
                }}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  background: statusFilter === 'completed' ? 'rgba(148, 163, 184, 0.2)' : 'transparent',
                  color: statusFilter === 'completed' ? '#94a3b8' : 'var(--text-muted)',
                }}
              >
                Finalizadas (Completed)
              </button>

              <button
                onClick={() => {
                  setStatusFilter('inactive');
                  setPage(1);
                }}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  background: statusFilter === 'inactive' ? 'rgba(248, 113, 113, 0.2)' : 'transparent',
                  color: statusFilter === 'inactive' ? '#f87171' : 'var(--text-muted)',
                }}
              >
                Pausadas / Inactivas
              </button>

              <button
                onClick={() => {
                  setStatusFilter('all');
                  setPage(1);
                }}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  background: statusFilter === 'all' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  color: statusFilter === 'all' ? '#38bdf8' : 'var(--text-muted)',
                }}
              >
                Todas ({promotions.length})
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-subtle)', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr
                style={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                }}
              >
                <th style={{ padding: '0.65rem 0.85rem' }}>Nombre Promoción</th>
                <th style={{ padding: '0.65rem 0.85rem' }}>Tipo</th>
                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Descuento</th>
                <th style={{ padding: '0.65rem 0.85rem' }}>Vigencia</th>
                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Estado</th>
                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" color="#ec4899" style={{ margin: '0 auto 0.5rem auto' }} />
                    Cargando promociones desde VTEX Rates & Benefits...
                  </td>
                </tr>
              ) : paginatedPromos.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No se encontraron promociones con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                paginatedPromos.map((promo) => {
                  const isSyncingThis = syncingPromoId === promo.id;

                  return (
                    <tr
                      key={promo.id}
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', transition: 'background 0.15s ease' }}
                      className="hover-row"
                    >
                      <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: '#ffffff', maxWidth: '320px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{promo.name}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            ID: {promo.id}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-muted)' }}>
                        <span
                          style={{
                            background: 'rgba(56, 189, 248, 0.1)',
                            color: '#38bdf8',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}
                        >
                          {promo.type || 'regular'}
                        </span>
                      </td>

                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                        {promo.percentualDiscountValue > 0 ? (
                          <span className="badge badge-emerald" style={{ fontWeight: 700 }}>
                            -{promo.percentualDiscountValue}%
                          </span>
                        ) : promo.nominalDiscountValue > 0 ? (
                          <span className="badge badge-emerald" style={{ fontWeight: 700 }}>
                            -C$ {promo.nominalDiscountValue}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        <div>Desde: {formatDate(promo.beginDate)}</div>
                        <div>Hasta: {formatDate(promo.endDate)}</div>
                      </td>

                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                        {renderStatusBadge(promo)}
                      </td>

                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                        <button
                          onClick={() => handleSyncSinglePromo(promo.id, promo.name)}
                          disabled={isSyncingThis || syncing}
                          className="btn-secondary"
                          style={{
                            padding: '0.3rem 0.65rem',
                            fontSize: '0.74rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            borderColor: 'rgba(236, 72, 153, 0.4)',
                            color: '#ec4899',
                            background: 'rgba(236, 72, 153, 0.1)',
                          }}
                          title="Extraer colecciones y simular checkout para los SKUs de esta promoción"
                        >
                          <Zap size={13} className={isSyncingThis ? 'animate-spin' : ''} />
                          {isSyncingThis ? 'Simulando...' : 'Simular SKUs'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1.25rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
              Página {page} de {totalPages} ({totalFiltered.toLocaleString()} promociones)
            </span>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                <ChevronLeft size={15} /> Anterior
              </button>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                Siguiente <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
