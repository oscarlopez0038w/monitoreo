'use client';

import { useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, Hash, Database, RefreshCw, Warehouse, Layers, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, XCircle, Power, ToggleRight, ToggleLeft } from 'lucide-react';
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
  const [togglingActiveSkuId, setTogglingActiveSkuId] = useState(null);

  const handleToggleSkuActive = async (skuId, currentIsActive) => {
    const targetState = !currentIsActive;
    const actionText = targetState ? 'activar' : 'desactivar';

    setTogglingActiveSkuId(skuId);
    try {
      const res = await fetch('/api/skus/toggle-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuId, isActive: targetState }),
      });
      const data = await res.json();
      if (data.success) {
        setSkus((prevSkus) =>
          prevSkus.map((s) => (s.id === skuId ? { ...s, is_active: targetState } : s))
        );
        if (data.vtexError) {
          alert(`⚠️ SKU ${skuId} actualizado a ${targetState ? 'ACTIVO' : 'INACTIVO'} en BD local, pero VTEX devolvió el siguiente mensaje:\n\n${data.vtexError}`);
        }
        if (onRefreshNeeded) onRefreshNeeded();
      } else {
        alert(`Error al ${actionText} el SKU ${skuId}: ${data.error}`);
      }
    } catch (err) {
      alert(`Error de conexión al ${actionText} SKU: ${err.message}`);
    } finally {
      setTogglingActiveSkuId(null);
    }
  };

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

  const renderQtyCell = (value, type = 'normal') => {
    const qty = value ?? 0;
    const isNegative = qty < 0;

    let color = '#cbd5e1';
    let fontWeight = 500;

    if (type === 'total') {
      color = '#38bdf8';
      fontWeight = 600;
    } else if (type === 'reserved') {
      color = qty > 0 ? '#fbbf24' : '#64748b';
      fontWeight = qty > 0 ? 700 : 500;
    } else if (type === 'available') {
      if (isNegative) {
        color = '#f87171';
        fontWeight = 700;
      } else if (qty > 0) {
        color = '#34d399';
        fontWeight = 700;
      } else {
        color = '#64748b';
      }
    }

    return (
      <span style={{ color, fontWeight, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
        {qty.toLocaleString('es-NI')}
      </span>
    );
  };

  return (
    <div className="glass-card" style={{ padding: '1.25rem' }}>
      
      {/* Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Hash size={18} color="var(--accent-primary)" />
            Explorador de SKUs e Inventarios
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Mostrando {skus.length} de {totalSkus.toLocaleString()} registros en Supabase.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', width: '100%', maxWidth: 'max-content' }} className="responsive-flex-stack">
          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 auto' }}>
            <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="glass-input"
              style={{ width: '100%', paddingLeft: '2.3rem', fontSize: '0.84rem' }}
              placeholder="Buscar SKU ID..."
              value={search}
              onChange={handleSearchChange}
            />
          </div>

          <ExportButton totalSkus={totalSkus} />

          {/* Controles de Paginación Superior */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="btn-secondary"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              title="Página Anterior"
            >
              <ChevronLeft size={15} /> Anterior
            </button>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', padding: '0 0.2rem', fontWeight: 600 }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="btn-secondary"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              title="Página Siguiente"
            >
              Siguiente <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Table Element */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '12px', border: '1px solid var(--border-subtle)', width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem', tableLayout: 'auto' }}>
          <thead>
            {/* Fila 1: Encabezados Principales y Grupos */}
            <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <th
                rowSpan={2}
                onClick={() => handleSort('id')}
                style={{ padding: '0.45rem 0.4rem', cursor: 'pointer', userSelect: 'none', borderRight: '1px solid rgba(255, 255, 255, 0.05)', whiteSpace: 'nowrap' }}
                title="Ordenar por SKU ID"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  SKU {renderSortIcon('id')}
                </div>
              </th>

              <th
                rowSpan={2}
                style={{ padding: '0.45rem 0.4rem', borderRight: '1px solid rgba(255, 255, 255, 0.05)', maxWidth: '140px' }}
                title="Descripción del Producto"
              >
                Descripción
              </th>

              <th
                rowSpan={2}
                style={{ padding: '0.45rem 0.4rem', borderRight: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center', whiteSpace: 'nowrap' }}
                title="Stock Mínimo de Seguridad Configurado"
              >
                Stock Seg.
              </th>

              <th
                rowSpan={2}
                onClick={() => handleSort('is_active')}
                style={{ padding: '0.45rem 0.4rem', cursor: 'pointer', userSelect: 'none', borderRight: '1px solid rgba(255, 255, 255, 0.05)', whiteSpace: 'nowrap' }}
                title="Ordenar por Estado"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  Estado {renderSortIcon('is_active')}
                </div>
              </th>

              {/* Grupo Mega */}
              <th
                colSpan={3}
                style={{ padding: '0.35rem', textAlign: 'center', background: 'rgba(251, 191, 36, 0.06)', borderRight: '1px solid rgba(255, 255, 255, 0.08)', color: '#fbbf24', fontWeight: 700 }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                  <Warehouse size={12} color="#fbbf24" /> Bodega Mega (24)
                </div>
              </th>

              {/* Grupo Cedis */}
              <th
                colSpan={3}
                style={{ padding: '0.35rem', textAlign: 'center', background: 'rgba(129, 140, 248, 0.06)', borderRight: '1px solid rgba(255, 255, 255, 0.08)', color: '#a5b4fc', fontWeight: 700 }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                  <Warehouse size={12} color="#a5b4fc" /> Bodega Cedis (1041)
                </div>
              </th>

              {/* Grupo Totales */}
              <th
                colSpan={3}
                style={{ padding: '0.35rem', textAlign: 'center', background: 'rgba(52, 211, 153, 0.06)', borderRight: '1px solid rgba(255, 255, 255, 0.08)', color: '#34d399', fontWeight: 700 }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                  <Layers size={12} color="#34d399" /> Consolidado
                </div>
              </th>

              <th rowSpan={2} style={{ padding: '0.45rem 0.4rem', borderRight: '1px solid rgba(255, 255, 255, 0.05)', whiteSpace: 'nowrap' }}>
                Actualizado
              </th>

              <th rowSpan={2} style={{ padding: '0.45rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                Acciones
              </th>
            </tr>

            {/* Fila 2: Sub-encabezados Total / Reservado / Disponible */}
            <tr style={{ background: 'rgba(15, 23, 42, 0.85)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontSize: '0.68rem', textTransform: 'uppercase' }}>
              {/* Mega */}
              <th onClick={() => handleSort('wh1_total')} style={{ padding: '0.3rem 0.35rem', cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap' }} title="Total Mega">
                Total {renderSortIcon('wh1_total')}
              </th>
              <th onClick={() => handleSort('wh1_reserved')} style={{ padding: '0.3rem 0.35rem', cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap' }} title="Reservado Mega">
                Reserv. {renderSortIcon('wh1_reserved')}
              </th>
              <th onClick={() => handleSort('stock_wh1')} style={{ padding: '0.3rem 0.35rem', cursor: 'pointer', textAlign: 'right', borderRight: '1px solid rgba(255, 255, 255, 0.08)', whiteSpace: 'nowrap' }} title="Disponible Mega">
                Dispon. {renderSortIcon('stock_wh1')}
              </th>

              {/* Cedis */}
              <th onClick={() => handleSort('wh2_total')} style={{ padding: '0.3rem 0.35rem', cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap' }} title="Total Cedis">
                Total {renderSortIcon('wh2_total')}
              </th>
              <th onClick={() => handleSort('wh2_reserved')} style={{ padding: '0.3rem 0.35rem', cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap' }} title="Reservado Cedis">
                Reserv. {renderSortIcon('wh2_reserved')}
              </th>
              <th onClick={() => handleSort('stock_wh2')} style={{ padding: '0.3rem 0.35rem', cursor: 'pointer', textAlign: 'right', borderRight: '1px solid rgba(255, 255, 255, 0.08)', whiteSpace: 'nowrap' }} title="Disponible Cedis">
                Dispon. {renderSortIcon('stock_wh2')}
              </th>

              {/* Consolidados */}
              <th onClick={() => handleSort('total_quantity')} style={{ padding: '0.3rem 0.35rem', cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap' }} title="Total Físico Consolidado">
                Total {renderSortIcon('total_quantity')}
              </th>
              <th onClick={() => handleSort('total_reserved')} style={{ padding: '0.3rem 0.35rem', cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap' }} title="Total Reservado Consolidado">
                Reserv. {renderSortIcon('total_reserved')}
              </th>
              <th onClick={() => handleSort('total_stock')} style={{ padding: '0.3rem 0.35rem', cursor: 'pointer', textAlign: 'right', borderRight: '1px solid rgba(255, 255, 255, 0.08)', whiteSpace: 'nowrap' }} title="Total Disponible Consolidado">
                Dispon. {renderSortIcon('total_stock')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && skus.length === 0 ? (
              <tr>
                <td colSpan={15} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: 'var(--accent-primary)' }} />
                  Cargando SKUs...
                </td>
              </tr>
            ) : skus.length === 0 ? (
              <tr>
                <td colSpan={15} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Database size={28} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
                  <p style={{ fontWeight: 500, color: 'var(--text-main)' }}>No hay SKUs registrados aún</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    Presiona &quot;1. Extraer SKUs Masivos&quot; en el panel superior.
                  </p>
                </td>
              </tr>
            ) : (
              skus.map((sku) => {
                const isUnderSafety = (sku.safety_stock || 0) > 0 && (sku.total_stock || 0) < sku.safety_stock;

                return (
                  <tr
                    key={sku.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isUnderSafety ? 'rgba(251, 191, 36, 0.05)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = isUnderSafety ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255, 255, 255, 0.03)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = isUnderSafety ? 'rgba(251, 191, 36, 0.05)' : 'transparent')
                    }
                  >
                    <td style={{ padding: '0.45rem 0.35rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ffffff', borderRight: '1px solid rgba(255, 255, 255, 0.04)', whiteSpace: 'nowrap' }}>
                      {sku.id}
                    </td>
                    <td style={{ padding: '0.45rem 0.35rem', color: 'var(--text-main)', fontSize: '0.76rem', borderRight: '1px solid rgba(255, 255, 255, 0.04)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sku.description || ''}>
                      {sku.description || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Sin descripción</span>}
                    </td>
                    <td style={{ padding: '0.45rem 0.35rem', textAlign: 'center', borderRight: '1px solid rgba(255, 255, 255, 0.04)', whiteSpace: 'nowrap' }}>
                      {(sku.safety_stock || 0) > 0 ? (
                        <span className={`badge ${isUnderSafety ? 'badge-rose' : 'badge-amber'}`} style={{ fontSize: '0.7rem', gap: '0.2rem', padding: '0.15rem 0.35rem' }} title={isUnderSafety ? 'Alerta: Disponible por debajo del Stock de Seguridad' : 'Stock de Seguridad configurado'}>
                          {isUnderSafety && '⚠️ '}
                          {sku.safety_stock.toLocaleString('es-NI')}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>0</span>
                      )}
                    </td>
                    <td style={{ padding: '0.45rem 0.35rem', borderRight: '1px solid rgba(255, 255, 255, 0.04)', whiteSpace: 'nowrap' }}>
                      {sku.is_active !== false ? (
                        <span className="badge badge-emerald" style={{ gap: '0.2rem', fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                          <CheckCircle2 size={11} /> Activo
                        </span>
                      ) : (
                        <span className="badge badge-rose" style={{ gap: '0.2rem', fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                          <XCircle size={11} /> Inactivo
                        </span>
                      )}
                    </td>

                  {/* Mega */}
                  <td style={{ padding: '0.45rem 0.25rem', textAlign: 'right' }}>
                    {renderQtyCell(sku.wh1_total, 'total')}
                  </td>
                  <td style={{ padding: '0.45rem 0.25rem', textAlign: 'right' }}>
                    {renderQtyCell(sku.wh1_reserved, 'reserved')}
                  </td>
                  <td style={{ padding: '0.45rem 0.25rem', textAlign: 'right', borderRight: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    {renderQtyCell(sku.stock_wh1, 'available')}
                  </td>

                  {/* Cedis */}
                  <td style={{ padding: '0.45rem 0.25rem', textAlign: 'right' }}>
                    {renderQtyCell(sku.wh2_total, 'total')}
                  </td>
                  <td style={{ padding: '0.45rem 0.25rem', textAlign: 'right' }}>
                    {renderQtyCell(sku.wh2_reserved, 'reserved')}
                  </td>
                  <td style={{ padding: '0.45rem 0.25rem', textAlign: 'right', borderRight: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    {renderQtyCell(sku.stock_wh2, 'available')}
                  </td>

                  {/* Totales */}
                  <td style={{ padding: '0.45rem 0.25rem', textAlign: 'right' }}>
                    {renderQtyCell(sku.total_quantity, 'total')}
                  </td>
                  <td style={{ padding: '0.45rem 0.25rem', textAlign: 'right' }}>
                    {renderQtyCell(sku.total_reserved, 'reserved')}
                  </td>
                  <td style={{ padding: '0.45rem 0.25rem', textAlign: 'right', borderRight: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    {renderQtyCell(sku.total_stock, 'available')}
                  </td>

                  <td style={{ padding: '0.45rem 0.35rem', color: 'var(--text-dim)', fontSize: '0.72rem', borderRight: '1px solid rgba(255, 255, 255, 0.04)', whiteSpace: 'nowrap' }}>
                    {sku.inventory_updated_at
                      ? new Date(sku.inventory_updated_at).toLocaleDateString('es-NI', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : 'Pendiente'}
                  </td>
                  <td style={{ padding: '0.45rem 0.35rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.3rem' }}>
                      {/* Botón Switch de Activar/Desactivar SKU (Icono Compacto) */}
                      <button
                        onClick={() => handleToggleSkuActive(sku.id, sku.is_active !== false)}
                        disabled={togglingActiveSkuId === sku.id}
                        className="btn-secondary"
                        style={{
                          padding: '0.3rem 0.45rem',
                          borderRadius: '8px',
                          border: sku.is_active !== false ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(248, 113, 113, 0.4)',
                          color: sku.is_active !== false ? '#34d399' : '#fb7185',
                          background: sku.is_active !== false ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        title={sku.is_active !== false ? `Desactivar SKU ${sku.id} en VTEX y BD` : `Activar SKU ${sku.id} en VTEX y BD`}
                      >
                        {togglingActiveSkuId === sku.id ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : sku.is_active !== false ? (
                          <ToggleRight size={17} color="#34d399" />
                        ) : (
                          <ToggleLeft size={17} color="#fb7185" />
                        )}
                      </button>

                      {/* Botón de Refrescar Inventario de SKU (Icono Compacto) */}
                      <button
                        onClick={() => handleSingleSkuRefresh(sku.id)}
                        disabled={updatingSkuId === sku.id}
                        className="btn-secondary"
                        style={{
                          padding: '0.3rem 0.45rem',
                          borderRadius: '8px',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          background: 'rgba(56, 189, 248, 0.08)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                        title={`Consultar e integrar inventario VTEX para SKU ${sku.id}`}
                      >
                        <RefreshCw size={13} className={updatingSkuId === sku.id ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })
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
