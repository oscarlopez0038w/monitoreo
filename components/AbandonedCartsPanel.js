'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  ShoppingBag,
  Users,
  DollarSign,
  TrendingDown,
  RefreshCw,
  Download,
  Search,
  Filter,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpDown,
  Tag,
  Package,
  Phone,
  Mail,
  User,
  MessageCircle,
  X,
  Info,
  SlidersHorizontal,
  Flame,
  ArrowRight,
  Truck,
  CreditCard,
  UserCheck,
  ShieldCheck,
  CheckCheck,
  FileText,
  Building2,
  Sparkles,
} from 'lucide-react';
import { formatNicaraguaDateTime } from '@/lib/dateUtils';

const BCN_EXCHANGE_RATE = 36.6243; // Tasa oficial BCN NIO a USD

export default function AbandonedCartsPanel() {
  // Datos y estados principales
  const [carts, setCarts] = useState([]);
  const [stats, setStats] = useState(null);
  const [stages, setStages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalValue: 0,
    avgValue: 0,
    count: 0,
    convertedCount: 0,
    convertedTotalValue: 0,
  });

  // Moneda: 'NIO' (C$) o 'USD' ($)
  const [currency, setCurrency] = useState('NIO');

  // Filtros principales
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState('today'); // 'today', '24h', '7d', '30d', 'all'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [inputStartDate, setInputStartDate] = useState('');
  const [inputEndDate, setInputEndDate] = useState('');
  const [minValueFilter, setMinValueFilter] = useState(0);
  const [sortBy, setSortBy] = useState('time_desc'); // 'time_desc', 'time_asc', 'value_desc', 'value_asc', 'items_desc'
  const [stageFilter, setStageFilter] = useState('all'); // 'all', 'cart', 'profile', 'shipping', 'payment', 'converted'
  const [excludePurchased, setExcludePurchased] = useState(true);

  // Estados de envío de correo
  const [sendingEmailClientId, setSendingEmailClientId] = useState(null);
  const [sentEmailStatus, setSentEmailStatus] = useState({});

  // Paginación
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });

  // UI interactiva: Carts expandidos, Toasts y Modales
  const [expandedCarts, setExpandedCarts] = useState(new Set());
  const [copiedKey, setCopiedKey] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [selectedClientModal, setSelectedClientModal] = useState(null);
  const [loadingClientDetail, setLoadingClientDetail] = useState(false);

  // Debounce para el input de búsqueda (400ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Cargar estadísticas generales de Master Data CL
  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/masterdata?action=stats');
      const data = await res.json();
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error cargando stats de Master Data:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Cargar carritos abandonados con filtrado riguroso y cruce OMS
  const loadAbandonedCarts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        action: 'abandoned-carts',
        page: String(page),
        pageSize: String(pageSize),
        period: periodFilter,
        minValue: String(minValueFilter),
        sortBy,
        excludePurchased: String(excludePurchased),
        stage: stageFilter,
      });

      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }
      if (startDate) {
        params.append('startDate', startDate);
      }
      if (endDate) {
        params.append('endDate', endDate);
      }

      const res = await fetch(`/api/masterdata?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setCarts(data.carts || []);
        setPagination(data.pagination || { page: 1, pageSize: 15, total: 0, totalPages: 1 });
        setSummary(data.summary || { totalValue: 0, avgValue: 0, count: 0, convertedCount: 0, convertedTotalValue: 0 });
        if (data.stages) {
          setStages(data.stages);
        }
      } else {
        showToast('error', data.error || 'Error al obtener carritos abandonados.');
      }
    } catch (err) {
      console.error('Error cargando carritos abandonados:', err);
      showToast('error', 'Error de conexión con el servidor VTEX.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, periodFilter, startDate, endDate, minValueFilter, sortBy, debouncedSearch, excludePurchased, stageFilter]);

  // Cargas automáticas al montar y al cambiar filtros
  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadAbandonedCarts();
  }, [loadAbandonedCarts]);

  // Disparar toast feedback
  const showToast = (type, message) => {
    setToastMessage({ type, message });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Copiar al portapapeles con confirmación visual
  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('success', 'Copiado al portapapeles');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Aplicar filtro manual de rango de fechas con validación
  const handleApplyDateRange = () => {
    if (!inputStartDate && !inputEndDate) {
      showToast('info', 'Por favor selecciona al menos una fecha (Desde o Hasta).');
      return;
    }

    let finalStart = inputStartDate;
    let finalEnd = inputEndDate;

    if (finalStart && !finalEnd) {
      finalEnd = finalStart;
      setInputEndDate(finalStart);
    } else if (!finalStart && finalEnd) {
      finalStart = finalEnd;
      setInputStartDate(finalEnd);
    }

    setPeriodFilter('custom');
    setStartDate(finalStart);
    setEndDate(finalEnd);
    setPage(1);
    showToast('success', `Filtrando carritos del ${finalStart} al ${finalEnd}`);
  };

  // Limpiar rango de fechas y volver a carritos de hoy
  const handleClearDateRange = () => {
    setInputStartDate('');
    setInputEndDate('');
    setStartDate('');
    setEndDate('');
    setPeriodFilter('today');
    setPage(1);
  };

  // Expandir / colapsar un carrito individual
  const toggleExpand = (clientId) => {
    const next = new Set(expandedCarts);
    if (next.has(clientId)) {
      next.delete(clientId);
    } else {
      next.add(clientId);
    }
    setExpandedCarts(next);
  };

  // Expandir / colapsar todos los carritos visibles
  const toggleExpandAll = () => {
    if (expandedCarts.size === carts.length) {
      setExpandedCarts(new Set());
    } else {
      setExpandedCarts(new Set(carts.map((c) => c.clientId)));
    }
  };

  // Ver ficha completa del cliente en Master Data CL
  const handleOpenClientDetail = async (clientId) => {
    setLoadingClientDetail(true);
    setSelectedClientModal({ id: clientId, loading: true });
    try {
      const res = await fetch(`/api/masterdata?action=client-detail&id=${encodeURIComponent(clientId)}`);
      const data = await res.json();
      if (data.success && data.client) {
        setSelectedClientModal(data.client);
      } else {
        showToast('error', 'No se pudo cargar la información detallada del cliente.');
        setSelectedClientModal(null);
      }
    } catch (e) {
      showToast('error', 'Error consultando cliente.');
      setSelectedClientModal(null);
    } finally {
      setLoadingClientDetail(false);
    }
  };

  // Enviar correo de recuperación de carrito abandonado a través del endpoint VTEX
  const handleSendEmail = async (cart) => {
    if (!cart?.email) {
      showToast('error', 'El cliente no posee un correo electrónico registrado.');
      return;
    }

    setSendingEmailClientId(cart.clientId);
    try {
      const res = await fetch('/api/masterdata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-abandoned-cart-email',
          email: cart.email,
          rclastcart: cart.rclastcart || cart.recoveryUrl || '',
          firstName: cart.firstName || '',
          lastName: cart.lastName || '',
          clientId: cart.clientId,
          cartValue: cart.estimatedValue || 0,
          currency: cart.currency || 'NIO',
          stage: cart.stage || 'cart',
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast('success', `¡Correo enviado exitosamente a ${cart.email}!`);
        setSentEmailStatus((prev) => ({
          ...prev,
          [cart.clientId]: {
            sentAt: data.sentAt || new Date().toISOString(),
            sentBy: 'Tú',
            vtexStatus: 200,
          },
        }));
      } else {
        showToast('error', data.error || 'Error al enviar el correo a través de VTEX.');
      }
    } catch (err) {
      console.error('Error al enviar correo de recuperación:', err);
      showToast('error', 'Error de conexión al procesar el envío de correo.');
    } finally {
      setSendingEmailClientId(null);
    }
  };

  // Formateador de moneda dinámico
  const formatMoney = (valNio) => {
    const num = parseFloat(valNio) || 0;
    if (currency === 'USD') {
      const inUsd = num / BCN_EXCHANGE_RATE;
      return `$ ${inUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `C$ ${num.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Formateador de tiempo transcurrido amigable
  const formatElapsed = (minutes) => {
    const m = parseInt(minutes, 10) || 0;
    if (m < 1) return 'Hace un momento';
    if (m < 60) return `Hace ${m} min`;
    const hours = Math.floor(m / 60);
    const remM = m % 60;
    if (hours < 24) {
      return remM > 0 ? `Hace ${hours}h ${remM}m` : `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
    }
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return remH > 0 ? `Hace ${days}d ${remH}h` : `Hace ${days} día${days > 1 ? 's' : ''}`;
  };

  // Exportar reporte completo de Carritos Abandonados a Excel
  const handleExportExcel = () => {
    if (carts.length === 0) {
      showToast('error', 'No hay carritos para exportar en la vista actual.');
      return;
    }

    try {
      const rows = [];
      carts.forEach((cart, cartIdx) => {
        const clientName = `${cart.firstName || ''} ${cart.lastName || ''}`.trim() || 'Prospecto Web';
        const formattedDate = formatNicaraguaDateTime(cart.lastSessionDate);
        const valNio = cart.estimatedValue;
        const valUsd = Math.round((valNio / BCN_EXCHANGE_RATE) * 100) / 100;

        if (cart.items && cart.items.length > 0) {
          cart.items.forEach((item, itemIdx) => {
            rows.push({
              '# Carrito': cartIdx + 1,
              'ID Cliente VTEX': cart.clientId,
              'Nombre Cliente': clientName,
              'Origen del Nombre': cart.nameProvenance || 'N/A',
              'Correo Electrónico': cart.email || 'N/A',
              'Teléfono': cart.phone || 'N/A',
              'Documento / Cédula': cart.document || 'N/A',
              'Empresa / Razón Social': cart.corporateName || 'N/A',
              'Etapa de Abandono': cart.stageTitle || 'N/A',
              'Diagnóstico de Abandono': cart.stageDescription || 'N/A',
              '¿Compró Posteriormente?': cart.isConverted ? `Sí (Orden ${cart.convertedOrder?.orderId || ''})` : 'No (Abandono Real)',
              'Fecha Última Sesión': formattedDate,
              'Tiempo Transcurrido': formatElapsed(cart.abandonedMinutesAgo),
              'Nivel de Urgencia': cart.urgencyLabel,
              'Valor Total Carrito (C$)': valNio,
              'Valor Total Carrito (USD)': valUsd,
              'Total Items en Carrito': cart.itemsCount,
              'Item #': itemIdx + 1,
              'SKU ID': item.skuId,
              'Nombre Producto': item.name,
              'Marca': item.brand || 'N/A',
              'Categoría': item.category || 'N/A',
              'Cantidad': item.quantity,
              'Precio Unitario (C$)': item.unitPrice,
              'Subtotal Item (C$)': item.totalPrice,
              'URL Recuperación Carrito': cart.recoveryUrl,
            });
          });
        } else {
          rows.push({
            '# Carrito': cartIdx + 1,
            'ID Cliente VTEX': cart.clientId,
            'Nombre Cliente': clientName,
            'Origen del Nombre': cart.nameProvenance || 'N/A',
            'Correo Electrónico': cart.email || 'N/A',
            'Teléfono': cart.phone || 'N/A',
            'Documento / Cédula': cart.document || 'N/A',
            'Empresa / Razón Social': cart.corporateName || 'N/A',
            'Etapa de Abandono': cart.stageTitle || 'N/A',
            'Diagnóstico de Abandono': cart.stageDescription || 'N/A',
            '¿Compró Posteriormente?': cart.isConverted ? `Sí` : 'No',
            'Fecha Última Sesión': formattedDate,
            'Tiempo Transcurrido': formatElapsed(cart.abandonedMinutesAgo),
            'Nivel de Urgencia': cart.urgencyLabel,
            'Valor Total Carrito (C$)': valNio,
            'Valor Total Carrito (USD)': valUsd,
            'Total Items en Carrito': cart.itemsCount,
            'Item #': 1,
            'SKU ID': 'N/A',
            'Nombre Producto': 'Sin detalle',
            'Marca': 'N/A',
            'Categoría': 'N/A',
            'Cantidad': cart.itemsCount || 1,
            'Precio Unitario (C$)': valNio,
            'Subtotal Item (C$)': valNio,
            'URL Recuperación Carrito': cart.recoveryUrl,
          });
        }
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Carritos Abandonados');

      worksheet['!cols'] = [
        { wch: 10 },
        { wch: 38 },
        { wch: 25 },
        { wch: 18 },
        { wch: 30 },
        { wch: 16 },
        { wch: 18 },
        { wch: 25 },
        { wch: 26 },
        { wch: 45 },
        { wch: 22 },
        { wch: 22 },
        { wch: 18 },
        { wch: 24 },
        { wch: 20 },
        { wch: 20 },
        { wch: 14 },
        { wch: 8 },
        { wch: 14 },
        { wch: 40 },
        { wch: 16 },
        { wch: 30 },
        { wch: 10 },
        { wch: 16 },
        { wch: 16 },
        { wch: 55 },
      ];

      const fileName = `VTEX_Carritos_Abandonados_Auditoria_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      showToast('success', `Exportación completada: ${fileName}`);
    } catch (e) {
      console.error('Error exportando Excel:', e);
      showToast('error', 'Error al generar el archivo Excel.');
    }
  };

  // Preparar mensaje de WhatsApp para recuperación directa
  const generateWhatsAppLink = (cart) => {
    const rawPhone = (cart.phone || '').replace(/\D/g, '');
    if (!rawPhone) return null;
    let cleanPhone = rawPhone;
    if (cleanPhone.length === 8) {
      cleanPhone = `505${cleanPhone}`;
    }
    const clientName = cart.firstName ? ` ${cart.firstName}` : '';
    const msg = `¡Hola${clientName}! Notamos que dejaste productos en tu carrito de compras en SINSA. Puedes recuperarlos y completar tu pedido de forma fácil y segura haciendo clic aquí: ${cart.recoveryUrl}`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', width: '100%', maxWidth: '1600px', margin: '0 auto', paddingBottom: '3rem' }}>
      
      {/* Toast flotante */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '0.85rem 1.35rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            background: toastMessage.type === 'error' ? 'rgba(239, 68, 68, 0.92)' : 'rgba(16, 185, 129, 0.92)',
            color: '#fff',
            animation: 'fadeIn 0.25s ease-out',
          }}
        >
          {toastMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toastMessage.message}</span>
        </div>
      )}

      {/* 1. Header principal del módulo */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.25rem',
          padding: '1.5rem 1.75rem',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.85) 100%)',
          borderRadius: '18px',
          border: '1px solid rgba(244, 63, 94, 0.25)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.25) 0%, rgba(225, 29, 72, 0.15) 100%)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fb7185',
              boxShadow: '0 0 20px rgba(244, 63, 94, 0.2)',
            }}
          >
            <ShoppingBag size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                Master Data — Carritos Abandonados
              </h1>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '999px',
                  background: 'rgba(244, 63, 94, 0.18)',
                  color: '#fb7185',
                  border: '1px solid rgba(244, 63, 94, 0.35)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                CL Entity Monitor & Auditoría OMS
              </span>
            </div>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.88rem', color: 'var(--text-dim, #94a3b8)' }}>
              Monitoreo riguroso de carritos pendientes con cruce de órdenes OMS para descartar compras realizadas y análisis de etapas de fuga.
            </p>
          </div>
        </div>

        {/* Acciones del Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Selector de moneda C$ / USD */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(15, 23, 42, 0.7)',
              padding: '3px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <button
              onClick={() => setCurrency('NIO')}
              style={{
                background: currency === 'NIO' ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'transparent',
                color: currency === 'NIO' ? '#fff' : '#94a3b8',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '7px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              C$ NIO
            </button>
            <button
              onClick={() => setCurrency('USD')}
              style={{
                background: currency === 'USD' ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'transparent',
                color: currency === 'USD' ? '#fff' : '#94a3b8',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '7px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              $ USD
            </button>
          </div>

          {/* Botón Exportar a Excel */}
          <button
            onClick={handleExportExcel}
            disabled={loading || carts.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.15rem',
              borderRadius: '11px',
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: '#fff',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: loading || carts.length === 0 ? 'not-allowed' : 'pointer',
              opacity: loading || carts.length === 0 ? 0.6 : 1,
              boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            <Download size={16} />
            <span>Exportar Excel</span>
          </button>

          {/* Botón Actualizar */}
          <button
            onClick={() => {
              loadStats();
              loadAbandonedCarts(true);
            }}
            disabled={loading || refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.15rem',
              borderRadius: '11px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#fff',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: loading || refreshing ? 'not-allowed' : 'pointer',
              opacity: loading || refreshing ? 0.6 : 1,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span>{refreshing ? 'Actualizando...' : 'Actualizar'}</span>
          </button>
        </div>
      </div>

      {/* 2. Grid de KPI Cards (4 Columnas) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.15rem',
        }}
      >
        {/* Card 1: Total Clientes CL */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '16px',
            padding: '1.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Clientes Master Data (CL)
            </span>
            <div style={{ padding: '0.45rem', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              <Users size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
            {statsLoading ? '...' : (stats?.totalClients ? stats.totalClients.toLocaleString() : '8,685')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.78rem', color: '#64748b' }}>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>
              +{stats?.active24h || 0} activos hoy
            </span>
            <span>•</span>
            <span>{stats?.active7d || 0} en los últimos 7 días</span>
          </div>
        </div>

        {/* Card 2: Carritos Abandonados Reales */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '16px',
            padding: '1.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            boxShadow: '0 4px 20px rgba(244, 63, 94, 0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Carritos Abandonados Reales
            </span>
            <div style={{ padding: '0.45rem', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f43f5e', animation: 'pulse 1.5s infinite' }} />
              <ShoppingBag size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fb7185', letterSpacing: '-0.03em' }}>
            {loading ? '...' : pagination.total.toLocaleString()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#94a3b8' }}>
            <Flame size={14} color="#f43f5e" />
            <span>Excluyendo compras concretadas</span>
          </div>
        </div>

        {/* Card 3: Valor Total Perdido en Carritos */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '16px',
            padding: '1.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            boxShadow: '0 4px 20px rgba(251, 191, 36, 0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Valor Total en Carritos
            </span>
            <div style={{ padding: '0.45rem', borderRadius: '10px', background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}>
              <DollarSign size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '-0.03em' }}>
            {loading ? '...' : formatMoney(summary.totalValue)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#94a3b8' }}>
            <span>Ticket Promedio:</span>
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>
              {loading ? '...' : formatMoney(summary.avgValue)}
            </span>
          </div>
        </div>

        {/* Card 4: Compras Cruzadas Excluidas (Conversión OMS) */}
        <div
          onClick={() => {
            if (stageFilter === 'converted') {
              setStageFilter('all');
              setExcludePurchased(true);
            } else {
              setStageFilter('converted');
              setExcludePurchased(false);
            }
            setPage(1);
          }}
          title="Haz clic para ver o alternar las compras concretadas rescatadas"
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: stageFilter === 'converted' ? '2px solid #10b981' : '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '16px',
            padding: '1.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: stageFilter === 'converted' ? '0 0 16px rgba(16, 185, 129, 0.3)' : '0 4px 20px rgba(16, 185, 129, 0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Compras OMS Concretadas
            </span>
            <div style={{ padding: '0.45rem', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <ShieldCheck size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#34d399', letterSpacing: '-0.03em' }}>
            {loading ? '...' : (summary.convertedCount || 0).toLocaleString()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#94a3b8' }}>
            <span>Facturado rescatado:</span>
            <span style={{ color: '#34d399', fontWeight: 700 }}>
              {loading ? '...' : formatMoney(summary.convertedTotalValue || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. SECCIÓN DE ETAPAS DE ABANDONO (STAGE DROP-OFF CARDS) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <SlidersHorizontal size={18} color="#38bdf8" />
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
              ¿En qué etapa se están perdiendo las compras? (Funnel de Fuga)
            </h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Haz clic en cualquier etapa para filtrar los carritos instantáneamente
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
          }}
        >
          {/* Etapa 1: Carrito / Selección Inicial */}
          <div
            onClick={() => {
              setStageFilter(stageFilter === 'cart' ? 'all' : 'cart');
              setPage(1);
            }}
            style={{
              padding: '1.15rem',
              borderRadius: '14px',
              background: stageFilter === 'cart' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(30, 41, 59, 0.5)',
              border: stageFilter === 'cart' ? '2px solid #6366f1' : '1px solid rgba(99, 102, 241, 0.25)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              boxShadow: stageFilter === 'cart' ? '0 0 16px rgba(99, 102, 241, 0.3)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase' }}>
                Etapa 1: Carrito / Selección
              </span>
              <div style={{ padding: '0.35rem', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' }}>
                <ShoppingBag size={16} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>
                {stages?.cart?.count || 0}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#818cf8', fontWeight: 600 }}>
                ({stages?.cart?.pct || 0}%)
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 700 }}>
              {formatMoney(stages?.cart?.totalValue || 0)}
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.3' }}>
              Solo ingresó correo electrónico; rebotó antes de registrar datos personales o nombre.
            </p>
          </div>

          {/* Etapa 2: Identificación / Perfil */}
          <div
            onClick={() => {
              setStageFilter(stageFilter === 'profile' ? 'all' : 'profile');
              setPage(1);
            }}
            style={{
              padding: '1.15rem',
              borderRadius: '14px',
              background: stageFilter === 'profile' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(30, 41, 59, 0.5)',
              border: stageFilter === 'profile' ? '2px solid #0ea5e9' : '1px solid rgba(14, 165, 233, 0.25)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              boxShadow: stageFilter === 'profile' ? '0 0 16px rgba(14, 165, 233, 0.3)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                Etapa 2: Identificación / Perfil
              </span>
              <div style={{ padding: '0.35rem', borderRadius: '8px', background: 'rgba(14, 165, 233, 0.2)', color: '#38bdf8' }}>
                <UserCheck size={16} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>
                {stages?.profile?.count || 0}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>
                ({stages?.profile?.pct || 0}%)
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 700 }}>
              {formatMoney(stages?.profile?.totalValue || 0)}
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.3' }}>
              Completó su nombre pero no continuó a calcular o seleccionar método de entrega.
            </p>
          </div>

          {/* Etapa 3: Envío / Retiro en Tienda */}
          <div
            onClick={() => {
              setStageFilter(stageFilter === 'shipping' ? 'all' : 'shipping');
              setPage(1);
            }}
            style={{
              padding: '1.15rem',
              borderRadius: '14px',
              background: stageFilter === 'shipping' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(30, 41, 59, 0.5)',
              border: stageFilter === 'shipping' ? '2px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.25)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              boxShadow: stageFilter === 'shipping' ? '0 0 16px rgba(245, 158, 11, 0.3)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>
                Etapa 3: Envío / Retiro
              </span>
              <div style={{ padding: '0.35rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' }}>
                <Truck size={16} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>
                {stages?.shipping?.count || 0}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 600 }}>
                ({stages?.shipping?.pct || 0}%)
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 700 }}>
              {formatMoney(stages?.shipping?.totalValue || 0)}
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.3' }}>
              Ingresó datos de contacto/cédula o dirección, pero no procedió a la pasarela de pago.
            </p>
          </div>

          {/* Etapa 4: Pasarela de Pago / Pago Declinado */}
          <div
            onClick={() => {
              setStageFilter(stageFilter === 'payment' ? 'all' : 'payment');
              setPage(1);
            }}
            style={{
              padding: '1.15rem',
              borderRadius: '14px',
              background: stageFilter === 'payment' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(30, 41, 59, 0.5)',
              border: stageFilter === 'payment' ? '2px solid #f43f5e' : '1px solid rgba(244, 63, 94, 0.25)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              boxShadow: stageFilter === 'payment' ? '0 0 16px rgba(244, 63, 94, 0.3)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fb7185', textTransform: 'uppercase' }}>
                Etapa 4: Pasarela de Pago
              </span>
              <div style={{ padding: '0.35rem', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.2)', color: '#fb7185' }}>
                <CreditCard size={16} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>
                {stages?.payment?.count || 0}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#fb7185', fontWeight: 600 }}>
                ({stages?.payment?.pct || 0}%)
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 700 }}>
              {formatMoney(stages?.payment?.totalValue || 0)}
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.3' }}>
              Llegó al pago final pero la transacción con el banco/tarjeta fue declinada o cancelada.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Barra de Filtros y Búsqueda */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '1.15rem 1.35rem',
          background: 'rgba(30, 41, 59, 0.5)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Buscador de texto */}
        <div style={{ position: 'relative', minWidth: '320px', flex: '1 1 320px' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#64748b',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por correo, nombre, teléfono, cédula o SKU ID..."
            style={{
              width: '100%',
              padding: '0.7rem 2.4rem 0.7rem 2.6rem',
              borderRadius: '11px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(15, 23, 42, 0.75)',
              color: '#fff',
              fontSize: '0.88rem',
              outline: 'none',
              transition: 'border 0.2s ease',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Controles de Filtros */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          
          {/* Toggle: Excluir compras ya realizadas */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.82rem',
              color: excludePurchased ? '#34d399' : '#94a3b8',
              fontWeight: 600,
              cursor: 'pointer',
              background: excludePurchased ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              padding: '0.55rem 0.85rem',
              borderRadius: '10px',
              border: `1px solid ${excludePurchased ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
            }}
          >
            <input
              type="checkbox"
              checked={excludePurchased}
              onChange={(e) => {
                setExcludePurchased(e.target.checked);
                setPage(1);
              }}
              style={{ cursor: 'pointer' }}
            />
            <span>Excluir compras realizadas</span>
          </label>

          {/* Filtro por Etapa */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <SlidersHorizontal size={15} color="#94a3b8" />
            <select
              value={stageFilter}
              onChange={(e) => {
                setStageFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '10px',
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '0.84rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">Todas las Etapas</option>
              <option value="cart">1. Carrito / Selección</option>
              <option value="profile">2. Identificación / Perfil</option>
              <option value="shipping">3. Envío / Retiro</option>
              <option value="payment">4. Pasarela de Pago</option>
              <option value="converted">Solo Compras Concretadas</option>
            </select>
          </div>

          {/* Período Predefinido */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Calendar size={15} color="#94a3b8" />
            <select
              value={periodFilter}
              onChange={(e) => {
                const val = e.target.value;
                setPeriodFilter(val);
                if (val !== 'custom') {
                  setInputStartDate('');
                  setInputEndDate('');
                  setStartDate('');
                  setEndDate('');
                }
                setPage(1);
              }}
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '10px',
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '0.84rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="today">Hoy (Día actual)</option>
              <option value="24h">Últimas 24 Horas</option>
              <option value="7d">Últimos 7 Días</option>
              <option value="30d">Últimos 30 Días</option>
              <option value="all">Todo el Historial</option>
              {periodFilter === 'custom' && <option value="custom" disabled hidden>Personalizado</option>}
            </select>
          </div>

          {/* Rango de Fechas Específico (Desde / Hasta) con Botón Buscar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.65rem',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.85)',
              border: (startDate || endDate) ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Desde:</span>
            <input
              type="date"
              value={inputStartDate}
              onChange={(e) => setInputStartDate(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyDateRange()}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Hasta:</span>
            <input
              type="date"
              value={inputEndDate}
              onChange={(e) => setInputEndDate(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyDateRange()}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            />

            {/* Botón Buscar / Aplicar */}
            <button
              onClick={handleApplyDateRange}
              disabled={!inputStartDate && !inputEndDate}
              title="Buscar carritos en este rango de fechas"
              style={{
                background: (inputStartDate || inputEndDate) ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'rgba(255, 255, 255, 0.08)',
                color: (inputStartDate || inputEndDate) ? '#fff' : '#64748b',
                border: 'none',
                padding: '0.35rem 0.65rem',
                borderRadius: '7px',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: (inputStartDate || inputEndDate) ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease',
              }}
            >
              <Search size={12} />
              <span>Buscar</span>
            </button>

            {(inputStartDate || inputEndDate || startDate || endDate) && (
              <button
                onClick={handleClearDateRange}
                title="Limpiar fechas y volver a hoy"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fb7185',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Valor Mínimo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <DollarSign size={15} color="#94a3b8" />
            <select
              value={minValueFilter}
              onChange={(e) => {
                setMinValueFilter(parseFloat(e.target.value) || 0);
                setPage(1);
              }}
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '10px',
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '0.84rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="0">Cualquier Monto</option>
              <option value="1000">&gt; C$ 1,000</option>
              <option value="5000">&gt; C$ 5,000</option>
              <option value="10000">&gt; C$ 10,000</option>
              <option value="25000">&gt; C$ 25,000</option>
            </select>
          </div>

          {/* Ordenar Por */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <ArrowUpDown size={15} color="#94a3b8" />
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '10px',
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '0.84rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="time_desc">Más Recientes Primero</option>
              <option value="time_asc">Más Antiguos Primero</option>
              <option value="value_desc">Mayor Monto Económico</option>
              <option value="value_asc">Menor Monto Económico</option>
              <option value="items_desc">Más Productos en Carrito</option>
            </select>
          </div>

          {/* Botón Expandir / Colapsar Todos */}
          <button
            onClick={toggleExpandAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 0.95rem',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {expandedCarts.size === carts.length && carts.length > 0 ? (
              <>
                <ChevronUp size={16} />
                <span>Colapsar Todos</span>
              </>
            ) : (
              <>
                <ChevronDown size={16} />
                <span>Expandir Todos</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 5. Lista de Carritos (Cards Expandibles con Identificación Rigurosa) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: '115px',
                background: 'linear-gradient(90deg, rgba(30, 41, 59, 0.5) 0%, rgba(51, 65, 85, 0.4) 50%, rgba(30, 41, 59, 0.5) 100%)',
                backgroundSize: '200% 100%',
                animation: 'pulse 1.8s infinite',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            />
          ))
        ) : carts.length === 0 ? (
          <div
            style={{
              padding: '4.5rem 2rem',
              textAlign: 'center',
              background: 'rgba(30, 41, 59, 0.4)',
              borderRadius: '18px',
              border: '1px dashed rgba(255, 255, 255, 0.12)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                background: 'rgba(244, 63, 94, 0.12)',
                color: '#fb7185',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShoppingBag size={32} />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff' }}>No se encontraron carritos</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8', maxWidth: '460px' }}>
              {excludePurchased
                ? 'Todos los carritos recientes en este rango fueron completados como compras reales o no coinciden con los filtros aplicados.'
                : 'No hay carritos que coincidan con los filtros seleccionados.'}
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setPeriodFilter('all');
                setMinValueFilter(0);
                setStageFilter('all');
                setExcludePurchased(true);
              }}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '0.5rem',
              }}
            >
              Restablecer Filtros
            </button>
          </div>
        ) : (
          carts.map((cart) => {
            const isExpanded = expandedCarts.has(cart.clientId);
            const clientName = `${cart.firstName || ''} ${cart.lastName || ''}`.trim() || 'Prospecto Web';
            const initials = clientName
              .split(' ')
              .map((w) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase() || 'PW';

            // Colores por etapa
            let stageBadgeBg = 'rgba(99, 102, 241, 0.15)';
            let stageBadgeColor = '#818cf8';
            let stageBadgeBorder = 'rgba(99, 102, 241, 0.35)';

            if (cart.stage === 'profile') {
              stageBadgeBg = 'rgba(14, 165, 233, 0.15)';
              stageBadgeColor = '#38bdf8';
              stageBadgeBorder = 'rgba(14, 165, 233, 0.35)';
            } else if (cart.stage === 'shipping') {
              stageBadgeBg = 'rgba(245, 158, 11, 0.15)';
              stageBadgeColor = '#fbbf24';
              stageBadgeBorder = 'rgba(245, 158, 11, 0.35)';
            } else if (cart.stage === 'payment') {
              stageBadgeBg = 'rgba(244, 63, 94, 0.15)';
              stageBadgeColor = '#fb7185';
              stageBadgeBorder = 'rgba(244, 63, 94, 0.35)';
            } else if (cart.stage === 'converted') {
              stageBadgeBg = 'rgba(16, 185, 129, 0.15)';
              stageBadgeColor = '#34d399';
              stageBadgeBorder = 'rgba(16, 185, 129, 0.35)';
            }

            // Borde izquierdo según urgencia o si ya compró
            let borderLeftColor = '#10b981';
            if (cart.isConverted) {
              borderLeftColor = '#34d399';
            } else if (cart.urgency === 'moderate') {
              borderLeftColor = '#f59e0b';
            } else if (cart.urgency === 'critical') {
              borderLeftColor = '#ef4444';
            }

            const waLink = generateWhatsAppLink(cart);

            return (
              <div
                key={cart.clientId}
                style={{
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.75) 100%)',
                  borderRadius: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderLeft: `6px solid ${borderLeftColor}`,
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Fila Resumida (Clickable) */}
                <div
                  onClick={() => toggleExpand(cart.clientId)}
                  style={{
                    padding: '1.2rem 1.4rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1.25rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  {/* Cliente Info Rigurosa */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '320px', flex: '1 1 320px' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(37, 99, 235, 0.2) 100%)',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        color: '#38bdf8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.02rem', fontWeight: 700, color: '#fff' }}>
                          {clientName}
                        </span>

                        {/* Provenance Badge */}
                        {cart.nameProvenance === 'vtex_order' && (
                          <span
                            title="Nombre verificado desde una orden previa en VTEX OMS"
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '6px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                            }}
                          >
                            ✓ Verificado OMS
                          </span>
                        )}
                        {cart.nameProvenance === 'prospect_email' && (
                          <span
                            title="El usuario no ingresó nombre; se utiliza su identificador de correo"
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '6px',
                              background: 'rgba(148, 163, 184, 0.15)',
                              color: '#cbd5e1',
                              border: '1px solid rgba(148, 163, 184, 0.25)',
                            }}
                          >
                            👤 Prospecto Web
                          </span>
                        )}

                        {/* Stage Badge */}
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.55rem',
                            borderRadius: '999px',
                            background: stageBadgeBg,
                            color: stageBadgeColor,
                            border: `1px solid ${stageBadgeBorder}`,
                          }}
                        >
                          {cart.stageTitle}
                        </span>

                        {/* Badge de Correo de Recuperación Enviado */}
                        {(cart.lastEmailSent || sentEmailStatus[cart.clientId]) && (
                          <span
                            title={`Correo enviado el ${formatNicaraguaDateTime((sentEmailStatus[cart.clientId] || cart.lastEmailSent)?.sentAt)} por ${(sentEmailStatus[cart.clientId] || cart.lastEmailSent)?.sentBy || 'Operador'}`}
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.5rem',
                              borderRadius: '6px',
                              background: 'rgba(56, 189, 248, 0.15)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Check size={11} />
                            <span>Correo Enviado</span>
                          </span>
                        )}
                      </div>

                      {/* Contacto detallado */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.82rem', color: '#94a3b8', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Mail size={13} />
                          {cart.email || 'Sin correo'}
                        </span>
                        {cart.phone && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#38bdf8', fontWeight: 600 }}>
                            <Phone size={13} />
                            {cart.phone}
                          </span>
                        )}
                        {cart.document && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#cbd5e1' }}>
                            <FileText size={13} />
                            {cart.document}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Thumbnails de productos */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {cart.items.slice(0, 3).map((item, idx) => (
                        <div
                          key={item.skuId || idx}
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '8px',
                            border: '2px solid #0f172a',
                            overflow: 'hidden',
                            marginLeft: idx > 0 ? '-10px' : '0',
                            background: '#1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                          }}
                          title={item.name}
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <Package size={16} color="#64748b" />
                          )}
                        </div>
                      ))}
                    </div>

                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8' }}>
                      {cart.itemsCount} {cart.itemsCount === 1 ? 'producto' : 'productos'}
                    </span>
                  </div>

                  {/* Valor económico & Tiempo transcurrido */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fbbf24' }}>
                        {formatMoney(cart.estimatedValue)}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <Clock size={12} />
                        <span>{formatElapsed(cart.abandonedMinutesAgo)}</span>
                      </div>
                    </div>

                    {/* Botón rápido Enviar Correo en fila */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSendEmail(cart);
                      }}
                      disabled={sendingEmailClientId === cart.clientId}
                      title={(cart.lastEmailSent || sentEmailStatus[cart.clientId]) ? 'Reenviar correo de recuperación VTEX' : 'Enviar correo de recuperación de carrito VTEX'}
                      style={{
                        padding: '0.45rem 0.8rem',
                        borderRadius: '9px',
                        background: (cart.lastEmailSent || sentEmailStatus[cart.clientId])
                          ? 'rgba(99, 102, 241, 0.18)'
                          : 'rgba(99, 102, 241, 0.32)',
                        border: '1px solid rgba(99, 102, 241, 0.45)',
                        color: '#c7d2fe',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: sendingEmailClientId === cart.clientId ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {sendingEmailClientId === cart.clientId ? (
                        <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (cart.lastEmailSent || sentEmailStatus[cart.clientId]) ? (
                        <Check size={13} color="#34d399" />
                      ) : (
                        <Mail size={13} />
                      )}
                      <span>
                        {sendingEmailClientId === cart.clientId
                          ? 'Enviando...'
                          : (cart.lastEmailSent || sentEmailStatus[cart.clientId])
                          ? 'Reenviar'
                          : 'Enviar Correo'}
                      </span>
                    </button>

                    {/* Botón flecha expandir */}
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#94a3b8',
                      }}
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Vista Expandida: Ficha del Cliente y Productos */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '1.4rem',
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      background: 'rgba(15, 23, 42, 0.65)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.25rem',
                      animation: 'fadeIn 0.2s ease-out',
                    }}
                  >
                    {/* Tarjeta de Información Integral del Cliente y Diagnóstico de Etapa */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: '1rem',
                        background: 'rgba(30, 41, 59, 0.45)',
                        padding: '1.15rem',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                          👤 Cliente Identificado
                        </span>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginTop: '3px' }}>
                          {clientName}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#38bdf8' }}>
                          {cart.email}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                          📞 Contacto Directo & Cédula
                        </span>
                        <div style={{ fontSize: '0.88rem', color: '#fff', marginTop: '3px' }}>
                          Teléfono: <strong>{cart.phone || 'No registrado'}</strong>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                          Documento: {cart.document || 'No registrado'} {cart.documentType ? `(${cart.documentType})` : ''}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                          📍 Etapa de Abandono Detectada
                        </span>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: stageBadgeColor, marginTop: '3px' }}>
                          {cart.stageTitle}
                        </div>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.3' }}>
                          {cart.stageDescription}
                        </p>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                          🕒 Sesión Registrada
                        </span>
                        <div style={{ fontSize: '0.85rem', color: '#fff', marginTop: '3px' }}>
                          {formatNicaraguaDateTime(cart.lastSessionDate)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                          Tiempo: {formatElapsed(cart.abandonedMinutesAgo)}
                        </div>
                      </div>
                    </div>

                    {/* Acciones de Recuperación Inmediata */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        padding: '0.9rem 1.15rem',
                        background: 'rgba(30, 41, 59, 0.4)',
                        borderRadius: '11px',
                        border: '1px solid rgba(244, 63, 94, 0.2)',
                      }}
                    >
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fb7185', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        ⚡ Acciones de Recuperación Directa
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        {/* Botón Abrir Checkout Directo */}
                        <a
                          href={cart.recoveryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.55rem 0.95rem',
                            borderRadius: '9px',
                            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                            color: '#fff',
                            textDecoration: 'none',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
                          }}
                        >
                          <ExternalLink size={14} />
                          <span>Abrir Carrito en Tienda</span>
                        </a>

                        {/* Botón Copiar Link de Recuperación */}
                        <button
                          onClick={() => copyToClipboard(cart.recoveryUrl, `rec-${cart.clientId}`)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.55rem 0.95rem',
                            borderRadius: '9px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: '#fff',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {copiedKey === `rec-${cart.clientId}` ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                          <span>{copiedKey === `rec-${cart.clientId}` ? '¡Link Copiado!' : 'Copiar Enlace'}</span>
                        </button>

                        {/* Botón Enviar por WhatsApp si hay teléfono */}
                        {waLink && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                              padding: '0.55rem 0.95rem',
                              borderRadius: '9px',
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              color: '#fff',
                              textDecoration: 'none',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                            }}
                          >
                            <MessageCircle size={14} />
                            <span>Contactar por WhatsApp</span>
                          </a>
                        )}

                        {/* Botón Enviar Correo de Recuperación VTEX */}
                        <button
                          onClick={() => handleSendEmail(cart)}
                          disabled={sendingEmailClientId === cart.clientId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.55rem 0.95rem',
                            borderRadius: '9px',
                            background: (cart.lastEmailSent || sentEmailStatus[cart.clientId])
                              ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.3) 0%, rgba(99, 102, 241, 0.4) 100%)'
                              : 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                            color: '#fff',
                            border: (cart.lastEmailSent || sentEmailStatus[cart.clientId])
                              ? '1px solid rgba(99, 102, 241, 0.5)'
                              : '1px solid rgba(79, 70, 229, 0.4)',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: sendingEmailClientId === cart.clientId ? 'not-allowed' : 'pointer',
                            opacity: sendingEmailClientId === cart.clientId ? 0.7 : 1,
                            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
                          }}
                        >
                          {sendingEmailClientId === cart.clientId ? (
                            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                          ) : (cart.lastEmailSent || sentEmailStatus[cart.clientId]) ? (
                            <Check size={14} color="#a5b4fc" />
                          ) : (
                            <Mail size={14} />
                          )}
                          <span>
                            {sendingEmailClientId === cart.clientId
                              ? 'Enviando Correo...'
                              : (cart.lastEmailSent || sentEmailStatus[cart.clientId])
                              ? 'Reenviar Correo VTEX'
                              : 'Enviar Correo VTEX'}
                          </span>
                        </button>

                        {/* Botón Ver Ficha Master Data */}
                        <button
                          onClick={() => handleOpenClientDetail(cart.clientId)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.55rem 0.95rem',
                            borderRadius: '9px',
                            background: 'rgba(148, 163, 184, 0.1)',
                            color: '#cbd5e1',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <Info size={14} />
                          <span>Ficha Master Data</span>
                        </button>
                      </div>
                    </div>

                    {/* Tabla de Productos del Carrito */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', textAlign: 'left' }}>
                            <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>Producto</th>
                            <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>SKU ID</th>
                            <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>Marca / Categoría</th>
                            <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'center' }}>Cantidad</th>
                            <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'right' }}>Precio Unit.</th>
                            <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'right' }}>Subtotal</th>
                            <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'center' }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cart.items.map((item, idx) => (
                            <tr
                              key={item.skuId || idx}
                              style={{
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                transition: 'background 0.15s ease',
                              }}
                            >
                              <td style={{ padding: '0.75rem 0.85rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                  <div
                                    style={{
                                      width: '48px',
                                      height: '48px',
                                      borderRadius: '8px',
                                      background: '#1e293b',
                                      border: '1px solid rgba(255, 255, 255, 0.1)',
                                      overflow: 'hidden',
                                      flexShrink: 0,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {item.imageUrl ? (
                                      <img
                                        src={item.imageUrl}
                                        alt={item.name}
                                        loading="lazy"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                    ) : (
                                      <Package size={20} color="#64748b" />
                                    )}
                                  </div>
                                  <div style={{ maxWidth: '380px' }}>
                                    <div style={{ fontWeight: 600, color: '#fff', lineHeight: '1.3' }}>
                                      {item.name}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8' }}>
                                    {item.skuId}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(item.skuId, `sku-${item.skuId}`)}
                                    title="Copiar SKU"
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#64748b',
                                      cursor: 'pointer',
                                      padding: '2px',
                                    }}
                                  >
                                    {copiedKey === `sku-${item.skuId}` ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                                  </button>
                                </div>
                              </td>

                              <td style={{ padding: '0.75rem 0.85rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.82rem' }}>
                                    {item.brand || 'SINSA'}
                                  </span>
                                  <span style={{ color: '#64748b', fontSize: '0.74rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '240px' }}>
                                    {item.category || 'General'}
                                  </span>
                                </div>
                              </td>

                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 700, color: '#fff' }}>
                                <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.08)' }}>
                                  {item.quantity}
                                </span>
                              </td>

                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                                {formatMoney(item.unitPrice)}
                              </td>

                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#fbbf24', whiteSpace: 'nowrap' }}>
                                {formatMoney(item.totalPrice)}
                              </td>

                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                <a
                                  href={item.pdpUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Ver en tienda sinca.com.ni"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '8px',
                                    background: 'rgba(56, 189, 248, 0.1)',
                                    color: '#38bdf8',
                                    textDecoration: 'none',
                                  }}
                                >
                                  <ExternalLink size={14} />
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 6. Controles de Paginación */}
      {pagination.totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1.15rem 1.35rem',
            background: 'rgba(30, 41, 59, 0.4)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ fontSize: '0.84rem', color: '#94a3b8' }}>
            Mostrando página <strong style={{ color: '#fff' }}>{pagination.page}</strong> de <strong style={{ color: '#fff' }}>{pagination.totalPages}</strong> ({pagination.total} carritos en total)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10) || 15);
                setPage(1);
              }}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '0.8rem',
                marginRight: '0.5rem',
              }}
            >
              <option value="10">10 por pág.</option>
              <option value="15">15 por pág.</option>
              <option value="25">25 por pág.</option>
              <option value="50">50 por pág.</option>
            </select>

            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1 || loading}
              style={{
                padding: '0.5rem 0.95rem',
                borderRadius: '8px',
                background: pagination.page <= 1 ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.1)',
                color: pagination.page <= 1 ? '#475569' : '#fff',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Anterior
            </button>

            <span style={{ fontSize: '0.82rem', color: '#cbd5e1', padding: '0 0.5rem' }}>
              {pagination.page} / {pagination.totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages || loading}
              style={{
                padding: '0.5rem 0.95rem',
                borderRadius: '8px',
                background: pagination.page >= pagination.totalPages ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.1)',
                color: pagination.page >= pagination.totalPages ? '#475569' : '#fff',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* 7. Modal de Ficha Completa de Master Data CL */}
      {selectedClientModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => setSelectedClientModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ padding: '0.45rem', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                  <User size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>
                    Documento Master Data CL
                  </h3>
                  <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                    ID: {selectedClientModal.id}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedClientModal(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {loadingClientDetail ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  Consultando datos en VTEX Master Data...
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block' }}>Nombre Completo</span>
                      <strong style={{ color: '#fff', fontSize: '0.92rem' }}>
                        {selectedClientModal.firstName || ''} {selectedClientModal.lastName || ''}
                      </strong>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block' }}>Correo Electrónico</span>
                      <strong style={{ color: '#38bdf8', fontSize: '0.92rem' }}>
                        {selectedClientModal.email || 'N/A'}
                      </strong>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block' }}>Teléfono Móvil</span>
                      <strong style={{ color: '#fff', fontSize: '0.92rem' }}>
                        {selectedClientModal.phone || 'No registrado'}
                      </strong>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block' }}>Teléfono Fijo / Empresa</span>
                      <strong style={{ color: '#fff', fontSize: '0.92rem' }}>
                        {selectedClientModal.homePhone || selectedClientModal.businessPhone || 'N/A'}
                      </strong>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block' }}>Identificación / Documento</span>
                      <strong style={{ color: '#fff', fontSize: '0.92rem' }}>
                        {selectedClientModal.document || 'N/A'} {selectedClientModal.documentType ? `(${selectedClientModal.documentType})` : ''}
                      </strong>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block' }}>Razón Social / Empresa</span>
                      <strong style={{ color: '#fff', fontSize: '0.92rem' }}>
                        {selectedClientModal.corporateName || selectedClientModal.tradeName || 'Persona Natural'}
                      </strong>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block' }}>Fecha de Registro</span>
                      <strong style={{ color: '#fff', fontSize: '0.86rem' }}>
                        {formatNicaraguaDateTime(selectedClientModal.createdIn)}
                      </strong>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block' }}>Última Actualización</span>
                      <strong style={{ color: '#fff', fontSize: '0.86rem' }}>
                        {formatNicaraguaDateTime(selectedClientModal.updatedIn)}
                      </strong>
                    </div>
                  </div>

                  {selectedClientModal.rclastcart && (
                    <div style={{ background: 'rgba(244, 63, 94, 0.08)', padding: '0.9rem', borderRadius: '10px', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fb7185', display: 'block', marginBottom: '0.35rem' }}>
                        String Crudo rclastcart de VTEX
                      </span>
                      <code style={{ fontSize: '0.78rem', color: '#cbd5e1', wordBreak: 'break-all' }}>
                        {selectedClientModal.rclastcart}
                      </code>
                    </div>
                  )}
                </>
              )}
            </div>

            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => setSelectedClientModal(null)}
                style={{
                  padding: '0.55rem 1.25rem',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
