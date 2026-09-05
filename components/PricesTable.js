'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
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
  Zap,
  Play,
  Square,
  Terminal,
  Download,
  Loader2,
  Edit3,
  X,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle2,
} from 'lucide-react';

const formatUtcToLocalInput = (dateStr) => {
  if (!dateStr) return '';
  let str = String(dateStr).trim();
  if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str += 'Z';
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function PricesTable() {
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
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
  const [stats, setStats] = useState({ totalPricedSkus: 0, totalCatalogCount: 82234, discountedSkusCount: 0, promotionsSkusCount: 0, fixedPriceSkusCount: 0 });
  const [banner, setBanner] = useState(null);
  const [logs, setLogs] = useState([]);

  // Modal de Edición de Precio
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState(null);
  const [loadingModalData, setLoadingModalData] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceForm, setPriceForm] = useState({
    costPrice: '',
    basePrice: '',
    listPrice: '',
    hasFixedPrice: false,
    fixedPriceValue: '',
    fixedPriceListPrice: '',
    minQuantity: '1',
    dateFrom: '',
    dateTo: '',
  });

  const handleOpenEditModal = async (sku) => {
    setEditingSku(sku);
    setIsPriceModalOpen(true);
    setLoadingModalData(true);

    const initialCost = sku.costPrice !== null && sku.costPrice !== undefined ? String(sku.costPrice) : (sku.basePrice !== null ? String(sku.basePrice) : '');
    const initialBase = sku.basePrice !== null && sku.basePrice !== undefined ? String(sku.basePrice) : '';
    const initialList = sku.listPrice !== null && sku.listPrice !== undefined ? String(sku.listPrice) : '';

    setPriceForm({
      costPrice: initialCost,
      basePrice: initialBase,
      listPrice: initialList,
      hasFixedPrice: false,
      fixedPriceValue: '',
      fixedPriceListPrice: '',
      minQuantity: '1',
      dateFrom: '',
      dateTo: '',
    });

    try {
      const res = await fetch(`/api/prices/sync?skuId=${sku.id}`);
      const fresh = await res.json();
      if (fresh && fresh.success) {
        const fp = Array.isArray(fresh.fixedPrices) && fresh.fixedPrices.length > 0 ? fresh.fixedPrices[0] : null;
        const fromDateStr = fp?.dateRange?.from || fp?.startDate || '';
        const toDateStr = fp?.dateRange?.to || fp?.endDate || '';

        setPriceForm({
          costPrice: fresh.costPrice !== null && fresh.costPrice !== undefined ? String(fresh.costPrice) : initialCost,
          basePrice: fresh.basePrice !== null && fresh.basePrice !== undefined ? String(fresh.basePrice) : initialBase,
          listPrice: fresh.listPrice !== null && fresh.listPrice !== undefined ? String(fresh.listPrice) : initialList,
          hasFixedPrice: Boolean(fp),
          fixedPriceValue: fp?.value !== undefined && fp?.value !== null ? String(fp.value) : '',
          fixedPriceListPrice: fp?.listPrice !== undefined && fp?.listPrice !== null ? String(fp.listPrice) : '',
          minQuantity: fp?.minQuantity !== undefined && fp?.minQuantity !== null ? String(fp.minQuantity) : '1',
          dateFrom: formatUtcToLocalInput(fromDateStr),
          dateTo: formatUtcToLocalInput(toDateStr),
        });
      }
    } catch (e) {
      console.error('Error cargando detalles de precio:', e);
    } finally {
      setLoadingModalData(false);
    }
  };

  const handleSavePriceSubmit = async (e) => {
    e.preventDefault();
    if (!editingSku) return;

    setSavingPrice(true);
    try {
      const isoDateFrom = priceForm.dateFrom ? new Date(priceForm.dateFrom).toISOString() : '';
      const isoDateTo = priceForm.dateTo ? new Date(priceForm.dateTo).toISOString() : '';

      const res = await fetch('/api/prices/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: editingSku.id,
          costPrice: priceForm.costPrice,
          basePrice: priceForm.basePrice,
          listPrice: priceForm.listPrice,
          hasFixedPrice: priceForm.hasFixedPrice,
          fixedPriceValue: priceForm.fixedPriceValue,
          fixedPriceListPrice: priceForm.fixedPriceListPrice,
          minQuantity: priceForm.minQuantity,
          dateFrom: isoDateFrom,
          dateTo: isoDateTo,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const baseP = parseFloat(priceForm.basePrice || 0);
        const fValP = priceForm.hasFixedPrice && priceForm.fixedPriceValue ? parseFloat(priceForm.fixedPriceValue) : null;
        const fListP = priceForm.hasFixedPrice && priceForm.fixedPriceListPrice ? parseFloat(priceForm.fixedPriceListPrice) : null;

        const effectiveSellingPrice = fValP !== null && !isNaN(fValP) ? fValP : baseP;
        const effectiveListPrice = fListP !== null && !isNaN(fListP) ? fListP : (priceForm.listPrice ? parseFloat(priceForm.listPrice) : null);

        let discPct = 0;
        if (effectiveListPrice && effectiveSellingPrice && effectiveListPrice > effectiveSellingPrice) {
          discPct = parseFloat((((effectiveListPrice - effectiveSellingPrice) / effectiveListPrice) * 100).toFixed(1));
        }

        setSkus((prev) =>
          prev.map((item) => {
            if (item.id === editingSku.id) {
              return {
                ...item,
                costPrice: parseFloat(priceForm.costPrice || 0),
                basePrice: effectiveSellingPrice,
                listPrice: effectiveListPrice,
                discountPct: discPct,
                priceUpdatedAt: new Date().toISOString(),
              };
            }
            return item;
          })
        );

        setIsPriceModalOpen(false);
        setBanner({ type: 'success', text: `✅ Precio del SKU ${editingSku.id} actualizado exitosamente en VTEX y Supabase.` });
        fetchPrices(false);
      } else {
        alert(`Error actualizando precio: ${data.error || data.vtexError}`);
      }
    } catch (err) {
      alert(`Error de red al actualizar precio: ${err.message}`);
    } finally {
      setSavingPrice(false);
    }
  };

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

  // Auto-cerrar banner de notificación tras 3 segundos
  useEffect(() => {
    if (banner) {
      const timer = setTimeout(() => {
        setBanner(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [banner]);

  // Bucle de sincronización masiva ininterrumpido cliente-servidor
  const handleToggleSync = async () => {
    if (syncActive) {
      syncRef.current = false;
      setSyncActive(false);
      addLog('⏹️ Sincronización pausada por el usuario.');
      return;
    }

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
        const finalP = fresh.finalPrice !== null && fresh.finalPrice !== undefined ? parseFloat(fresh.finalPrice) : baseP;

        // Calcular descuento basado en el precio final real vs listPrice
        let discPct = 0;
        if (listP && finalP && listP > finalP) {
          discPct = parseFloat((((listP - finalP) / listP) * 100).toFixed(1));
        } else if (listP && baseP && listP > baseP) {
          discPct = parseFloat((((listP - baseP) / listP) * 100).toFixed(1));
        }

        setSkus((prevSkus) =>
          prevSkus.map((item) => {
            if (item.id === skuId) {
              return {
                ...item,
                listPrice: listP,
                basePrice: baseP,
                finalPrice: finalP,
                costPrice: fresh.costPrice !== null && fresh.costPrice !== undefined ? parseFloat(fresh.costPrice) : null,
                discountPct: fresh.simDiscountPct > 0 ? fresh.simDiscountPct : discPct,
                promoName: fresh.simPromoName || item.promoName,
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
      setSortOrder(column === 'discount_pct' ? 'desc' : 'asc');
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

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      addLog('📊 Consultando todos los SKUs con precios y descuentos desde Supabase...');

      const res = await fetch('/api/prices/export');
      const data = await res.json();

      if (!data.success || !Array.isArray(data.skus)) {
        alert('Error obteniendo el catálogo de precios: ' + (data.error || 'Error desconocido'));
        return;
      }

      addLog(`✅ Formateando ${data.skus.length.toLocaleString('es-NI')} SKUs para reporte Excel...`);

      const exportRows = data.skus.map((s) => ({
        'SKU ID': s.id,
        'Descripción / Nombre Producto': s.description || 'N/A',
        'Estado SKU': s.isActive ? 'Activo' : 'Inactivo',
        'Precio Lista MSRP (C$)': s.listPrice !== null ? s.listPrice : 0,
        'Precio Base Venta (C$)': s.basePrice !== null ? s.basePrice : 0,
        'Precio Final Simulado (C$)': s.finalPrice !== null ? s.finalPrice : (s.basePrice ?? 0),
        'Tipo de Descuento': s.discountType || (s.promoName ? 'Promoción VTEX (Rates & Benefits)' : (s.isFixedPrice || (s.listPrice && s.basePrice && s.listPrice > s.basePrice) ? 'Fixed Price (ERP)' : 'Ninguno')),
        'Promoción / Regla Aplicada': s.promoName || (s.isFixedPrice || (s.listPrice && s.basePrice && s.listPrice > s.basePrice) ? 'Fixed Price (ERP)' : 'Ninguna'),
        'Costo (C$)': s.costPrice !== null ? s.costPrice : 0,
        'Monto Descuento (C$)': s.discountAmount || 0,
        'Porcentaje Descuento (%)': s.discountPct ? `${s.discountPct}%` : '0%',
        '¿Tiene Oferta / Descuento?': s.hasDiscount ? 'SÍ' : 'NO',
        'Última Actualización': s.priceUpdatedAt ? new Date(s.priceUpdatedAt).toLocaleString('es-NI') : 'N/A',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Precios VTEX SINSA');

      worksheet['!cols'] = [
        { wch: 15 },
        { wch: 45 },
        { wch: 15 },
        { wch: 22 },
        { wch: 22 },
        { wch: 24 },
        { wch: 34 },
        { wch: 32 },
        { wch: 15 },
        { wch: 24 },
        { wch: 22 },
        { wch: 24 },
        { wch: 24 },
      ];

      const fileName = `Precios_VTEX_SINSA_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      addLog(`🎉 Reporte Excel exportado con éxito: ${fileName}`);
    } catch (err) {
      console.error('Error al exportar precios a Excel:', err);
      alert('Error generando archivo Excel: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const catalogTotal = stats.totalCatalogCount || syncTotal || 82234;
  const pricedCount = syncActive ? Math.min(catalogTotal, syncOffset) : stats.totalPricedSkus;
  const progressPct = catalogTotal > 0 ? Math.min(100, parseFloat(((pricedCount / catalogTotal) * 100).toFixed(1))) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* 1. Centro de Extracción & Sincronización Masiva */}
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
              onClick={handleExportExcel}
              disabled={exporting}
              style={{
                padding: '0.55rem 1.15rem',
                borderRadius: '10px',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                background: 'rgba(52, 211, 153, 0.14)',
                color: '#34d399',
                fontSize: '0.86rem',
                fontWeight: 600,
                cursor: exporting ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 15px rgba(52, 211, 153, 0.15)',
              }}
              title="Descargar reporte Excel (.xlsx) con todos los SKUs, precios de lista, precios de venta y porcentaje de descuento"
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {exporting ? 'Generando Excel...' : 'Exportar Precios a Excel (C$)'}
            </button>

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

        {/* 5 Stat Boxes en el Panel Principal */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: syncActive || logs.length > 0 ? '1.25rem' : '0' }}>
          
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
              CON DESCUENTO %
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
              {stats.discountedSkusCount.toLocaleString('es-NI')}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MSRP vs Venta</span>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
              CON PROMOCIÓN VTEX
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ec4899', fontFamily: 'var(--font-mono)' }}>
              {(stats.promotionsSkusCount || 0).toLocaleString('es-NI')}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rates & Benefits</span>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
              CON FIXED PRICE ERP
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              {(stats.fixedPriceSkusCount || 0).toLocaleString('es-NI')}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ofertas ERP</span>
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

        {/* Progress Bar */}
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

      {/* 2. Tabla Principal de Precios */}
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
              <option value="all">Ver todos</option>
              <option value="with_promo">Solo con descuento de promoción en VTEX</option>
              <option value="with_fixed_price">Solo precios fijados</option>
              <option value="no_discount">Sin descuento</option>
            </select>
          </div>
        </div>

        {/* Scrollable Prices Table (Desktop >=769px) */}
        <div className="desktop-only" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '12px', border: '1px solid var(--border-subtle)', width: '100%' }}>
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
                    Precio Base {renderSortIcon('base_price')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('final_price')}
                  style={{ padding: '0.6rem 0.75rem', textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end', color: '#34d399' }}>
                    Precio Final (Venta) {renderSortIcon('final_price')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('discount_pct')}
                  style={{ padding: '0.6rem 0.75rem', textAlign: 'center', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                    Promoción / Descuento {renderSortIcon('discount_pct')}
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
                  <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 0.5rem auto' }} />
                    Cargando catálogo de precios optimizado...
                  </td>
                </tr>
              ) : skus.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No hay registros de precios en Supabase con los filtros seleccionados. Presiona <strong>"⚡ 1. Sincronizar Precios Masivos"</strong> para cargar los precios.
                  </td>
                </tr>
              ) : (
                skus.map((sku) => {
                  const isUpdatingThis = updatingSkuId === sku.id;
                  const effectiveFinalPrice = sku.finalPrice !== null && sku.finalPrice !== undefined ? sku.finalPrice : sku.basePrice;
                  const hasExtraPromoDiscount = sku.basePrice !== null && effectiveFinalPrice !== null && effectiveFinalPrice < sku.basePrice;

                  return (
                    <tr
                      key={sku.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'background 0.15s ease',
                      }}
                      className="hover-row"
                    >
                      <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)' }}>
                        {sku.id}
                      </td>

                      <td style={{ padding: '0.6rem 0.75rem', color: '#ffffff', fontWeight: 500, maxWidth: '280px' }}>
                        {sku.description}
                      </td>

                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: sku.discountPct > 0 ? 'var(--text-dim)' : 'var(--text-muted)', textDecoration: sku.discountPct > 0 ? 'line-through' : 'none' }}>
                        {sku.listPrice !== null ? `C$ ${sku.listPrice.toLocaleString('es-NI', { minimumFractionDigits: 2 })}` : '—'}
                      </td>

                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hasExtraPromoDiscount ? 'var(--text-dim)' : '#ffffff', textDecoration: hasExtraPromoDiscount ? 'line-through' : 'none' }}>
                        {sku.basePrice !== null ? `C$ ${sku.basePrice.toLocaleString('es-NI', { minimumFractionDigits: 2 })}` : '—'}
                      </td>

                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#34d399', fontSize: '0.88rem' }}>
                        {effectiveFinalPrice !== null ? `C$ ${effectiveFinalPrice.toLocaleString('es-NI', { minimumFractionDigits: 2 })}` : '—'}
                        {hasExtraPromoDiscount && (
                          <span style={{ display: 'block', fontSize: '0.68rem', color: sku.promoName ? '#c084fc' : '#ec4899', fontWeight: 600 }}>
                            {sku.promoName ? '↓ Promo Web' : '↓ Descuento Checkout'}
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                        {sku.promoName ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                            <span
                              style={{
                                background: 'rgba(236, 72, 153, 0.15)',
                                color: '#f472b6',
                                border: '1px solid rgba(236, 72, 153, 0.35)',
                                padding: '0.2rem 0.45rem',
                                borderRadius: '6px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                maxWidth: '170px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'inline-block',
                              }}
                              title={`Campaña VTEX Rates & Benefits: ${sku.promoName}`}
                            >
                              🏷️ {sku.promoName}
                            </span>
                            {sku.discountPct > 0 && (
                              <span className="badge badge-emerald" style={{ padding: '0.12rem 0.4rem', fontSize: '0.68rem', fontWeight: 700 }}>
                                -{sku.discountPct}% OFF
                              </span>
                            )}
                          </div>
                        ) : (sku.isFixedPrice || (sku.discountPct > 0 && sku.listPrice && sku.basePrice && sku.listPrice > sku.basePrice)) ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                            <span
                              style={{
                                background: 'rgba(56, 189, 248, 0.15)',
                                color: '#38bdf8',
                                border: '1px solid rgba(56, 189, 248, 0.35)',
                                padding: '0.2rem 0.45rem',
                                borderRadius: '6px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                maxWidth: '170px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'inline-block',
                              }}
                              title="Precio fijo de oferta calculado e integrado por el ERP a VTEX Pricing"
                            >
                              ⚡ Fixed Price (ERP)
                            </span>
                            {sku.discountPct > 0 && (
                              <span className="badge badge-emerald" style={{ padding: '0.12rem 0.4rem', fontSize: '0.68rem', fontWeight: 700 }}>
                                -{sku.discountPct}% OFF
                              </span>
                            )}
                          </div>
                        ) : sku.discountPct > 0 ? (
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

                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {sku.priceUpdatedAt ? new Date(sku.priceUpdatedAt).toLocaleString('es-NI') : 'Pendiente'}
                      </td>

                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                          <button
                            onClick={() => handleOpenEditModal(sku)}
                            className="btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', minHeight: '30px', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            title="Editar Cost Price, Base Price y Fixed Prices en VTEX"
                          >
                            <Edit3 size={13} /> Editar
                          </button>

                          <button
                            onClick={() => handleRefreshSingleSku(sku.id)}
                            disabled={isUpdatingThis}
                            className="btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', minHeight: '30px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            title="Actualizar precio de este SKU desde VTEX en tiempo real"
                          >
                            <RefreshCw size={12} className={isUpdatingThis ? 'animate-spin' : ''} />
                            {isUpdatingThis ? 'Cargando' : 'Refrescar'}
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

        {/* Mobile Price Cards Grid (<769px) */}
        <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={22} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 0.5rem auto' }} />
              Cargando catálogo de precios...
            </div>
          ) : skus.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No hay precios registrados.
            </div>
          ) : (
            skus.map((sku) => {
              const isUpdatingThis = updatingSkuId === sku.id;
              const effectiveFinalPrice = sku.finalPrice !== null && sku.finalPrice !== undefined ? sku.finalPrice : sku.basePrice;

              return (
                <div
                  key={sku.id}
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '14px',
                    padding: '0.95rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                  }}
                >
                  {/* Header: SKU ID & Descuento Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                      SKU #{sku.id}
                    </span>

                    {sku.promoName ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span
                          style={{
                            background: 'rgba(236, 72, 153, 0.15)',
                            color: '#f472b6',
                            border: '1px solid rgba(236, 72, 153, 0.35)',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '8px',
                            fontSize: '0.74rem',
                            fontWeight: 800,
                          }}
                        >
                          🏷️ {sku.promoName}
                        </span>
                        {sku.discountPct > 0 && (
                          <span className="badge badge-emerald" style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem', fontWeight: 800 }}>
                            -{sku.discountPct}% OFF
                          </span>
                        )}
                      </div>
                    ) : (sku.isFixedPrice || (sku.discountPct > 0 && sku.listPrice && sku.basePrice && sku.listPrice > sku.basePrice)) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span
                          style={{
                            background: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '8px',
                            fontSize: '0.74rem',
                            fontWeight: 800,
                          }}
                        >
                          ⚡ Fixed Price ERP
                        </span>
                        {sku.discountPct > 0 && (
                          <span className="badge badge-emerald" style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem', fontWeight: 800 }}>
                            -{sku.discountPct}% OFF
                          </span>
                        )}
                      </div>
                    ) : sku.discountPct > 0 ? (
                      <span className="badge badge-emerald" style={{ padding: '0.25rem 0.6rem', fontSize: '0.76rem', fontWeight: 800 }}>
                        -{sku.discountPct}% OFF
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Precio Estándar</span>
                    )}
                  </div>

                  {/* Descripción Producto */}
                  <p style={{ fontSize: '0.85rem', color: '#ffffff', margin: 0, fontWeight: 500, lineHeight: 1.3 }}>
                    {sku.description || 'Sin descripción'}
                  </p>

                  {/* Desglose de Precios (MSRP vs Final) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '0.65rem 0.85rem', borderRadius: '10px' }}>
                    <div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'block' }}>MSRP (Lista)</span>
                      <span style={{ fontSize: '0.84rem', color: sku.discountPct > 0 ? '#94a3b8' : '#ffffff', textDecoration: sku.discountPct > 0 ? 'line-through' : 'none', fontFamily: 'var(--font-mono)' }}>
                        {sku.listPrice !== null ? `C$ ${sku.listPrice.toLocaleString('es-NI', { minimumFractionDigits: 2 })}` : '—'}
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.68rem', color: '#34d399', display: 'block', fontWeight: 700 }}>PRECIO FINAL (VENTA)</span>
                      <strong style={{ fontSize: '1.05rem', color: '#34d399', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                        {effectiveFinalPrice !== null ? `C$ ${effectiveFinalPrice.toLocaleString('es-NI', { minimumFractionDigits: 2 })}` : '—'}
                      </strong>
                    </div>
                  </div>

                  {/* Botones de Acción Móvil */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleOpenEditModal(sku)}
                      className="btn-primary"
                      style={{ flex: 1, minHeight: '38px', fontSize: '0.8rem', justifyContent: 'center', borderRadius: '8px' }}
                    >
                      <Edit3 size={15} /> Editar Precio
                    </button>

                    <button
                      onClick={() => handleRefreshSingleSku(sku.id)}
                      disabled={isUpdatingThis}
                      className="btn-secondary"
                      style={{ minHeight: '38px', fontSize: '0.8rem', padding: '0 0.85rem', borderRadius: '8px' }}
                    >
                      <RefreshCw size={15} className={isUpdatingThis ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
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

      {/* MODAL EJECUTIVO DE EDICIÓN DE PRECIOS (Cost Price, Base Price & Fixed Prices) */}
      {isPriceModalOpen && editingSku && (
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
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setIsPriceModalOpen(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.99))',
              border: '1px solid rgba(165, 180, 252, 0.35)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 30px rgba(165, 180, 252, 0.2)',
              borderRadius: '18px',
              maxWidth: '620px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.5rem',
              color: '#ffffff',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
            className="bottom-sheet-container"
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.85rem' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                  SKU {editingSku.id}
                </span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0.15rem 0 0 0' }}>
                  {editingSku.description || `SKU ${editingSku.id}`}
                </h3>
              </div>

              <button
                onClick={() => setIsPriceModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {loadingModalData ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                <Loader2 size={24} className="animate-spin" color="#a5b4fc" style={{ margin: '0 auto 0.5rem auto' }} />
                Consultando estructura de precios reales en VTEX Pricing API...
              </div>
            ) : (
              <form onSubmit={handleSavePriceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                
                {/* 1. SECCIÓN: PRECIOS BASE Y COSTO */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', margin: '0 0 0.85rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <DollarSign size={15} color="#38bdf8" /> Precios de Catálogo (Cost & Base Price)
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    {/* Cost price */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600 }}>
                        Cost price (Precio Costo C$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="glass-input"
                        style={{ width: '100%', fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}
                        placeholder="0.00"
                        value={priceForm.costPrice}
                        onChange={(e) => setPriceForm({ ...priceForm, costPrice: e.target.value })}
                        required
                      />
                    </div>

                    {/* Base price */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', color: '#34d399', marginBottom: '0.3rem', fontWeight: 600 }}>
                        Base price (Precio Base Venta C$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="glass-input"
                        style={{ width: '100%', fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#34d399' }}
                        placeholder="0.00"
                        value={priceForm.basePrice}
                        onChange={(e) => setPriceForm({ ...priceForm, basePrice: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {/* List price (MSRP) */}
                  <div style={{ marginTop: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600 }}>
                      List price / MSRP (Precio de Lista / Tachado C$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="glass-input"
                      style={{ width: '100%', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                      placeholder="Dejar vacío si es igual al Base price"
                      value={priceForm.listPrice}
                      onChange={(e) => setPriceForm({ ...priceForm, listPrice: e.target.value })}
                    />
                  </div>
                </div>

                {/* 2. SECCIÓN: PRECIO FIJO / OFERTA PROGRAMADA (FIXED PRICES) */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', borderRadius: '12px', border: priceForm.hasFixedPrice ? '1px solid rgba(165, 180, 252, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: priceForm.hasFixedPrice ? '0.85rem' : '0' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: priceForm.hasFixedPrice ? '#a5b4fc' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <input
                        type="checkbox"
                        checked={priceForm.hasFixedPrice}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setPriceForm({
                            ...priceForm,
                            hasFixedPrice: checked,
                            fixedPriceValue: checked ? priceForm.fixedPriceValue : '',
                            fixedPriceListPrice: checked ? priceForm.fixedPriceListPrice : '',
                            dateFrom: checked ? priceForm.dateFrom : '',
                            dateTo: checked ? priceForm.dateTo : '',
                          });
                        }}
                        style={{ width: '16px', height: '16px', accentColor: '#a5b4fc', cursor: 'pointer' }}
                      />
                      🏷️ Activar Precio Fijo / Oferta (Fixed Price)
                    </label>

                    {priceForm.hasFixedPrice && (
                      <button
                        type="button"
                        onClick={() => {
                          setPriceForm({
                            ...priceForm,
                            hasFixedPrice: false,
                            fixedPriceValue: '',
                            fixedPriceListPrice: '',
                            dateFrom: '',
                            dateTo: '',
                          });
                        }}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          color: '#f87171',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                        title="Desmarcar y eliminar la oferta de precio fijo en VTEX"
                      >
                        🗑️ Remover Precio Fijo
                      </button>
                    )}
                  </div>

                  {!priceForm.hasFixedPrice && (
                    <p style={{ fontSize: '0.73rem', color: 'var(--text-dim)', margin: '0.4rem 0 0 0', lineHeight: '1.3' }}>
                      💡 Al desmarcar esta casilla y dar clic en <strong>Guardar</strong>, se eliminará cualquier precio fijo u oferta programada en VTEX, y el producto volverá a venderse a su <strong>Base price</strong>.
                    </p>
                  )}

                  {priceForm.hasFixedPrice && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.72rem', color: '#a5b4fc', marginBottom: '0.3rem', fontWeight: 600 }}>
                            Precio Fijo (Value C$) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="glass-input"
                            style={{ width: '100%', fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#a5b4fc' }}
                            placeholder="Ej: 1200.00"
                            value={priceForm.fixedPriceValue}
                            onChange={(e) => setPriceForm({ ...priceForm, fixedPriceValue: e.target.value })}
                            required={priceForm.hasFixedPrice}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600 }}>
                            Precio Lista Fijo (List price C$)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="glass-input"
                            style={{ width: '100%', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                            placeholder="Ej: 1500.00"
                            value={priceForm.fixedPriceListPrice}
                            onChange={(e) => setPriceForm({ ...priceForm, fixedPriceListPrice: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Cantidad Mínima */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                          Cant. Mínima
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="glass-input"
                          style={{ width: '130px', fontSize: '0.8rem', padding: '0.35rem 0.5rem', boxSizing: 'border-box' }}
                          value={priceForm.minQuantity}
                          onChange={(e) => setPriceForm({ ...priceForm, minQuantity: e.target.value })}
                        />
                      </div>

                      {/* Programación de Vigencia Opcional */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', width: '100%', boxSizing: 'border-box' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                            Fecha Inicio (Desde)
                          </label>
                          <input
                            type="datetime-local"
                            className="glass-input"
                            style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem 0.45rem', boxSizing: 'border-box' }}
                            value={priceForm.dateFrom}
                            onChange={(e) => setPriceForm({ ...priceForm, dateFrom: e.target.value })}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                            Fecha Fin (Hasta)
                          </label>
                          <input
                            type="datetime-local"
                            className="glass-input"
                            style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem 0.45rem', boxSizing: 'border-box' }}
                            value={priceForm.dateTo}
                            onChange={(e) => setPriceForm({ ...priceForm, dateTo: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsPriceModalOpen(false)}
                    disabled={savingPrice}
                    className="btn-secondary"
                    style={{ padding: '0.5rem 1.1rem', fontSize: '0.85rem' }}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={savingPrice}
                    className="btn-primary"
                    style={{ padding: '0.5rem 1.3rem', fontSize: '0.85rem' }}
                  >
                    {savingPrice ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    {savingPrice ? 'Guardando en VTEX...' : 'Guardar Precios en VTEX'}
                  </button>
                </div>

              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
