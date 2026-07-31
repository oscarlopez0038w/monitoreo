'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ShoppingCart, Calendar, Filter, Search, RefreshCw, ChevronDown, ChevronUp, Package, DollarSign, CheckCircle2, Clock, AlertTriangle, FileText, Zap, Radio, X } from 'lucide-react';

export default function OrdenesPage() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [registeringHook, setRegisteringHook] = useState(false);
  const [orders, setOrders] = useState([]);
  const [paging, setPaging] = useState({ total: 0, currentPage: 1, pages: 1 });
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderDetails, setOrderDetails] = useState({});
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [liveBanner, setLiveBanner] = useState(null);

  const fetchOrders = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        status: statusFilter,
        search,
        page: String(page),
      });

      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setOrders(data.data || []);
        setPaging(data.paging || { total: 0, currentPage: page, pages: 1 });
      }
    } catch (err) {
      console.error('Error cargando órdenes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(1);

    // Escuchar notificaciones en tiempo real desde Supabase (WebSocket Realtime)
    if (isSupabaseConfigured()) {
      const channel = supabase
        .channel('vtex_orders_channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'vtex_orders' },
          (payload) => {
            const row = payload.new;
            if (!row || !row.order_id) return;

            const realtimeOrder = {
              orderId: row.order_id,
              sequence: row.sequence,
              status: row.status,
              statusDescription: row.status_description,
              creationDate: row.creation_date,
              clientName: row.client_name,
              totalValue: Math.round((row.total_value || 0) * 100),
              isRealtime: true,
            };

            setOrders((prev) => {
              const idx = prev.findIndex((o) => o.orderId === realtimeOrder.orderId);
              if (idx !== -1) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], ...realtimeOrder };
                return updated;
              }
              // Si es una orden totalmente nueva, incrementamos la cuenta total en tiempo real
              setPaging((prevPaging) => ({
                ...prevPaging,
                total: (prevPaging.total || 0) + 1,
              }));
              return [realtimeOrder, ...prev];
            });

            setLiveBanner({
              type: 'success',
              text: `⚡ ¡Nueva orden recibida en tiempo real! ID: ${realtimeOrder.orderId} (Estado: ${realtimeOrder.status})`,
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [startDate, endDate, statusFilter]);

  // Activar Hook Webhook VTEX en 1 clic
  const handleActivateWebhook = async () => {
    setRegisteringHook(true);
    setLiveBanner(null);
    try {
      const res = await fetch('/api/orders/subscription', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLiveBanner({
          type: 'success',
          text: data.message || '🎉 Webhook VTEX activado en tiempo real.',
        });
      } else {
        setLiveBanner({
          type: 'error',
          text: `Error activando Webhook: ${data.error}`,
        });
      }
    } catch (err) {
      setLiveBanner({ type: 'error', text: `Error de conexión: ${err.message}` });
    } finally {
      setRegisteringHook(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchOrders(1);
  };

  const toggleExpandOrder = async (orderId) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }

    setExpandedOrderId(orderId);

    // Si no hemos cargado los detalles completos del pedido, los solicitamos
    if (!orderDetails[orderId]) {
      setLoadingDetailId(orderId);
      try {
        const res = await fetch(`/api/orders?orderId=${encodeURIComponent(orderId)}`);
        const data = await res.json();
        if (data.success && data.order) {
          setOrderDetails((prev) => ({ ...prev, [orderId]: data.order }));
        }
      } catch (err) {
        console.error('Error cargando detalle de orden:', err);
      } finally {
        setLoadingDetailId(null);
      }
    }
  };

  // Conteo rápido por estados
  const totalOrdersCount = paging.total || orders.length;
  const invoicedCount = orders.filter((o) => o.status === 'invoiced').length;
  const handlingCount = orders.filter((o) => o.status === 'handling' || o.status === 'ready-for-handling').length;
  const canceledCount = orders.filter((o) => o.status === 'canceled').length;

  const renderStatusBadge = (status, statusDescription) => {
    const s = String(status || '').toLowerCase();
    if (s === 'invoiced') {
      return (
        <span className="badge badge-emerald" style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}>
          <CheckCircle2 size={12} /> Facturada (invoiced)
        </span>
      );
    }
    if (s === 'handling' || s === 'ready-for-handling') {
      return (
        <span className="badge badge-amber" style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}>
          <Clock size={12} /> En Preparación ({s})
        </span>
      );
    }
    if (s === 'canceled') {
      return (
        <span className="badge badge-rose" style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}>
          <AlertTriangle size={12} /> Cancelada
        </span>
      );
    }
    return (
      <span className="badge" style={{ background: 'rgba(148, 163, 184, 0.12)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.25)', padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}>
        {statusDescription || status}
      </span>
    );
  };

  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        
        {/* Header Header & Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              <ShoppingCart size={24} color="#34d399" />
              Monitor de Órdenes VTEX OMS & Análisis de Inventario
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Consulta las órdenes del mes en curso y analiza cómo impactan el disponible de inventario al pasar a <code style={{ color: '#34d399' }}>invoiced</code> o <code style={{ color: '#fbbf24' }}>handling</code>.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleActivateWebhook}
              disabled={registeringHook}
              className="btn-primary"
              style={{ padding: '0.45rem 0.95rem', fontSize: '0.82rem' }}
            >
              <Zap size={14} className={registeringHook ? 'animate-spin' : ''} />
              {registeringHook ? 'Activando...' : '⚡ Activar Webhook VTEX en Vivo'}
            </button>

            <button onClick={() => fetchOrders(paging.currentPage)} disabled={loading} className="btn-secondary" style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Actualizar Órdenes
            </button>
          </div>
        </div>

        {/* Live Notification Banner */}
        {liveBanner && (
          <div
            style={{
              background: liveBanner.type === 'success' ? 'rgba(52, 211, 153, 0.14)' : 'rgba(248, 113, 113, 0.14)',
              border: `1px solid ${liveBanner.type === 'success' ? 'rgba(52, 211, 153, 0.35)' : 'rgba(248, 113, 113, 0.35)'}`,
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.86rem',
              color: liveBanner.type === 'success' ? '#34d399' : '#f87171',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Radio size={16} className="animate-pulse" />
              {liveBanner.text}
            </div>
            <button onClick={() => setLiveBanner(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Date & Filter Bar */}
        <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            
            {/* Fecha Inicio */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                <Calendar size={13} color="var(--accent-primary)" /> Fecha Inicio
              </label>
              <input
                type="date"
                className="glass-input"
                style={{ width: '100%', fontSize: '0.85rem' }}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* Fecha Fin */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                <Calendar size={13} color="var(--accent-primary)" /> Fecha Fin
              </label>
              <input
                type="date"
                className="glass-input"
                style={{ width: '100%', fontSize: '0.85rem' }}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Filtro por Estado */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                <Filter size={13} color="var(--accent-primary)" /> Estado de Orden
              </label>
              <select
                className="glass-input"
                style={{ width: '100%', fontSize: '0.85rem' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos los Estados</option>
                <option value="invoiced">Facturada (invoiced)</option>
                <option value="handling">En Preparación (handling)</option>
                <option value="ready-for-handling">Lista para preparar</option>
                <option value="canceled">Cancelada (canceled)</option>
              </select>
            </div>

            {/* Buscador de Orden */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                <Search size={13} color="var(--accent-primary)" /> Buscar por ID u Orden
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="glass-input"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  placeholder="Ej: v10025..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

          </form>
        </div>

        {/* Metric Cards Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          
          <div className="glass-card" style={{ padding: '1rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Total Órdenes</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-primary)', marginTop: '0.2rem' }}>
              {totalOrdersCount.toLocaleString()}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Facturadas (Invoiced)</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399', marginTop: '0.2rem' }}>
              {invoicedCount.toLocaleString()}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>En Preparación (Handling)</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.2rem' }}>
              {handlingCount.toLocaleString()}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Canceladas</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fb7185', marginTop: '0.2rem' }}>
              {canceledCount.toLocaleString()}
            </div>
          </div>

        </div>

        {/* Orders Table */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-subtle)', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem', tableLayout: 'auto' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.55rem 0.6rem', width: '40px' }}></th>
                  <th style={{ padding: '0.55rem 0.6rem' }}>ID de Orden</th>
                  <th style={{ padding: '0.55rem 0.6rem' }}>Fecha Creación</th>
                  <th style={{ padding: '0.55rem 0.6rem' }}>Cliente</th>
                  <th style={{ padding: '0.55rem 0.6rem', textAlign: 'right' }}>Total (C$)</th>
                  <th style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>Estado OMS</th>
                  <th style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading && orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: 'var(--accent-primary)' }} />
                      Consultando órdenes en VTEX OMS...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Package size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
                      <p style={{ fontWeight: 500, color: 'var(--text-main)' }}>No se encontraron órdenes en el rango seleccionado</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Prueba ampliando el rango de fechas.</p>
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const isExpanded = expandedOrderId === order.orderId;
                    const detail = orderDetails[order.orderId];
                    const formattedDate = order.creationDate
                      ? new Date(order.creationDate).toLocaleString('es-NI', { dateStyle: 'short', timeStyle: 'medium' })
                      : '-';

                    const totalFormatted = (order.totalValue ? order.totalValue / 100 : 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                    return (
                      <>
                        <tr key={order.orderId} style={{ borderBottom: '1px solid var(--border-subtle)', background: isExpanded ? 'rgba(56, 189, 248, 0.04)' : 'transparent' }}>
                          <td style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>
                            <button
                              onClick={() => toggleExpandOrder(order.orderId)}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </td>
                          <td style={{ padding: '0.55rem 0.6rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ffffff' }}>
                            {order.orderId}
                          </td>
                          <td style={{ padding: '0.55rem 0.6rem', color: 'var(--text-muted)' }}>
                            {formattedDate}
                          </td>
                          <td style={{ padding: '0.55rem 0.6rem', color: 'var(--text-main)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {order.clientName || 'Cliente General'}
                          </td>
                          <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)' }}>
                            C$ {totalFormatted}
                          </td>
                          <td style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>
                            {renderStatusBadge(order.status, order.statusDescription)}
                          </td>
                          <td style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>
                            <button
                              onClick={() => toggleExpandOrder(order.orderId)}
                              className="btn-secondary"
                              style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', borderRadius: '6px' }}
                            >
                              {isExpanded ? 'Ocultar Items' : 'Ver Items & SKUs'}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Item Breakdown Row */}
                        {isExpanded && (
                          <tr key={`${order.orderId}-detail`} style={{ background: 'rgba(15, 23, 42, 0.7)', borderBottom: '2px solid var(--border-subtle)' }}>
                            <td colSpan={7} style={{ padding: '1rem 1.25rem' }}>
                              {loadingDetailId === order.orderId ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                  <RefreshCw size={14} className="animate-spin" color="var(--accent-primary)" />
                                  Obteniendo items e información de inventario para la orden {order.orderId}...
                                </div>
                              ) : detail?.items ? (
                                <div>
                                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Package size={15} color="var(--accent-primary)" />
                                    Desglose de SKUs Comprados ({detail.items.length} productos)
                                  </h4>

                                  <div style={{ borderRadius: '8px', border: '1px solid var(--border-subtle)', overflow: 'hidden', background: '#04070d' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                                      <thead>
                                        <tr style={{ background: 'rgba(30, 41, 59, 0.8)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                                          <th style={{ padding: '0.4rem 0.75rem' }}>SKU ID</th>
                                          <th style={{ padding: '0.4rem 0.75rem' }}>Nombre / Descripción SKU</th>
                                          <th style={{ padding: '0.4rem 0.75rem', textAlign: 'center' }}>Cantidad Comprada</th>
                                          <th style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>Precio Unitario</th>
                                          <th style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>Total Item</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detail.items.map((item, idx) => {
                                          const itemPrice = (item.price ? item.price / 100 : 0).toLocaleString('es-NI', { minimumFractionDigits: 2 });
                                          const itemTotal = (item.price && item.quantity ? (item.price * item.quantity) / 100 : 0).toLocaleString('es-NI', { minimumFractionDigits: 2 });

                                          return (
                                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                              <td style={{ padding: '0.4rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ffffff' }}>
                                                {item.id || item.sellerSku}
                                              </td>
                                              <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-main)' }}>
                                                {item.name || item.skuName || 'Producto SINSA'}
                                              </td>
                                              <td style={{ padding: '0.4rem 0.75rem', textAlign: 'center', fontWeight: 700, color: 'var(--accent-amber)' }}>
                                                {item.quantity} unid.
                                              </td>
                                              <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                                                C$ {itemPrice}
                                              </td>
                                              <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                                                C$ {itemTotal}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No se pudo cargar el detalle de items.</span>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {paging.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                Página {paging.currentPage} de {paging.pages} ({paging.total} órdenes en total)
              </span>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => fetchOrders(Math.max(1, paging.currentPage - 1))}
                  disabled={paging.currentPage <= 1 || loading}
                  className="btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Anterior
                </button>
                <button
                  onClick={() => fetchOrders(Math.min(paging.pages, paging.currentPage + 1))}
                  disabled={paging.currentPage >= paging.pages || loading}
                  className="btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>

      </main>
    </AppLayout>
  );
}
