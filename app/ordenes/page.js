'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getNicaraguaNow } from '@/lib/dateUtils';
import * as XLSX from 'xlsx';
import { ShoppingCart, Calendar, Filter, Search, RefreshCw, ChevronDown, ChevronUp, Package, DollarSign, CheckCircle2, Clock, AlertTriangle, FileText, Zap, Radio, X, MessageSquare, Info, Download, Truck, Store, MapPin, Megaphone, Tag, Gift, User, FileSpreadsheet } from 'lucide-react';

const BCN_EXCHANGE_RATE = 36.6243;

export default function OrdenesPage() {
  const nicNow = getNicaraguaNow();

  const [startDate, setStartDate] = useState(nicNow.todayStr);
  const [endDate, setEndDate] = useState(nicNow.todayStr);
  const [selectedPreset, setSelectedPreset] = useState('today');
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowRangeDropdown(false);
      }
    };
    if (showRangeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showRangeDropdown]);

  const presetOptions = [
    { id: 'today', label: 'Hoy' },
    { id: 'yesterday', label: 'Ayer' },
    { id: 'last_7_days', label: 'Últimos 7 Días' },
    { id: 'current_month', label: 'Mes Actual' },
    { id: 'last_30_days', label: 'Últimos 30 Días' },
  ];

  const handleSelectPreset = (presetId) => {
    setSelectedPreset(presetId);
    if (presetId === 'custom') return;

    const todayObj = new Date();
    const todayStr = nicNow.todayStr;

    const formatDateStr = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    let s = todayStr;
    let e = todayStr;

    if (presetId === 'today') {
      s = todayStr;
      e = todayStr;
    } else if (presetId === 'yesterday') {
      const yest = new Date(todayObj.getTime() - 24 * 3600 * 1000);
      s = formatDateStr(yest);
      e = s;
    } else if (presetId === 'last_7_days') {
      const d7 = new Date(todayObj.getTime() - 6 * 24 * 3600 * 1000);
      s = formatDateStr(d7);
      e = todayStr;
    } else if (presetId === 'current_month') {
      s = nicNow.firstDayStr;
      e = todayStr;
    } else if (presetId === 'last_30_days') {
      const d30 = new Date(todayObj.getTime() - 29 * 24 * 3600 * 1000);
      s = formatDateStr(d30);
      e = todayStr;
    }

    setStartDate(s);
    setEndDate(e);
  };

  const handleStartDateChange = (val) => {
    setStartDate(val);
    setSelectedPreset('custom');
  };

  const handleEndDateChange = (val) => {
    setEndDate(val);
    setSelectedPreset('custom');
  };

  const [statusFilter, setStatusFilter] = useState('');
  const [saleTypeFilter, setSaleTypeFilter] = useState('');
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
  const [currency, setCurrency] = useState('NIO');
  const [globalStats, setGlobalStats] = useState({
    total: 0,
    invoiced: 0,
    handling: 0,
    readyForHandling: 0,
    canceled: 0,
    pickupCount: 0,
    deliveryCount: 0,
    pickupPct: 0,
    deliveryPct: 0,
    pickupStores: [],
    invoicedRevenue: 0,
    socialSellingRevenue: 0,
    socialSellingCount: 0,
    organicRevenue: 0,
    organicCount: 0,
  });

  const handleExportAllOrders = async () => {
    setExportingAll(true);
    setLiveBanner(null);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        status: statusFilter,
        saleType: saleTypeFilter,
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
        'Total $ USD': o.totalValue ? ((o.totalValue / 100) / BCN_EXCHANGE_RATE).toFixed(2) : '0.00',
        'Código Vendedor': o.sellerCode || '',
        'Tipo Venta': o.saleType === 'social' || o.sellerCode ? 'Social Selling' : 'Orgánica',
        'Tipo Entrega': o.fulfillmentType === 'pickup' ? 'Retiro en Tienda' : 'Entrega a Domicilio',
        'Tienda Retiro': o.pickupStore || 'N/A',
        'Cantidad Items': o.itemsCount || 1,
        'Ticket Factura Física': o.invoiceTicket || '',
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
        saleType: saleTypeFilter,
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
                ...prevStats,
                total: (prevStats.total || 0) + 1,
                invoiced: realtimeOrder.status === 'invoiced' ? (prevStats.invoiced || 0) + 1 : (prevStats.invoiced || 0),
                handling: realtimeOrder.status === 'handling' ? (prevStats.handling || 0) + 1 : (prevStats.handling || 0),
                readyForHandling: realtimeOrder.status === 'ready-for-handling' ? (prevStats.readyForHandling || 0) + 1 : (prevStats.readyForHandling || 0),
                canceled: realtimeOrder.status === 'canceled' ? (prevStats.canceled || 0) + 1 : (prevStats.canceled || 0),
                invoicedRevenue: realtimeOrder.status === 'invoiced' ? (prevStats.invoicedRevenue || 0) + ((realtimeOrder.totalValue || 0) / 100) : (prevStats.invoicedRevenue || 0),
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
  const invoicedRevenue = globalStats.invoicedRevenue || 0;
  const socialSellingRevenue = globalStats.socialSellingRevenue || 0;
  const socialSellingCount = globalStats.socialSellingCount || 0;
  const organicRevenue = globalStats.organicRevenue || 0;
  const organicCount = globalStats.organicCount || 0;
  const socialSellingPct = invoicedRevenue > 0 ? Math.round((socialSellingRevenue / invoicedRevenue) * 100) : 0;
  const organicPct = invoicedRevenue > 0 ? 100 - socialSellingPct : 0;
  const formatMoney = (value) => {
    const nioValue = Number(value || 0);
    if (currency === 'USD') {
      return `$ ${(nioValue / BCN_EXCHANGE_RATE).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `C$ ${nioValue.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const getInvoiceTicketFromDetail = (detail) => {
    if (!detail) return '';
    const packages = detail.packageAttachment?.packages || [];
    return (
      detail.invoiceNumber ||
      detail.invoiceData?.invoiceNumber ||
      detail.invoiceData?.number ||
      detail.invoices?.[0]?.invoiceNumber ||
      detail.invoices?.[0]?.number ||
      packages[0]?.invoiceNumber ||
      packages[0]?.invoiceKey ||
      ''
    );
  };

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

  const renderTasaCeroBadge = (tasaCero) => {
    if (!tasaCero?.isTasaCero) return null;

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.25rem',
          height: '22px',
          padding: '0 0.5rem',
          borderRadius: '6px',
          background: 'rgba(251, 191, 36, 0.14)',
          color: '#fbbf24',
          border: '1px solid rgba(251, 191, 36, 0.38)',
          fontSize: '0.68rem',
          fontWeight: 800,
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
        }}
        title={tasaCero.plazo ? `Tasa 0 a ${tasaCero.plazo} meses` : 'Tasa 0'}
      >
        <Tag size={12} style={{ flexShrink: 0 }} />
        Tasa 0{tasaCero.plazo ? ` - ${tasaCero.plazo} meses` : ''}
      </span>
    );
  };

  const getTasaCeroInfoFromDetail = (detail) => {
    const payments = detail?.paymentData?.transactions?.flatMap((tx) => tx.payments || []) || [];
    const installments = payments
      .map((payment) => Number(payment?.installments || payment?.installment || 0))
      .find((value) => Number.isFinite(value) && value > 1);

    if (!installments) {
      return { isTasaCero: false, plazo: null };
    }

    return {
      isTasaCero: true,
      plazo: installments,
    };
  };

  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        
        {/* 1. Header & Title para Escritorio (desktop-only: Intacto Original) */}
        <div className="desktop-only" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
              <ShoppingCart size={24} color="#34d399" />
              Órdenes
            </h1>
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

        {/* 2. Header & Title para Móvil (mobile-only: 1 Sola Línea sin Scroll) */}
        <div className="mobile-only" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', gap: '0.5rem' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
              <ShoppingCart size={20} color="#34d399" />
              Órdenes
            </h1>

            <button
              onClick={handleExportAllOrders}
              disabled={exportingAll}
              className="btn-secondary"
              style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', height: '30px', minHeight: '30px', borderColor: 'rgba(52, 211, 153, 0.4)', color: '#34d399', borderRadius: '7px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              <FileSpreadsheet size={12} className={exportingAll ? 'animate-spin' : ''} />
              {exportingAll ? 'Exportando...' : 'Descargar Órdenes'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', width: '100%' }}>
            <button
              onClick={handleActivateWebhook}
              disabled={registeringHook}
              className="btn-primary"
              style={{ flex: 1, padding: '0.25rem 0.45rem', fontSize: '0.7rem', height: '30px', minHeight: '30px', borderRadius: '7px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}
            >
              <Zap size={12} className={registeringHook ? 'animate-spin' : ''} />
              {registeringHook ? 'Activando...' : '⚡ Webhook VTEX'}
            </button>

            <button
              onClick={() => fetchOrders(paging.currentPage)}
              disabled={loading}
              className="btn-secondary"
              style={{ flex: 1, padding: '0.25rem 0.45rem', fontSize: '0.7rem', height: '30px', minHeight: '30px', borderRadius: '7px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Cargando...' : 'Actualizar'}
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

        {/* Date & Filter Bar - All in 1 Single Line */}
        <div className="glass-card" style={{ padding: '0.65rem 0.95rem', marginBottom: '1.25rem', position: 'relative', zIndex: 100, overflow: 'visible' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            
            {/* 1. Dropdown Selector de Preset */}
            <div ref={dropdownRef} style={{ position: 'relative', zIndex: 101, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.4rem',
                  width: '200px',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  height: '38px',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  <Calendar size={14} color="#38bdf8" style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Creado: <strong style={{ color: '#38bdf8' }}>{
                      presetOptions.find(p => p.id === selectedPreset)?.label || 'Personalizado'
                    }</strong>
                  </span>
                </div>
                <ChevronDown size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
              </button>

              {showRangeDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: '115%',
                    left: 0,
                    zIndex: 9999,
                    background: '#0f172a',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '12px',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.9), 0 0 25px rgba(56, 189, 248, 0.2)',
                    padding: '0.85rem 1rem',
                    width: '260px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {presetOptions.map((opt) => (
                      <label
                        key={opt.id}
                        onClick={() => handleSelectPreset(opt.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.65rem',
                          fontSize: '0.82rem',
                          color: selectedPreset === opt.id ? '#ffffff' : '#94a3b8',
                          cursor: 'pointer',
                          padding: '0.35rem 0.5rem',
                          borderRadius: '6px',
                          background: selectedPreset === opt.id ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                          fontWeight: selectedPreset === opt.id ? 700 : 500,
                        }}
                      >
                        <input
                          type="radio"
                          name="presetRadioOrders"
                          checked={selectedPreset === opt.id}
                          onChange={() => handleSelectPreset(opt.id)}
                          style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
                        />
                        {opt.label}
                      </label>
                    ))}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.6rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRangeDropdown(false);
                          fetchOrders(1);
                        }}
                        className="btn-primary"
                        style={{ padding: '0.35rem 1.1rem', fontSize: '0.78rem', backgroundColor: '#2563eb', borderRadius: '6px' }}
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Rango de Fechas (A: [startDate] a [endDate]) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(56, 189, 248, 0.08)', padding: '0.2rem 0.5rem', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)', height: '38px', flexShrink: 0, boxSizing: 'border-box' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', whiteSpace: 'nowrap' }}>🔵 A:</span>
              <input
                type="date"
                className="glass-input"
                style={{ width: '130px', fontSize: '0.78rem', padding: '0.2rem 0.3rem', border: 'none', background: 'transparent', color: '#ffffff', height: '100%' }}
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>a</span>
              <input
                type="date"
                className="glass-input"
                style={{ width: '130px', fontSize: '0.78rem', padding: '0.2rem 0.3rem', border: 'none', background: 'transparent', color: '#ffffff', height: '100%' }}
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
              />
            </div>

            {/* 3. Filtro por Estado */}
            <div style={{ flex: '1 1 140px', minWidth: '130px' }}>
              <select
                className="glass-input"
                style={{ width: '100%', fontSize: '0.82rem', height: '38px', padding: '0.35rem 0.75rem', lineHeight: '1.3', boxSizing: 'border-box' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos los Estados</option>
                <option value="ready-for-handling">Lista para preparar</option>
                <option value="handling">En preparación</option>
                <option value="invoiced">Facturada</option>
                <option value="canceled">Cancelada</option>
              </select>
            </div>

            {/* 4. Filtro por Tipo de Venta */}
            <div style={{ flex: '1 1 140px', minWidth: '130px' }}>
              <select
                className="glass-input"
                style={{ width: '100%', fontSize: '0.82rem', height: '38px', padding: '0.35rem 0.75rem', lineHeight: '1.3', boxSizing: 'border-box' }}
                value={saleTypeFilter}
                onChange={(e) => setSaleTypeFilter(e.target.value)}
              >
                <option value="">Todas las Ventas</option>
                <option value="social">Social Selling</option>
                <option value="organic">Venta Orgánica</option>
              </select>
            </div>

            {/* 5. Ordenar Por */}
            <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
              <select
                className="glass-input"
                style={{ width: '100%', fontSize: '0.82rem', height: '38px', padding: '0.35rem 0.75rem', lineHeight: '1.3', boxSizing: 'border-box' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date_desc">Más recientes</option>
                <option value="date_asc">Más antiguas</option>
                <option value="amount_desc">Mayor a menor</option>
                <option value="amount_asc">Menor a mayor</option>
              </select>
            </div>

            {/* 6. Buscador Multi-campo (a la par del botón Buscar) */}
            <div style={{ flex: '2 1 180px', minWidth: '160px', position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                className="glass-input"
                style={{ width: '100%', fontSize: '0.82rem', height: '38px', padding: '0.35rem 0.75rem', paddingRight: search ? '2.2rem' : '0.75rem', lineHeight: '1.3', boxSizing: 'border-box' }}
                placeholder="Buscar por ID, Cliente o SKU..."
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

            {/* 7. Botón Buscar */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                height: '38px',
                padding: '0 1.2rem',
                fontSize: '0.82rem',
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
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <Search size={14} />
              {loading ? 'Buscando...' : 'Buscar'}
            </button>

          </form>
        </div>

        {/* Metric Cards Summary - Alineación Uniforme & Z-Index Elevado */}
        <div className="orders-metrics-grid" style={{ marginBottom: '1.25rem', position: 'relative', zIndex: 50 }}>
          
          {/* Card 1: Total Órdenes */}
          <div className="glass-card orders-metric-simple" style={{ padding: '0.55rem 0.65rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '96px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>Total Órdenes</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '0.25rem', lineHeight: 1.1 }}>
              {totalOrdersCount.toLocaleString()}
            </div>
          </div>

          {/* Card 2: Facturadas (Invoiced) */}
          <div className="glass-card orders-metric-simple" style={{ padding: '0.55rem 0.65rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '96px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>Facturadas</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34d399', marginTop: '0.25rem', lineHeight: 1.1 }}>
              {invoicedCount.toLocaleString()}
            </div>
          </div>

          {/* Card 3: Lista para Preparar */}
          <div className="glass-card orders-metric-simple" style={{ padding: '0.55rem 0.65rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '96px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>Lista p/ Preparar</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.25rem', lineHeight: 1.1 }}>
              {readyCount.toLocaleString()}
            </div>
          </div>

          {/* Card 4: En Preparación */}
          <div className="glass-card orders-metric-simple" style={{ padding: '0.55rem 0.65rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '96px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>En Preparación</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.25rem', lineHeight: 1.1 }}>
              {handlingCount.toLocaleString()}
            </div>
          </div>

          {/* Card 5: Canceladas */}
          <div className="glass-card orders-metric-simple" style={{ padding: '0.55rem 0.65rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '96px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>Canceladas</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fb7185', marginTop: '0.25rem', lineHeight: 1.1 }}>
              {canceledCount.toLocaleString()}
            </div>
          </div>

          {/* Card 6: Ventas Facturadas */}
          <div className="glass-card mobile-full-span" style={{ padding: '0.7rem 0.95rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.95))', border: '1px solid rgba(52, 211, 153, 0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '132px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <DollarSign size={12} color="#34d399" /> Venta Facturada
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                <span style={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 600 }}>
                  {invoicedCount.toLocaleString()} ord.
                </span>
                <div style={{ display: 'inline-flex', padding: '2px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.85)' }}>
                  {['NIO', 'USD'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCurrency(mode)}
                      title={mode === 'NIO' ? 'Ver montos en córdobas' : `Ver montos en dólares a tasa BCN ${BCN_EXCHANGE_RATE}`}
                      style={{
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.12rem 0.35rem',
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        color: currency === mode ? '#ffffff' : '#94a3b8',
                        background: currency === mode ? (mode === 'NIO' ? '#059669' : '#2563eb') : 'transparent',
                        lineHeight: 1.2,
                      }}
                    >
                      {mode === 'NIO' ? 'C$' : '$'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '1.08rem', fontWeight: 800, color: '#e2e8f0', marginBottom: '0.4rem', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
              {formatMoney(invoicedRevenue)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700 }}>Social Selling</div>
                <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 800 }}>{formatMoney(socialSellingRevenue)}</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{socialSellingCount} ord. | {socialSellingPct}%</div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700 }}>Orgánica</div>
                <div style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 800 }}>{formatMoney(organicRevenue)}</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{organicCount} ord. | {organicPct}%</div>
              </div>
            </div>

            <div style={{ width: '100%', height: '5px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${socialSellingPct}%`, height: '100%', background: '#34d399', transition: 'width 0.5s ease' }} title={`Social Selling: ${socialSellingPct}%`} />
              <div style={{ width: `${organicPct}%`, height: '100%', background: '#38bdf8', transition: 'width 0.5s ease' }} title={`Orgánica: ${organicPct}%`} />
            </div>
          </div>

          {/* Card 7: Tipo de Entrega (Pickup vs Delivery) */}
          <div className="glass-card mobile-full-span" style={{ padding: '0.65rem 0.85rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.95))', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '115px' }}>
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

          {/* Card 8: Top Tiendas Pickup (Superpuesta con Z-Index Máximo) */}
          <div className="glass-card mobile-full-span" style={{ padding: '0.65rem 0.85rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.98))', border: '1px solid rgba(129, 140, 248, 0.35)', position: 'relative', zIndex: 100, minHeight: '115px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
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

        {/* Orders Table & Cards Container con Z-Index Bajo */}
        <div className="glass-card" style={{ padding: '1.25rem', position: 'relative', zIndex: 1 }}>
          
          {/* 1. Vista de Tabla para Escritorio (≥769px) */}
          <div className="desktop-only" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '12px', border: '1px solid var(--border-subtle)', width: '100%' }}>
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
                    const tasaCeroInfo = order.tasaCero?.isTasaCero ? order.tasaCero : getTasaCeroInfoFromDetail(detail);

                    return (
                      <Fragment key={order.orderId}>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: isExpanded ? 'rgba(56, 189, 248, 0.04)' : 'transparent' }}>
                          <td style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>
                            <button
                              onClick={() => toggleExpandOrder(order.orderId)}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </td>
                          <td style={{ padding: '0.55rem 0.6rem', color: '#ffffff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                {order.orderId}
                              </span>
                              {renderTasaCeroBadge(tasaCeroInfo)}
                            </div>
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
                                    const invoiceTicket = order.invoiceTicket || getInvoiceTicketFromDetail(detail);

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

                                        {/* Card 3: Ticket de factura física */}
                                        <div style={{ background: 'rgba(15, 23, 42, 0.85)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(251, 191, 36, 0.25)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                          <span style={{ fontSize: '0.7rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <FileText size={13} color="#fbbf24" /> Ticket Factura Física
                                          </span>
                                          {invoiceTicket ? (
                                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', marginTop: '0.1rem', fontFamily: 'var(--font-mono)' }}>
                                              Factura #{invoiceTicket}
                                            </div>
                                          ) : (
                                            <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                                              Sin ticket registrado en OMS
                                            </div>
                                          )}
                                        </div>

                                        {/* Card 4: Campaña Marketing / UTM & Cupones */}
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
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 2. Vista de Tarjetas Táctiles para Móvil (≤768px) */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {loading && orders.length === 0 ? (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: 'var(--accent-primary)' }} />
                Consultando órdenes en VTEX OMS...
              </div>
            ) : orders.length === 0 ? (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Package size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
                <p style={{ fontWeight: 500, color: 'var(--text-main)' }}>No se encontraron órdenes en el rango seleccionado</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Prueba ampliando el rango de fechas.</p>
              </div>
            ) : (
              orders.map((order) => {
                const isExpanded = expandedOrderId === order.orderId;
                const detail = orderDetails[order.orderId];
                const formattedDate = order.creationDate
                  ? new Date(order.creationDate).toLocaleString('es-NI', { dateStyle: 'short', timeStyle: 'short' })
                  : '-';

                const totalFormatted = (order.totalValue ? order.totalValue / 100 : 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const tasaCeroInfo = order.tasaCero?.isTasaCero ? order.tasaCero : getTasaCeroInfoFromDetail(detail);

                return (
                  <div
                    key={order.orderId}
                    style={{
                      backgroundColor: isExpanded ? 'rgba(56, 189, 248, 0.08)' : 'rgba(30, 41, 59, 0.6)',
                      border: `1px solid ${isExpanded ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
                      borderRadius: '14px',
                      padding: '0.95rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.25)',
                    }}
                  >
                    {/* Header Card Móvil: ID Orden + Badge Tasa 0 + Estado OMS */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.92rem', color: '#ffffff' }}>
                          #{order.orderId}
                        </span>
                        {renderTasaCeroBadge(tasaCeroInfo)}
                      </div>
                      {renderStatusBadge(order.status, order.statusDescription)}
                    </div>

                    {/* Fila 2: Fecha de Creación & Nombre del Cliente */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                      <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Calendar size={12} color="#64748b" /> {formattedDate}
                      </span>
                      <span style={{ color: '#ffffff', fontWeight: 600, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        👤 {order.clientName || 'Cliente General'}
                      </span>
                    </div>

                    {/* Fila 3: Caja Destacada de Total C$ + Método de Entrega */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.35)', padding: '0.65rem 0.85rem', borderRadius: '10px', gap: '0.5rem' }}>
                      <div>
                        <span style={{ fontSize: '0.66rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>TOTAL ORDEN</span>
                        <strong style={{ fontSize: '1.05rem', color: '#10b981', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                          C$ {totalFormatted}
                        </strong>
                      </div>

                      <div>
                        {order.fulfillmentType === 'pickup' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.25rem 0.55rem',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: 'rgba(56, 189, 248, 0.15)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              maxWidth: '150px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={order.pickupStore ? `Tienda: ${order.pickupStore}` : 'Retiro en Tienda'}
                          >
                            <Store size={12} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {order.pickupStore ? `Pickup (${order.pickupStore})` : 'Pickup Store'}
                            </span>
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.25rem 0.55rem',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: 'rgba(52, 211, 153, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(52, 211, 153, 0.3)',
                            }}
                          >
                            <Truck size={12} style={{ flexShrink: 0 }} />
                            <span>Delivery</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Botón Ver/Ocultar Detalle */}
                    <button
                      onClick={() => toggleExpandOrder(order.orderId)}
                      className="btn-secondary"
                      style={{
                        width: '100%',
                        padding: '0.45rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        backgroundColor: isExpanded ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        color: isExpanded ? '#38bdf8' : '#e2e8f0',
                        border: `1px solid ${isExpanded ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                      }}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {isExpanded ? 'Ocultar Items & Detalle' : 'Ver Items, SKUs & Dirección'}
                    </button>

                    {/* Detalle Expandido en Móvil */}
                    {isExpanded && (
                      <div style={{ marginTop: '0.4rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                        {loadingDetailId === order.orderId ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            <RefreshCw size={14} className="animate-spin" color="var(--accent-primary)" />
                            Cargando items de la orden #{order.orderId}...
                          </div>
                        ) : detail ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            {/* Información de Dirección y Destinatario */}
                            {(() => {
                              const addr = detail.shippingData?.address || {};
                              const receiverName = addr.receiverName || order.clientName || 'Cliente General';
                              const fullAddressParts = [addr.street, addr.number, addr.neighborhood, addr.city, addr.state].filter(Boolean);
                              const fullAddress = fullAddressParts.length > 0 ? fullAddressParts.join(', ') : 'Dirección no especificada';

                              return (
                                <div style={{ background: 'rgba(15, 23, 42, 0.85)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '0.76rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                  <span style={{ color: '#38bdf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <MapPin size={12} /> Destinatario & Entrega
                                  </span>
                                  <div style={{ color: '#ffffff', fontWeight: 700 }}>👤 {receiverName}</div>
                                  <div style={{ color: '#94a3b8' }}>📍 {fullAddress}</div>
                                </div>
                              );
                            })()}

                            {/* Lista de Items/SKUs de la orden */}
                            {detail.items && detail.items.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                                  📦 Productos en la Orden ({detail.items.length})
                                </span>
                                {detail.items.map((item, idx) => {
                                  const sellingP = (item.sellingPrice || item.price ? (item.sellingPrice || item.price) / 100 : 0);
                                  const quantity = item.quantity || 1;
                                  const totalItemVal = sellingP * quantity;

                                  return (
                                    <div key={idx} style={{ background: 'rgba(15, 23, 42, 0.9)', padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffffff', flex: 1 }}>
                                          {item.name || item.skuName || 'Producto SINSA'}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '6px', background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', fontWeight: 700, flexShrink: 0 }}>
                                          {quantity} unid.
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', marginTop: '0.2rem' }}>
                                        <span style={{ color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>SKU: {item.id || item.sellerSku}</span>
                                        <strong style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>C$ {totalItemVal.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</strong>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>No se pudo obtener el detalle de items.</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
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
