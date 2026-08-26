'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getNicaraguaNow } from '@/lib/dateUtils';
import * as XLSX from 'xlsx';
import { ShoppingCart, Calendar, Filter, Search, RefreshCw, ChevronDown, ChevronUp, Package, DollarSign, CheckCircle2, Clock, AlertTriangle, FileText, Zap, Radio, X, MessageSquare, Info, Download, Truck, Store, MapPin, Megaphone, Tag, Gift, User, FileSpreadsheet } from 'lucide-react';

export default function OrdenesPage() {
  const nicNow = getNicaraguaNow();

  const [startDate, setStartDate] = useState(nicNow.todayStr);
  const [endDate, setEndDate] = useState(nicNow.todayStr);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date_desc'); // 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
  const [loading, setLoading] = useState(false);
  const [registeringHook, setRegisteringHook] = useState(false);
  const [orders, setOrders] = useState([]);
  const [paging, setPaging] = useState({ total: 0, currentPage: 1, pages: 1 });
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderDetails, setOrderDetails] = useState({});
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [liveBanner, setLiveBanner] = useState(null);
  const [showAllStores, setShowAllStores] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [globalStats, setGlobalStats] = useState({ total: 0, invoiced: 0, handling: 0, readyForHandling: 0, canceled: 0, pickupCount: 0, deliveryCount: 0, pickupPct: 0, deliveryPct: 0, pickupStores: [] });

  const handleExportAllOrders = async () => {
    setExportingAll(true);
    setLiveBanner(null);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        status: statusFilter,
        search,
        export: 'true',
      });
      const res = await fetch(`/api/orders?${params.toString()}`);
      const json = await res.json();
      const list = json.data || [];

      if (list.length === 0) {
        setLiveBanner({ type: 'error', text: 'No se encontraron órdenes para exportar en el período/filtro seleccionado.' });
        return;
      }

      const exportRows = list.map((o) => ({
        'ID Orden': o.orderId || o.sequence,
        'Secuencia': o.sequence || o.orderId,
        'Fecha Creación': o.creationDate ? new Date(o.creationDate).toLocaleString('es-NI') : '',
        'Estado': o.statusDescription || o.status,
        'Cliente': o.clientName || 'N/A',
        'Total C$': o.totalValue ? (o.totalValue / 100).toFixed(2) : '0.00',
        'Tipo Entrega': o.fulfillmentType === 'pickup' ? 'Retiro en Tienda' : 'Entrega a Domicilio',
        'Tienda Retiro': o.pickupStore || 'N/A',
        'Cantidad Items': o.itemsCount || 1,
        'Motivo de Cancelación': o.status === 'canceled' ? (o.cancelReason || 'Sin motivo registrado por el sistema') : 'N/A',
        'Comentarios': o.comments || '',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte Órdenes');
      XLSX.writeFile(wb, `Reporte_Ordenes_VTEX_${startDate}_al_${endDate}.xlsx`);

      setLiveBanner({
        type: 'success',
        text: `📊 ${list.length} órdenes exportadas a Excel exitosamente (incluye motivo de cancelación en canceladas).`,
      });
    } catch (err) {
      console.error('Error exportando órdenes:', err);
      setLiveBanner({ type: 'error', text: `Error al exportar órdenes: ${err.message}` });
    } finally {
      setExportingAll(false);
    }
  };

  const handleSyncOrders = async () => {
    setSyncingOrders(true);
    setLiveBanner({
      type: 'success',
      text: '🚀 Iniciando extracción e indexación de órdenes en segundo plano...',
    });
    try {
      const res = await fetch('/api/orders/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = await res.json();
      if (data.success) {
        setLiveBanner({
          type: 'success',
          text: `🎉 ${data.message || 'Sincronización masiva de órdenes completada.'}`,
        });
        fetchOrders(1);
      } else {
        setLiveBanner({ type: 'error', text: `Error en sincronización: ${data.error}` });
      }
    } catch (err) {
      setLiveBanner({ type: 'error', text: `Error de red al sincronizar órdenes: ${err.message}` });
    } finally {
      setSyncingOrders(false);
    }
  };

  const fetchOrders = async (page = 1, currentSort = sortBy) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        status: statusFilter,
        search,
        sortBy: currentSort,
        page: String(page),
      });

      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setOrders(data.data || []);
        setPaging(data.paging || { total: 0, currentPage: page, pages: 1 });
        if (data.stats) {
          setGlobalStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Error cargando órdenes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(1, sortBy);
  }, [sortBy]);

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
              // Si es una orden totalmente nueva, incrementamos las métricas globales en tiempo real
              setPaging((prevPaging) => ({
                ...prevPaging,
                total: (prevPaging.total || 0) + 1,
              }));
              setGlobalStats((prevStats) => ({
                total: (prevStats.total || 0) + 1,
                invoiced: realtimeOrder.status === 'invoiced' ? (prevStats.invoiced || 0) + 1 : (prevStats.invoiced || 0),
                handling: realtimeOrder.status === 'handling' ? (prevStats.handling || 0) + 1 : (prevStats.handling || 0),
                readyForHandling: realtimeOrder.status === 'ready-for-handling' ? (prevStats.readyForHandling || 0) + 1 : (prevStats.readyForHandling || 0),
                canceled: realtimeOrder.status === 'canceled' ? (prevStats.canceled || 0) + 1 : (prevStats.canceled || 0),
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
  }, []);


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

  // Conteo global por estados en todo el mes
  const totalOrdersCount = globalStats.total || paging.total || orders.length;
  const invoicedCount = globalStats.invoiced || 0;
  const readyCount = globalStats.readyForHandling || 0;
  const handlingCount = globalStats.handling || 0;
  const canceledCount = globalStats.canceled || 0;

  const renderStatusBadge = (status, statusDescription) => {
    const s = String(status || '').toLowerCase();
    const commonBadgeStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.35rem',
      width: '210px',
      height: '28px',
      borderRadius: '20px',
      fontSize: '0.73rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      boxSizing: 'border-box',
      padding: '0 0.6rem',
    };

    if (s === 'invoiced') {
      return (
        <span className="badge badge-emerald" style={commonBadgeStyle}>
          <CheckCircle2 size={13} style={{ flexShrink: 0 }} /> Facturada (invoiced)
        </span>
      );
    }
    if (s === 'ready-for-handling') {
      return (
        <span className="badge" style={{ ...commonBadgeStyle, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
          <Clock size={13} style={{ flexShrink: 0 }} /> Lista para preparar
        </span>
      );
    }
    if (s === 'handling') {
      return (
        <span className="badge badge-amber" style={commonBadgeStyle}>
          <Clock size={13} style={{ flexShrink: 0 }} /> En Preparación (handling)
        </span>
      );
    }
    if (s === 'canceled') {
      return (
        <span className="badge badge-rose" style={commonBadgeStyle}>
          <AlertTriangle size={13} style={{ flexShrink: 0 }} /> Cancelada (canceled)
        </span>
      );
    }
    return (
      <span className="badge" style={{ ...commonBadgeStyle, background: 'rgba(148, 163, 184, 0.12)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.25)' }}>
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
              onClick={handleExportAllOrders}
              disabled={exportingAll}
              className="btn-secondary"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', borderColor: '#34d399', color: '#34d399' }}
            >
              <FileSpreadsheet size={14} className={exportingAll ? 'animate-spin' : ''} />
              {exportingAll ? 'Exportando Órdenes...' : 'Descargar Órdenes'}
            </button>

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
          <form onSubmit={handleSearchSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            
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
                <option value="ready-for-handling">Lista para preparar (ready-for-handling)</option>
                <option value="handling">En preparación (handling)</option>
                <option value="invoiced">Facturada (invoiced)</option>
                <option value="canceled">Cancelada (canceled)</option>
                <option value="approve-payment">Pago Aprobado (approve-payment)</option>
                <option value="payment-pending">Pago Pendiente (payment-pending)</option>
              </select>
            </div>

            {/* Buscador Multi-campo: Orden, Cliente, SKU */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                <Search size={13} color="var(--accent-primary)" /> Buscar por ID, Cliente o SKU
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  className="glass-input"
                  style={{ width: '100%', fontSize: '0.85rem', paddingRight: search ? '2.2rem' : '0.75rem' }}
                  placeholder="Ej: 140911851, Axell, v511502..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{
                      position: 'absolute',
                      right: '0.5rem',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.2rem',
                    }}
                    title="Limpiar búsqueda"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Ordenar Por */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                <DollarSign size={13} color="var(--accent-primary)" /> Ordenar Por
              </label>
              <select
                className="glass-input"
                style={{ width: '100%', fontSize: '0.85rem' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date_desc">Fecha (Más recientes primero)</option>
                <option value="date_asc">Fecha (Más antiguas primero)</option>
                <option value="amount_desc">Monto C$ (Mayor a Menor)</option>
                <option value="amount_asc">Monto C$ (Menor a Mayor)</option>
              </select>
            </div>

            {/* Botón Buscar */}
            <div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{
                  width: '100%',
                  minHeight: '38px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  backgroundColor: '#2563eb',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
              >
                <Search size={15} />
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>

          </form>
        </div>

        {/* Metric Cards Summary - Alineación Uniforme & Z-Index Elevado */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'stretch', position: 'relative', zIndex: 50 }}>
          
          {/* Card 1: Total Órdenes */}
          <div className="glass-card" style={{ padding: '0.75rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '115px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>Total Órdenes</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '0.25rem', lineHeight: 1.1 }}>
              {totalOrdersCount.toLocaleString()}
            </div>
          </div>

          {/* Card 2: Facturadas (Invoiced) */}
          <div className="glass-card" style={{ padding: '0.75rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '115px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>Facturadas</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34d399', marginTop: '0.25rem', lineHeight: 1.1 }}>
              {invoicedCount.toLocaleString()}
            </div>
          </div>

          {/* Card 3: Lista para Preparar */}
          <div className="glass-card" style={{ padding: '0.75rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '115px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>Lista p/ Preparar</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.25rem', lineHeight: 1.1 }}>
              {readyCount.toLocaleString()}
            </div>
          </div>

          {/* Card 4: En Preparación */}
          <div className="glass-card" style={{ padding: '0.75rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '115px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>En Preparación</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.25rem', lineHeight: 1.1 }}>
              {handlingCount.toLocaleString()}
            </div>
          </div>

          {/* Card 5: Canceladas */}
          <div className="glass-card" style={{ padding: '0.75rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '115px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>Canceladas</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fb7185', marginTop: '0.25rem', lineHeight: 1.1 }}>
              {canceledCount.toLocaleString()}
            </div>
          </div>

          {/* Card 6: Tipo de Entrega (Pickup vs Delivery) */}
          <div className="glass-card" style={{ padding: '0.65rem 0.85rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.95))', border: '1px solid rgba(56, 189, 248, 0.3)', gridColumn: 'span 1', minWidth: '210px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '115px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Truck size={12} color="#38bdf8" /> Tipo de Entrega
              </span>
              <span style={{ fontSize: '0.65rem', color: '#38bdf8', fontWeight: 600 }}>
                {(globalStats.pickupCount || 0) + (globalStats.deliveryCount || 0)} ord.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8' }}>
                  🏬 {globalStats.pickupPct || 0}%
                </span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  Pickup ({globalStats.pickupCount || 0})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#34d399' }}>
                  🚚 {globalStats.deliveryPct || 0}%
                </span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  Delivery ({globalStats.deliveryCount || 0})
                </span>
              </div>
            </div>

            {/* Visual Dual Progress Bar */}
            <div style={{ width: '100%', height: '5px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${globalStats.pickupPct || 0}%`, height: '100%', background: '#38bdf8', transition: 'width 0.5s ease' }} title={`Pickup: ${globalStats.pickupPct}%`} />
              <div style={{ width: `${globalStats.deliveryPct || 0}%`, height: '100%', background: '#34d399', transition: 'width 0.5s ease' }} title={`Delivery: ${globalStats.deliveryPct}%`} />
            </div>
          </div>

          {/* Card 7: Top Tiendas Pickup (Superpuesta con Z-Index Máximo) */}
          <div className="glass-card" style={{ padding: '0.65rem 0.85rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.98))', border: '1px solid rgba(129, 140, 248, 0.35)', gridColumn: 'span 1', minWidth: '220px', position: 'relative', zIndex: 100, minHeight: '115px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Store size={12} color="#818cf8" /> Top Tiendas Pickup
                </span>
                <span style={{ fontSize: '0.65rem', color: '#818cf8', fontWeight: 600 }}>
                  {(globalStats.pickupStores || []).length} tiendas
                </span>
              </div>

              {/* Lista de Top 3 Tiendas Visibles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {!(globalStats.pickupStores && globalStats.pickupStores.length > 0) ? (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic', display: 'block', textAlign: 'center', padding: '0.5rem 0' }}>
                    Sin datos de retiro
                  </span>
                ) : (
                  globalStats.pickupStores.slice(0, 3).map((item, idx) => (
                    <div key={idx} style={{ fontSize: '0.72rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.1rem' }}>
                        <span style={{ color: '#e2e8f0', fontWeight: 600, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.store}>
                          {idx + 1}. {item.store}
                        </span>
                        <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '0.7rem' }}>
                          {item.pct}% <span style={{ color: '#94a3b8', fontWeight: 400 }}>({item.count})</span>
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '3px', borderRadius: '2px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${item.pct}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #818cf8)', borderRadius: '2px' }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Botón para abrir/cerrar el menú flotante superpuesto */}
            {globalStats.pickupStores && globalStats.pickupStores.length > 3 && (
              <button
                onClick={() => setShowAllStores(!showAllStores)}
                style={{
                  marginTop: '0.35rem',
                  background: showAllStores ? 'rgba(129, 140, 248, 0.25)' : 'rgba(129, 140, 248, 0.1)',
                  border: '1px solid rgba(129, 140, 248, 0.35)',
                  borderRadius: '6px',
                  color: '#818cf8',
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.2rem',
                  padding: '0.2rem 0.4rem',
                  transition: 'all 0.2s ease',
                  width: '100%',
                }}
              >
                {showAllStores ? (
                  <>Cerrar menú <ChevronUp size={12} /></>
                ) : (
                  <>Ver todas las tiendas (+{globalStats.pickupStores.length - 3}) <ChevronDown size={12} /></>
                )}
              </button>
            )}

            {/* MENÚ FLOTANTE SUPERPUESTO (Z-INDEX 9999 EN FRENTE DE TODO) */}
            {showAllStores && globalStats.pickupStores && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  left: 0,
                  zIndex: 99999,
                  background: '#0b1120',
                  border: '1px solid rgba(129, 140, 248, 0.5)',
                  borderRadius: '12px',
                  padding: '0.85rem',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.95), 0 0 25px rgba(99, 102, 241, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                  maxHeight: '320px',
                  overflowY: 'auto',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', paddingBottom: '0.35rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Store size={13} /> Desglose Tiendas ({globalStats.pickupStores.length})
                  </span>
                  <button
                    onClick={() => setShowAllStores(false)}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex', padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                </div>

                {globalStats.pickupStores.map((item, idx) => (
                  <div key={idx} style={{ fontSize: '0.73rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.15rem' }}>
                      <span style={{ color: '#e2e8f0', fontWeight: 600, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.store}>
                        {idx + 1}. {item.store}
                      </span>
                      <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '0.72rem' }}>
                        {item.pct}% <span style={{ color: '#94a3b8', fontWeight: 400 }}>({item.count})</span>
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${item.pct}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #818cf8)', borderRadius: '2px' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Orders Table Container con Z-Index Bajo */}
        <div className="glass-card" style={{ padding: '1.25rem', position: 'relative', zIndex: 1 }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '12px', border: '1px solid var(--border-subtle)', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem', tableLayout: 'auto' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.55rem 0.6rem', width: '40px' }}></th>
                  <th style={{ padding: '0.55rem 0.6rem' }}>ID de Orden</th>
                  <th style={{ padding: '0.55rem 0.6rem' }}>Fecha Creación</th>
                  <th style={{ padding: '0.55rem 0.6rem' }}>Cliente</th>
                  <th style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>Método Entrega</th>
                  <th
                    onClick={() => {
                      if (sortBy === 'amount_desc') setSortBy('amount_asc');
                      else setSortBy('amount_desc');
                    }}
                    style={{
                      padding: '0.55rem 0.6rem',
                      textAlign: 'right',
                      cursor: 'pointer',
                      userSelect: 'none',
                      color: sortBy.startsWith('amount') ? '#38bdf8' : 'inherit',
                    }}
                    title="Clic para ordenar por Monto (C$)"
                  >
                    Total (C$) {sortBy === 'amount_desc' ? '▼' : sortBy === 'amount_asc' ? '▲' : '↕'}
                  </th>
                  <th style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>Estado OMS</th>
                  <th style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading && orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: 'var(--accent-primary)' }} />
                      Consultando órdenes en VTEX OMS...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                          <td style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>
                            {order.fulfillmentType === 'pickup' ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.35rem',
                                  width: '210px',
                                  height: '28px',
                                  borderRadius: '20px',
                                  fontSize: '0.73rem',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  boxSizing: 'border-box',
                                  padding: '0 0.6rem',
                                  background: 'rgba(56, 189, 248, 0.12)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                }}
                                title={order.pickupStore ? `Tienda: ${order.pickupStore}` : 'Retiro en Tienda'}
                              >
                                <Store size={13} style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {order.pickupStore ? `Pickup (${order.pickupStore})` : 'Pickup Store'}
                                </span>
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.35rem',
                                  width: '210px',
                                  height: '28px',
                                  borderRadius: '20px',
                                  fontSize: '0.73rem',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  boxSizing: 'border-box',
                                  padding: '0 0.6rem',
                                  background: 'rgba(52, 211, 153, 0.12)',
                                  color: '#34d399',
                                  border: '1px solid rgba(52, 211, 153, 0.3)',
                                }}
                                title="Envío a Domicilio"
                              >
                                <Truck size={13} style={{ flexShrink: 0 }} />
                                Delivery
                              </span>
                            )}
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
                            <td colSpan={8} style={{ padding: '1rem 1.25rem' }}>
                              {loadingDetailId === order.orderId ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                  <RefreshCw size={14} className="animate-spin" color="var(--accent-primary)" />
                                  Obteniendo items e información de inventario para la orden {order.orderId}...
                                </div>
                              ) : detail ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  
                                  {/* BANNER DE INFORMACIÓN RESUMIDA: DIRECCIÓN, FLETE Y CAMPAÑA UTM */}
                                  {(() => {
                                    const shippingVal = detail.totals?.find((t) => t.id === 'Shipping')?.value;
                                    const shippingCost = shippingVal !== undefined ? shippingVal / 100 : 0;

                                    const addr = detail.shippingData?.address || {};
                                    const receiverName = addr.receiverName || order.clientName || 'Cliente General';
                                    const fullAddressParts = [addr.street, addr.number, addr.neighborhood, addr.city, addr.state].filter(Boolean);
                                    const fullAddress = fullAddressParts.length > 0 ? fullAddressParts.join(', ') : 'Dirección de retiro/entrega no especificada';
                                    const reference = addr.reference || null;

                                    const mkt = detail.marketingData || {};
                                    const utmCampaign = mkt.utmCampaign;
                                    const utmSource = mkt.utmSource;
                                    const utmMedium = mkt.utmMedium;
                                    const utmiCampaign = mkt.utmiCampaign;
                                    const coupon = mkt.coupon;

                                    return (
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
                                        
                                        {/* Card 1: Dirección y Destinatario */}
                                        <div style={{ background: 'rgba(15, 23, 42, 0.85)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.25)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                          <span style={{ fontSize: '0.7rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <MapPin size={13} color="#38bdf8" /> Dirección & Destinatario
                                          </span>
                                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>
                                            👤 {receiverName}
                                          </div>
                                          {order.clientEmail && (
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                              ✉️ {order.clientEmail}
                                            </div>
                                          )}
                                          <div style={{ fontSize: '0.76rem', color: 'var(--text-main)', lineHeight: '1.3' }}>
                                            📍 {fullAddress}
                                          </div>
                                          {reference && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                              Ref: {reference}
                                            </div>
                                          )}
                                        </div>

                                        {/* Card 2: Costo de Flete / Envío */}
                                        <div style={{ background: 'rgba(15, 23, 42, 0.85)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(52, 211, 153, 0.25)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                          <span style={{ fontSize: '0.7rem', color: '#34d399', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <Truck size={13} color="#34d399" /> Costo de Flete / Envío
                                          </span>
                                          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: shippingCost === 0 ? '#34d399' : '#ffffff', marginTop: '0.1rem' }}>
                                            {shippingCost === 0 ? '✨ Flete Gratis (C$ 0.00)' : `C$ ${shippingCost.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`}
                                          </div>
                                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            Método: {order.fulfillmentType === 'pickup' ? `Retiro en Tienda (${order.pickupStore || 'Pickup'})` : 'Envío a Domicilio (Delivery)'}
                                          </span>
                                        </div>

                                        {/* Card 3: Campaña Marketing / UTM & Cupones */}
                                        <div style={{ background: 'rgba(15, 23, 42, 0.85)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(165, 180, 252, 0.25)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                          <span style={{ fontSize: '0.7rem', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <Megaphone size={13} color="#a5b4fc" /> Campaña & Origen (UTM)
                                          </span>
                                          {utmCampaign || utmSource || utmMedium || utmiCampaign || coupon ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.76rem' }}>
                                              {utmCampaign && (
                                                <div style={{ color: '#ffffff' }}>
                                                  🎯 Campaign: <strong style={{ color: '#a5b4fc' }}>{utmCampaign}</strong>
                                                </div>
                                              )}
                                              {utmSource && (
                                                <div style={{ color: 'var(--text-muted)' }}>
                                                  📡 Source / Canal: <strong style={{ color: '#ffffff' }}>{utmSource}</strong> {utmMedium ? `(${utmMedium})` : ''}
                                                </div>
                                              )}
                                              {utmiCampaign && (
                                                <div style={{ color: 'var(--text-muted)' }}>
                                                  🖼️ Banner/Interno: <strong style={{ color: '#ffffff' }}>{utmiCampaign}</strong>
                                                </div>
                                              )}
                                              {coupon && (
                                                <div style={{ color: '#34d399', fontWeight: 700 }}>
                                                  🎟️ Cupon Aplicado: {coupon}
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                                              🌐 Venta Orgánica / Directa (Sin campaña UTM)
                                            </div>
                                          )}
                                        </div>

                                      </div>
                                    );
                                  })()}

                                  {/* Banner de Motivo de Cancelación y Comentarios / Notas de la Orden */}
                                  {((order.status === 'canceled') || detail.cancelReason || detail.cancellationData || detail.openTextField) && (
                                    <div
                                      style={{
                                        padding: '0.85rem 1rem',
                                        borderRadius: '8px',
                                        background: order.status === 'canceled' ? 'rgba(248, 113, 113, 0.08)' : 'rgba(56, 189, 248, 0.08)',
                                        border: `1px solid ${order.status === 'canceled' ? 'rgba(248, 113, 113, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                                        fontSize: '0.82rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.5rem',
                                      }}
                                    >
                                      {/* Motivo de Cancelación */}
                                      {order.status === 'canceled' && (
                                        <div style={{ color: '#fb7185', fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                                          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                                          <div>
                                            <span>Motivo de Cancelación VTEX: </span>
                                            <span style={{ color: '#ffffff', fontWeight: 400 }}>
                                              {detail.cancelReason ||
                                                (typeof detail.cancellationData === 'object' ? detail.cancellationData?.reason : detail.cancellationData) ||
                                                (typeof detail.openTextField === 'object' ? detail.openTextField?.value : detail.openTextField) ||
                                                'Sin motivo registrado por el sistema'}
                                            </span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Comentarios / Observaciones de la Orden */}
                                      {(detail.openTextField || detail.customData) && (
                                        <div style={{ color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                                          <MessageSquare size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                                          <div>
                                            <span>Comentario / Notas de la Orden: </span>
                                            <span style={{ color: '#ffffff', fontWeight: 400 }}>
                                              {typeof detail.openTextField === 'object' ? detail.openTextField?.value : (detail.openTextField || JSON.stringify(detail.customData))}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* TABLA DE PRODUCTOS Y PRECIOS LISTA VS PRECIO FINAL REAL DE VENTA */}
                                  {detail.items && (
                                    <>
                                      <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', margin: '0.3rem 0 0 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Package size={15} color="var(--accent-primary)" />
                                        Desglose de SKUs Comprados ({detail.items.length} productos)
                                      </h4>

                                      <div style={{ borderRadius: '8px', border: '1px solid var(--border-subtle)', overflow: 'hidden', background: '#04070d' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                                          <thead>
                                            <tr style={{ background: 'rgba(30, 41, 59, 0.8)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                                              <th style={{ padding: '0.45rem 0.75rem' }}>SKU ID</th>
                                              <th style={{ padding: '0.45rem 0.75rem' }}>Nombre / Descripción SKU</th>
                                              <th style={{ padding: '0.45rem 0.75rem', textAlign: 'center' }}>Cantidad</th>
                                              <th style={{ padding: '0.45rem 0.75rem', textAlign: 'right' }}>Precio Lista (MSRP)</th>
                                              <th style={{ padding: '0.45rem 0.75rem', textAlign: 'right' }}>Precio Venta (Final)</th>
                                              <th style={{ padding: '0.45rem 0.75rem', textAlign: 'center' }}>Descuento / Oferta</th>
                                              <th style={{ padding: '0.45rem 0.75rem', textAlign: 'right' }}>Total Item</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {detail.items.map((item, idx) => {
                                              const listP = (item.listPrice || item.price ? (item.listPrice || item.price) / 100 : 0);
                                              const sellingP = (item.sellingPrice || item.price ? (item.sellingPrice || item.price) / 100 : 0);
                                              const quantity = item.quantity || 1;
                                              const totalItemVal = sellingP * quantity;

                                              const hasDiscount = listP > sellingP && sellingP > 0;
                                              const discountPct = hasDiscount ? Math.round(((listP - sellingP) / listP) * 100) : 0;
                                              const discountAmount = hasDiscount ? (listP - sellingP) : 0;

                                              return (
                                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                  <td style={{ padding: '0.45rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ffffff' }}>
                                                    {item.id || item.sellerSku}
                                                  </td>
                                                  <td style={{ padding: '0.45rem 0.75rem', color: 'var(--text-main)' }}>
                                                    {item.name || item.skuName || 'Producto SINSA'}
                                                  </td>
                                                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'center', fontWeight: 700, color: 'var(--accent-amber)' }}>
                                                    {quantity} unid.
                                                  </td>
                                                  {/* Precio Lista */}
                                                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hasDiscount ? 'var(--text-dim)' : 'var(--text-muted)', textDecoration: hasDiscount ? 'line-through' : 'none' }}>
                                                    C$ {listP.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                                                  </td>
                                                  {/* Precio Venta Final */}
                                                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#34d399' }}>
                                                    C$ {sellingP.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                                                  </td>
                                                  {/* Descuento Badge */}
                                                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'center' }}>
                                                    {hasDiscount ? (
                                                      <span className="badge badge-emerald" style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontWeight: 700 }}>
                                                        -{discountPct}% (C$ {discountAmount.toFixed(2)})
                                                      </span>
                                                    ) : (
                                                      <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>Precio Base</span>
                                                    )}
                                                  </td>
                                                  {/* Total Item */}
                                                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                                                    C$ {totalItemVal.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </>
                                  )}
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
