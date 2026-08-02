'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tag,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Percent,
  Clock,
  Zap,
  Play,
  Square,
  Terminal,
} from 'lucide-react';

export default function PricesTable() {
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncActive, setSyncActive] = useState(false);
  const [syncOffset, setSyncOffset] = useState(0);
  const [syncTotal, setSyncTotal] = useState(82234);
  const [updatingSkuId, setUpdatingSkuId] = useState(null);
  const [search, setSearch] = useState('');
  const [discountFilter, setDiscountFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('asc');
  const [stats, setStats] = useState({ totalPricedSkus: 0, totalCatalogCount: 82234, avgPrice: 0, discountedSkusCount: 0, lastSyncTime: null });
  const [banner, setBanner] = useState(null);
  const [logs, setLogs] = useState([]);

  const syncRef = useRef(false);

  const addLog = (msg) => {
    const timestamp = new Date().toLocaleTimeString('es-NI');
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const fetchPrices = useCallback(async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        search,
        discount: discountFilter,
        sortBy,
        sortOrder,
      });

      const res = await fetch(`/api/prices?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setSkus(data.skus || []);
        setTotalCount(data.paging?.total || 0);
        setTotalPages(data.paging?.totalPages || 1);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('Error cargando precios:', err);
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  }, [page, pageSize, search, discountFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchPrices(true);
  }, [fetchPrices]);

  // Bucle de sincronización masiva ininterrumpido cliente-servidor
  const handleToggleSync = async () => {
    if (syncActive) {
      // Detener sincronización
      syncRef.current = false;
      setSyncActive(false);
      addLog('⏹️ Sincronización pausada por el usuario.');
      return;
    }

    // Iniciar sincronización ininterrumpida desde cero
    syncRef.current = true;
    setSyncActive(true);
    setLogs([]);
    addLog('🚀 Iniciando extracción masiva ininterrumpida desde el SKU 1 (150 SKUs por lote)...');

    let currentOffset = 0;
    const batchLimit = 150;
    let totalCat = stats.totalCatalogCount || 82234;

    while (syncRef.current) {
      try {
        const res = await fetch('/api/prices/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset: currentOffset, limit: batchLimit }),
        });

        const data = await res.json();

        if (!syncRef.current) break;

        if (data.success) {
          totalCat = data.totalCatalog || totalCat;
          setSyncTotal(totalCat);
          currentOffset = data.nextOffset;
          setSyncOffset(currentOffset);

          const pct = Math.min(100, parseFloat(((currentOffset / totalCat) * 100).toFixed(1)));
          addLog(`Procesando lote: ${currentOffset.toLocaleString('es-NI')} de ${totalCat.toLocaleString('es-NI')} SKUs (${pct}% completado).`);

          // Actualizar tabla silenciosamente cada par de lotes
          fetchPrices(false);

          if (data.completed || currentOffset >= totalCat) {
            addLog('🎉 ¡100% del catálogo de precios sincronizado con éxito!');
            setBanner({ type: 'success', text: '🎉 ¡Sincronización masiva de precios completada exitosamente al 100%!' });
            syncRef.current = false;
            setSyncActive(false);
            break;
          }
        } else {
          addLog(`⚠️ Error en lote: ${data.error || 'Reintentando en 3s...'}`);
          await new Promise((r) => setTimeout(r, 3000));
        }

        // Pequeña pausa entre lotes para rendimiento óptimo
        await new Promise((r) => setTimeout(r, 150));
      } catch (err) {
        if (!syncRef.current) break;
        addLog(`⚠️ Error de conexión: ${err.message}. Reintentando...`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };

  // Vincular Webhook de Precios automáticamente en VTEX
  const handleRegisterWebhook = async () => {
    setBanner(null);
    addLog('🔗 Conectando con VTEX APIs para vincular webhook en tiempo real...');
    try {
      const res = await fetch('/api/webhooks/vtex-price/register', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        setBanner({ type: 'success', text: `⚡ ${data.message}` });
        addLog('✓ Webhook de precios de VTEX vinculado exitosamente.');
      } else {
        setBanner({ type: 'error', text: `⚠️ ${data.error || 'Error al vincular webhook con VTEX'}` });
      }
    } catch (err) {
      setBanner({ type: 'error', text: `⚠️ Error de red: ${err.message}` });
    }
  };

  // Refrescar precio de un solo SKU en tiempo real in-place
  const handleRefreshSingleSku = async (skuId) => {
    setUpdatingSkuId(skuId);
    try {
      const res = await fetch('/api/prices/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuId }),
      });
      const data = await res.json();

      if (data.success && data.price) {
        const fresh = data.price;
        const listP = fresh.listPrice !== null && fresh.listPrice !== undefined ? parseFloat(fresh.listPrice) : null;
        const baseP = fresh.basePrice !== null && fresh.basePrice !== undefined ? parseFloat(fresh.basePrice) : null;
        let discPct = 0;
        if (listP && baseP && listP > baseP) {
          discPct = parseFloat((((listP - baseP) / listP) * 100).toFixed(1));
        }

        setSkus((prevSkus) =>
          prevSkus.map((item) => {
            if (item.id === skuId) {
              return {
                ...item,
                listPrice: listP,
                basePrice: baseP,
                costPrice: fresh.costPrice !== null && fresh.costPrice !== undefined ? parseFloat(fresh.costPrice) : null,
                discountPct: discPct,
                priceUpdatedAt: new Date().toISOString(),
              };
            }
            return item;
          })
        );

        fetchPrices(false);
      }
    } catch (err) {
      console.error(`Error actualizando precio de SKU ${skuId}:`, err);
    } finally {
      setUpdatingSkuId(null);
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const renderSortIcon = (column) => {
    if (sortBy !== column) return <ArrowUpDown size={12} color="var(--text-dim)" />;
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} color="var(--accent-primary)" />
    ) : (
      <ArrowDown size={12} color="var(--accent-primary)" />
    );
  };

  const catalogTotal = stats.totalCatalogCount || syncTotal || 82234;
  const pricedCount = syncActive ? Math.min(catalogTotal, syncOffset) : stats.totalPricedSkus;
  const progressPct = catalogTotal > 0 ? Math.min(100, parseFloat(((pricedCount / catalogTotal) * 100).toFixed(1))) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* 1. Centro de Extracción & Sincronización Masiva (Estilo Panel de Inventario) */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ffffff' }}>
              <RefreshCw size={19} className={syncActive ? 'animate-spin' : ''} color="var(--accent-primary)" />
              Centro de Extracción & Sincronización Masiva de Precios VTEX
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Extrae y actualiza masivamente los precios de lista (MSRP), precios base de venta y precios fijos promocionales desde VTEX.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', width: '100%', maxWidth: 'max-content' }}>
            <button
              onClick={handleToggleSync}
              className={syncActive ? 'btn-secondary' : 'btn-primary'}
              style={{
                background: syncActive ? 'rgba(248, 113, 113, 0.2)' : undefined,
                borderColor: syncActive ? '#fb7185' : undefined,
                color: syncActive ? '#fb7185' : undefined,
              }}
            >
              {syncActive ? <Square size={16} className="animate-pulse" /> : <Play size={16} />}
              {syncActive ? 'Detener Sincronización' : '⚡ 1. Sincronizar Precios Masivos'}
            </button>

            <button
              onClick={handleRegisterWebhook}
              className="btn-secondary"
              title="Vincular automáticamente las notificaciones de precios de VTEX con Supabase"
            >
              🔗 Vincular Webhook VTEX
            </button>
          </div>
        </div>

        {/* 4 Summary Stat Boxes Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: syncActive || logs.length > 0 ? '1.25rem' : '0' }}>
          
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
              TOTAL SKUS EN BD
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              {catalogTotal.toLocaleString('es-NI')}
            </div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
              SKUS CON PRECIO
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
              {pricedCount.toLocaleString('es-NI')}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{progressPct}% completado</span>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
              ÚLTIMA SINCRONIZACIÓN
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff', marginTop: '0.3rem' }}>
              {stats.lastSyncTime ? new Date(stats.lastSyncTime).toLocaleString('es-NI') : 'Sin sincronización previa'}
            </div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
              ESTADO DE AVANCE
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: syncActive ? '#38bdf8' : '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
              {syncActive ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Procesando en vivo...
                </>
              ) : (
                'Listo para operar.'
              )}
            </div>
          </div>

        </div>

        {/* Progress Bar - Se muestra cuando la sincronización está activa */}
        {syncActive && (
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.82rem' }}>
              <span style={{ color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Zap size={15} color="#38bdf8" /> Progreso de Extracción de Precios desde Cero
              </span>
              <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {pricedCount.toLocaleString('es-NI')} / {catalogTotal.toLocaleString('es-NI')} SKUs ({progressPct}%)
              </span>
            </div>
            <div style={{ width: '100%', height: '10px', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
              <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(to right, #38bdf8, #34d399)', borderRadius: '5px', transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}

        {/* Terminal Log Console */}
        {logs.length > 0 && (
          <div
            style={{
              background: '#090d16',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '0.85rem 1.15rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: '#a5b4fc',
              maxHeight: '130px',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Terminal size={12} color="#38bdf8" /> REGISTRO DE OPERACIÓN DE PRECIOS
            </div>
            {logs.map((log, i) => (
              <div key={i} style={{ opacity: i === 0 ? 1 : 0.7, marginBottom: '0.2rem' }}>
                &gt; {log}
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

      {/* 2. Tarjetas KPI de Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        
        {/* Total SKUs con Precio */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Tag size={14} color="#a5b4fc" /> SKUs con Precio
            </span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
            {stats.totalPricedSkus.toLocaleString('es-NI')}
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            de {catalogTotal.toLocaleString('es-NI')} SKUs ({progressPct}%)
          </span>
        </div>

        {/* SKUs con Descuento / Precio Fijo */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Percent size={14} color="#34d399" /> SKUs con Descuento %
            </span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#34d399', letterSpacing: '-0.02em' }}>
            {stats.discountedSkusCount.toLocaleString('es-NI')} SKUs
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Precio de Lista &gt; Precio Base / Precio Fijo Promocional</span>
        </div>

        {/* Última Sincronización */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={14} color="#fbbf24" /> Última Sincronización
            </span>
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginTop: '0.2rem' }}>
            {stats.lastSyncTime ? new Date(stats.lastSyncTime).toLocaleString('es-NI') : 'Sin sincronización previa'}
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sincronizado desde VTEX Pricing API</span>
        </div>

      </div>

      {/* 3. Tabla Principal de Precios */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        
        {/* Header Controls Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Tag size={18} color="var(--accent-primary)" />
              Catálogo de Precios VTEX & Supabase
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Mostrando {skus.length} de {totalCount.toLocaleString()} registros de precios almacenados.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={15} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="glass-input"
                style={{ width: '100%', paddingLeft: '2.3rem', fontSize: '0.84rem' }}
                placeholder="Buscar por SKU ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Filter Discount Select */}
            <select
              className="glass-input"
              style={{ fontSize: '0.84rem', padding: '0.45rem 0.75rem' }}
              value={discountFilter}
              onChange={(e) => {
                setDiscountFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todos los Precios</option>
              <option value="with_discount">Solo con Descuento %</option>
              <option value="no_discount">Sin Descuento</option>
            </select>
          </div>
        </div>

        {/* Scrollable Prices Table */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '12px', border: '1px solid var(--border-subtle)', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem', tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                <th
                  onClick={() => handleSort('id')}
                  style={{ padding: '0.6rem 0.75rem', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    SKU ID {renderSortIcon('id')}
                  </div>
                </th>

                <th style={{ padding: '0.6rem 0.75rem' }}>Descripción del Producto</th>

                <th
                  onClick={() => handleSort('list_price')}
                  style={{ padding: '0.6rem 0.75rem', textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                    Precio Lista (MSRP) {renderSortIcon('list_price')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('base_price')}
                  style={{ padding: '0.6rem 0.75rem', textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                    Precio Base (Venta) {renderSortIcon('base_price')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('discount_pct')}
                  style={{ padding: '0.6rem 0.75rem', textAlign: 'center', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                    Descuento % {renderSortIcon('discount_pct')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('price_updated_at')}
                  style={{ padding: '0.6rem 0.75rem', textAlign: 'center', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                    Última Actualización {renderSortIcon('price_updated_at')}
                  </div>
                </th>

                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 0.5rem auto' }} />
                    Cargando catálogo de precios optimizado...
                  </td>
                </tr>
              ) : skus.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No hay registros de precios en Supabase con los filtros seleccionados. Presiona <strong>"⚡ 1. Sincronizar Precios Masivos"</strong> para cargar los precios.
                  </td>
                </tr>
              ) : (
                skus.map((sku) => {
                  const isUpdatingThis = updatingSkuId === sku.id;

                  return (
                    <tr
                      key={sku.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'background 0.15s ease',
                      }}
                      className="hover-row"
                    >
                      {/* SKU ID */}
                      <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)' }}>
                        {sku.id}
                      </td>

                      {/* Descripción */}
                      <td style={{ padding: '0.6rem 0.75rem', color: '#ffffff', fontWeight: 500, maxWidth: '300px' }}>
                        {sku.description}
                      </td>

                      {/* Precio de Lista */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: sku.discountPct > 0 ? 'var(--text-dim)' : 'var(--text-muted)', textDecoration: sku.discountPct > 0 ? 'line-through' : 'none' }}>
                        {sku.listPrice !== null ? `C$ ${sku.listPrice.toLocaleString('es-NI', { minimumFractionDigits: 2 })}` : '—'}
                      </td>

                      {/* Precio Base / Venta */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: sku.basePrice !== null ? '#34d399' : 'var(--text-dim)', fontSize: '0.88rem' }}>
                        {sku.basePrice !== null ? `C$ ${sku.basePrice.toLocaleString('es-NI', { minimumFractionDigits: 2 })}` : '—'}
                      </td>

                      {/* Descuento % Badge */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                        {sku.discountPct > 0 ? (
                          <span
                            className="badge badge-emerald"
                            style={{ padding: '0.2rem 0.55rem', fontSize: '0.74rem', fontWeight: 700 }}
                          >
                            -{sku.discountPct}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>

                      {/* Última Actualización */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {sku.priceUpdatedAt ? new Date(sku.priceUpdatedAt).toLocaleString('es-NI') : 'Pendiente'}
                      </td>

                      {/* Botón Refrescar individual */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                        <button
                          onClick={() => handleRefreshSingleSku(sku.id)}
                          disabled={isUpdatingThis}
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', minHeight: '30px' }}
                          title="Actualizar precio de este SKU desde VTEX en tiempo real"
                        >
                          <RefreshCw size={12} className={isUpdatingThis ? 'animate-spin' : ''} />
                          {isUpdatingThis ? 'Cargando' : 'Refrescar'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
              Página {page} de {totalPages} ({totalCount.toLocaleString()} SKUs)
            </span>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                <ChevronLeft size={15} /> Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
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
