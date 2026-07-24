'use client';

import { useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, Hash, Database, RefreshCw, Warehouse, Layers, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, XCircle } from 'lucide-react';
import ExportButton from './ExportButton';

export default function SkuTable({ onRefreshNeeded, refreshTrigger }) {
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSkus, setTotalSkus] = useState(0);

  // Ordenamiento
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('asc');

  // Estado de actualización por SKU individual
  const [updatingSkuId, setUpdatingSkuId] = useState(null);

  const fetchSkus = async (pageNum = 1, searchQuery = '', sortCol = sortBy, sortDir = sortOrder, isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const url = `/api/skus?page=${pageNum}&limit=25&search=${encodeURIComponent(searchQuery)}&sortBy=${sortCol}&sortOrder=${sortDir}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setSkus(data.skus || []);
        setTotalPages(data.totalPages || 1);
        setTotalSkus(data.total || 0);
      } else {
        setSkus([]);
      }
    } catch (err) {
      console.error('Error fetching SKUs:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    const isSilent = skus.length > 0;
    fetchSkus(page, search, sortBy, sortOrder, isSilent);
  }, [page, search, sortBy, sortOrder, refreshTrigger]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(columnKey);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleSingleSkuRefresh = async (skuId) => {
    setUpdatingSkuId(skuId);
    try {
      const res = await fetch('/api/skus/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuIds: [skuId] }),
      });
      const data = await res.json();
      if (data.success) {
        fetchSkus(page, search, sortBy, sortOrder, true);
      } else {
        alert(`Error actualizando SKU ${skuId}: ${data.error}`);
      }
    } catch (err) {
      alert(`Error de conexión al actualizar SKU: ${err.message}`);
    } finally {
      setUpdatingSkuId(null);
    }
  };

  const renderSortIcon = (columnKey) => {
    if (sortBy !== columnKey) {
      return <ArrowUpDown size={13} style={{ opacity: 0.4 }} />;
    }
    return sortOrder === 'desc' ? (
      <ArrowDown size={14} color="var(--accent-primary)" />
    ) : (
      <ArrowUp size={14} color="var(--accent-primary)" />
    );
  };

  const renderStockBadge = (qtyRaw, type) => {
    const qty = qtyRaw ?? 0;
    const isZero = qty === 0;
    const formattedQty = qty.toLocaleString('es-NI');

    if (isZero) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            fontSize: '0.8rem',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#64748b',
          }}
        >
          <Warehouse size={12} color="#64748b" />
          <span style={{ color: '#94a3b8', fontWeight: 600 }}>0</span> unid.
        </span>
      );
    }

    let bg = 'rgba(251, 191, 36, 0.12)';
    let border = '1px solid rgba(251, 191, 36, 0.35)';
    let labelColor = '#fbbf24';
    let IconComp = Warehouse;

    if (type === 'wh2') {
      bg = 'rgba(129, 140, 248, 0.14)';
      border = '1px solid rgba(129, 140, 248, 0.35)';
      labelColor = '#a5b4fc';
    } else if (type === 'total') {
      bg = 'rgba(52, 211, 153, 0.14)';
      border = '1px solid rgba(52, 211, 153, 0.35)';
      labelColor = '#34d399';
      IconComp = Layers;
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.25rem 0.75rem',
          borderRadius: '999px',
          fontSize: '0.82rem',
          background: bg,
          border: border,
          color: labelColor,
        }}
      >
        <IconComp size={13} color={labelColor} />
        <strong style={{ color: '#ffffff', fontWeight: 700, letterSpacing: '0.02em' }}>
          {formattedQty}
        </strong>{' '}
        unid.
      </span>
    );
  };

  return (
    <div className="glass-card" style={{ padding: '1.75rem' }}>
      
      {/* Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Hash size={18} color="var(--accent-primary)" />
            Explorador de SKUs e Inventarios
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Mostrando {skus.length} de {totalSkus.toLocaleString()} registros en Supabase.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="glass-input"
              style={{ paddingLeft: '2.4rem', width: '100%', fontSize: '0.88rem' }}
              placeholder="Buscar SKU ID..."
              value={search}
              onChange={handleSearchChange}
            />
          </div>

          <ExportButton totalSkus={totalSkus} />
        </div>
      </div>

      {/* Table Element */}
      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              
              <th
                onClick={() => handleSort('id')}
                style={{ padding: '0.85rem 1.25rem', cursor: 'pointer', userSelect: 'none' }}
                title="Ordenar por SKU ID"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  SKU ID {renderSortIcon('id')}
                </div>
              </th>

              <th
                onClick={() => handleSort('is_active')}
                style={{ padding: '0.85rem 1.25rem', cursor: 'pointer', userSelect: 'none' }}
                title="Ordenar por Estado (Activo/Inactivo)"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Estado {renderSortIcon('is_active')}
                </div>
              </th>

              <th
                onClick={() => handleSort('stock_wh1')}
                style={{ padding: '0.85rem 1.25rem', cursor: 'pointer', userSelect: 'none' }}
                title="Ordenar por Bodega 1 (Mayor a Menor)"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Mega {renderSortIcon('stock_wh1')}
                </div>
              </th>

              <th
                onClick={() => handleSort('stock_wh2')}
                style={{ padding: '0.85rem 1.25rem', cursor: 'pointer', userSelect: 'none' }}
                title="Ordenar por Bodega 2 (Mayor a Menor)"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Cedis  {renderSortIcon('stock_wh2')}
                </div>
              </th>

              <th
                onClick={() => handleSort('total_stock')}
                style={{ padding: '0.85rem 1.25rem', cursor: 'pointer', userSelect: 'none' }}
                title="Ordenar por Total Stock Consolidado"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Total Stock {renderSortIcon('total_stock')}
                </div>
              </th>

              <th style={{ padding: '0.85rem 1.25rem' }}>
                Última Actualización
              </th>

              <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && skus.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: 'var(--accent-primary)' }} />
                  Cargando SKUs...
                </td>
              </tr>
            ) : skus.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Database size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
                  <p style={{ fontWeight: 500, color: 'var(--text-main)' }}>No hay SKUs registrados aún</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                    Presiona &quot;1. Extraer SKUs Masivos&quot; en el panel superior.
                  </p>
                </td>
              </tr>
            ) : (
              skus.map((sku) => (
                <tr
                  key={sku.id}
                  style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '0.85rem 1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ffffff' }}>
                    {sku.id}
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    {sku.is_active !== false ? (
                      <span className="badge badge-emerald" style={{ gap: '0.3rem', fontSize: '0.78rem' }}>
                        <CheckCircle2 size={13} /> Activo
                      </span>
                    ) : (
                      <span className="badge badge-rose" style={{ gap: '0.3rem', fontSize: '0.78rem' }}>
                        <XCircle size={13} /> Inactivo
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    {renderStockBadge(sku.stock_wh1, 'wh1')}
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    {renderStockBadge(sku.stock_wh2, 'wh2')}
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    {renderStockBadge(sku.total_stock, 'total')}
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                    {sku.inventory_updated_at
                      ? new Date(sku.inventory_updated_at).toLocaleString('es-NI', { dateStyle: 'short', timeStyle: 'medium' })
                      : 'Pendiente'}
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                    <button
                      onClick={() => handleSingleSkuRefresh(sku.id)}
                      disabled={updatingSkuId === sku.id}
                      className="btn-secondary"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', borderRadius: '8px' }}
                      title={`Consultar inventario en VTEX para SKU ${sku.id}`}
                    >
                      <RefreshCw size={13} className={updatingSkuId === sku.id ? 'animate-spin' : ''} />
                      {updatingSkuId === sku.id ? 'Consultando...' : 'Actualizar Stock'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
          Página {page} de {totalPages} (Ordenado por: <strong style={{ color: 'var(--accent-primary)' }}>{sortBy}</strong> [{sortOrder.toUpperCase()}])
        </span>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="btn-secondary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="btn-secondary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}
          >
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      </div>

    </div>
  );
}
