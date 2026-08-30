'use client';

import { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  TrendingUp,
  Package,
  Layers,
  Tag,
  Search,
  RefreshCw,
  Award,
  DollarSign,
  Calendar,
  ExternalLink,
  ShoppingBag,
  BarChart3,
  Sparkles,
  ChevronRight,
  Filter,
} from 'lucide-react';

export default function TendenciasPage() {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('month'); // 'month' por defecto (Mes Actual)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState('skus'); // 'skus', 'categories', 'brands'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('revenue'); // 'revenue' por defecto (Ingresos C$), o 'quantity' (Volumen)
  const [data, setData] = useState(null);

  const fetchTrendingData = async (selectedRange = range, sDate = startDate, eDate = endDate) => {
    try {
      setLoading(true);
      let url = `/api/analytics/trending?range=${selectedRange}`;
      if (sDate && eDate) {
        url += `&startDate=${sDate}&endDate=${eDate}`;
      }

      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (json.period?.startDate && json.period?.endDate) {
          setStartDate(json.period.startDate);
          setEndDate(json.period.endDate);
        }
      }
    } catch (err) {
      console.error('Error cargando tendencias:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrendingData('month', '', '');
  }, []);

  const handleRangeChange = (newRange) => {
    setRange(newRange);
    setStartDate('');
    setEndDate('');
    fetchTrendingData(newRange, '', '');
  };

  const handleCustomFilterSubmit = (e) => {
    e.preventDefault();
    if (startDate && endDate) {
      setRange('custom');
      fetchTrendingData('custom', startDate, endDate);
    }
  };

  // Filtrado y ordenamiento de SKUs
  const filteredSkus = useMemo(() => {
    if (!data?.topSkus) return [];
    let list = [...data.topSkus];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.brand.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'quantity') {
      list.sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
    } else {
      list.sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity);
    }

    return list;
  }, [data?.topSkus, searchTerm, sortBy]);

  // Filtrado de Categorías
  const filteredCategories = useMemo(() => {
    if (!data?.topCategories) return [];
    let list = [...data.topCategories];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((item) => item.name.toLowerCase().includes(q));
    }

    if (sortBy === 'quantity') {
      list.sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
    } else {
      list.sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity);
    }

    return list;
  }, [data?.topCategories, searchTerm, sortBy]);

  // Filtrado de Marcas
  const filteredBrands = useMemo(() => {
    if (!data?.topBrands) return [];
    let list = [...data.topBrands];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((item) => item.name.toLowerCase().includes(q));
    }

    if (sortBy === 'quantity') {
      list.sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
    } else {
      list.sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity);
    }

    return list;
  }, [data?.topBrands, searchTerm, sortBy]);

  const maxSkuQty = useMemo(() => {
    if (!filteredSkus.length) return 1;
    return Math.max(...filteredSkus.map((s) => s.quantity));
  }, [filteredSkus]);

  return (
    <AppLayout>
      <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '2rem' }}>
        
        {/* HEADER SUPERIOR CON TITULO Y SELECTOR DE FECHAS DE LIBRE ELECCIÓN */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1.25rem',
            marginBottom: '1.75rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={22} color="#10b981" />
              </div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Tendencias & Movimiento E-Commerce
              </h1>
            </div>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.88rem', color: '#94a3b8' }}>
              Análisis completo de demandadas, productos y categorías en VTEX OMS.
              {data?.period?.startDate && (
                <span style={{ color: '#10b981', fontWeight: 600, marginLeft: '0.5rem' }}>
                  • Período: {data.period.startDate} al {data.period.endDate} ({data?.summary?.totalOrders || 0} órdenes analizadas)
                </span>
              )}
            </p>
          </div>

          {/* CONTROLES DE RANGO DE FECHAS Y SELECCIÓN LIBRE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }} className="mobile-header-stack">
            
            {/* Botones Predefinidos Rápido */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(15, 23, 42, 0.8)',
                padding: '0.25rem',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                flexWrap: 'wrap',
                gap: '0.2rem',
              }}
            >
              {[
                { id: 'month', label: 'Mes Actual' },
                { id: 'today', label: 'Hoy' },
                { id: '7days', label: '7 Días' },
                { id: 'prevMonth', label: 'Mes Anterior' },
              ].map((b) => (
                <button
                  key={b.id}
                  onClick={() => handleRangeChange(b.id)}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: range === b.id ? 700 : 500,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backgroundColor: range === b.id ? '#10b981' : 'transparent',
                    color: range === b.id ? '#0f172a' : '#94a3b8',
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {/* Formulario de Selección Libre de Rango de Fechas */}
            <form
              onSubmit={handleCustomFilterSubmit}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'rgba(15, 23, 42, 0.8)',
                padding: '0.35rem 0.55rem',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                <Calendar size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    borderRadius: '6px',
                    padding: '0.3rem 0.35rem',
                    fontSize: '0.76rem',
                    outline: 'none',
                    maxWidth: '115px',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>a</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    borderRadius: '6px',
                    padding: '0.3rem 0.35rem',
                    fontSize: '0.76rem',
                    outline: 'none',
                    maxWidth: '115px',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    backgroundColor: '#38bdf8',
                    color: '#0f172a',
                    fontWeight: 700,
                    fontSize: '0.76rem',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.35rem 0.65rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  Consultar
                </button>
              </div>
            </form>

            <button
              onClick={() => fetchTrendingData(range, startDate, endDate)}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '0.55rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                width: '100%',
              }}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span style={{ fontSize: '0.78rem' }}>Actualizar Datos</span>
            </button>
          </div>
        </div>

        {/* HERO KPI CARDS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.25rem',
            marginBottom: '2rem',
          }}
        >
          {/* Card 1: Ventas Totales */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.85))',
              borderRadius: '16px',
              padding: '1.25rem 1.5rem',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>Ventas Totales Procesadas</span>
              <div style={{ padding: '0.4rem', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                <DollarSign size={20} />
              </div>
            </div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
              C$ {(data?.summary?.totalRevenue || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#38bdf8', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span>Analizado en {data?.summary?.totalOrders || 0} órdenes aprobadas</span>
            </div>
          </div>

          {/* Card 2: Unidades Vendidas */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.85))',
              borderRadius: '16px',
              padding: '1.25rem 1.5rem',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>Unidades Despachadas</span>
              <div style={{ padding: '0.4rem', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                <Package size={20} />
              </div>
            </div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
              {(data?.summary?.totalUnits || 0).toLocaleString('es-NI')} <span style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8' }}>unid.</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#10b981', marginTop: '0.4rem' }}>
              Distribuidas en {data?.summary?.distinctSkus || 0} SKUs distintos
            </div>
          </div>

          {/* Card 3: Categoría Líder */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.85))',
              borderRadius: '16px',
              padding: '1.25rem 1.5rem',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>Categoría Líder (#1)</span>
              <div style={{ padding: '0.4rem', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                <Layers size={20} />
              </div>
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#c084fc', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {data?.summary?.topCategory?.name || 'Cargando...'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#e9d5ff', marginTop: '0.4rem' }}>
              C$ {(data?.summary?.topCategory?.revenue || 0).toLocaleString('es-NI', { maximumFractionDigits: 0 })} • ({data?.summary?.topCategory?.revenuePercentage?.toFixed(1) || 0}% de la venta)
            </div>
          </div>

          {/* Card 4: Producto Estrella (Evaluación Comercial Multicriterio) */}
          {(() => {
            const isRevenue = sortBy === 'revenue';
            const starProduct = isRevenue
              ? (data?.summary?.topProductByRevenue || data?.summary?.topProduct)
              : (data?.summary?.topProductByQuantity || data?.summary?.topProduct);

            return (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.85))',
                  borderRadius: '16px',
                  padding: '1.25rem 1.5rem',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                  <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>
                    {isRevenue ? '🏆 Producto Estrella (#1 Ingresos)' : '🔥 Producto Más Demandado (#1 Unid.)'}
                  </span>
                  <div style={{ padding: '0.4rem', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                    <Award size={20} />
                  </div>
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.3, height: '2.5rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {starProduct?.name || 'Cargando...'}
                </div>
                <div style={{ fontSize: '0.78rem', marginTop: '0.45rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.3rem' }}>
                  <span style={{ color: '#34d399', fontWeight: 800 }}>
                    💰 C$ {(starProduct?.revenue || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ color: '#fbbf24', fontWeight: 600, background: 'rgba(245, 158, 11, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
                    {starProduct?.quantity || 0} {starProduct?.quantity === 1 ? 'unid.' : 'unids.'}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* NAVEGACIÓN POR PESTAÑAS + BARRA DE BÚSQUEDA Y ORDEN */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(16px)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              paddingBottom: '1rem',
            }}
          >
            {/* PESTAÑAS DE VISTA */}
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '0.25rem' }}>
              {[
                { id: 'skus', label: `📦 Top SKUs / Productos (${data?.topSkus?.length || 0})`, icon: Package },
                { id: 'categories', label: `📊 Categorías Populares (${data?.topCategories?.length || 0})`, icon: Layers },
                { id: 'brands', label: `🏷️ Marcas Líderes (${data?.topBrands?.length || 0})`, icon: Tag },
              ].map((tab) => {
                const IconComp = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '0.65rem 1.1rem',
                      borderRadius: '10px',
                      fontSize: '0.88rem',
                      fontWeight: isActive ? 700 : 500,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor: isActive ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                      color: isActive ? '#38bdf8' : '#94a3b8',
                      border: isActive ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    <IconComp size={17} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* CONTROLES DE BÚSQUEDA Y ORDEN (Móvil: 100% de Ancho Abarcando Todo el Espacio) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', width: '100%' }} className="mobile-stack">
              {/* Buscador */}
              <div style={{ position: 'relative', width: '100%', maxWidth: '100%', flex: 1 }}>
                <Search size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Buscar por producto, marca..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Selector de Criterio de Orden */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>Ordenar por:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    outline: 'none',
                    width: '100%',
                  }}
                >
                  <option value="quantity">🔥 Unidades Vendidas (Demanda)</option>
                  <option value="revenue">💰 Ingresos Generados (Ventas C$)</option>
                </select>
              </div>
            </div>
          </div>

          {/* CONTENIDO PRINCIPAL SEGÚN PESTAÑA ACTIVA */}
          <div style={{ marginTop: '1.25rem' }}>
            {loading ? (
              <div style={{ padding: '4rem 0', textAlign: 'center' }}>
                <RefreshCw size={36} color="#10b981" className="animate-spin" style={{ margin: '0 auto 1rem auto' }} />
                <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Analizando órdenes y movimiento de catálogo en VTEX OMS...</p>
              </div>
            ) : activeTab === 'skus' ? (
              /* VISTA 1: TOP SKUs / PRODUCTOS */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {filteredSkus.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    No se encontraron productos que coincidan con la búsqueda.
                  </div>
                ) : (
                  filteredSkus.map((sku, index) => {
                    const pctOfMax = (sku.quantity / maxSkuQty) * 100;
                    const isTop1 = index === 0;

                    return (
                      <div key={sku.id}>
                        {/* 1. Vista de Fila para Escritorio (≥769px) */}
                        <div
                          className="desktop-only"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            backgroundColor: isTop1 ? 'rgba(16, 185, 129, 0.06)' : 'rgba(30, 41, 59, 0.4)',
                            border: `1px solid ${isTop1 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                            borderRadius: '14px',
                            padding: '1rem 1.25rem',
                            transition: 'all 0.2s',
                            position: 'relative',
                            overflow: 'hidden',
                          }}
                        >
                          {/* Ranking # */}
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '10px',
                              backgroundColor: isTop1 ? '#10b981' : 'rgba(255, 255, 255, 0.06)',
                              color: isTop1 ? '#0f172a' : '#94a3b8',
                              fontWeight: 800,
                              fontSize: '0.9rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            #{index + 1}
                          </div>

                          {/* Imagen */}
                          <img
                            src={sku.imageUrl}
                            alt={sku.name}
                            onError={(e) => { e.target.onerror = null; e.target.src = '/placeholder-product.svg'; }}
                            style={{ width: '54px', height: '54px', borderRadius: '10px', objectFit: 'cover', backgroundColor: '#ffffff', padding: '2px', flexShrink: 0 }}
                          />

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                              <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '6px', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 700 }}>
                                SKU: {sku.id}
                              </span>
                              <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '6px', backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', fontWeight: 600 }}>
                                {sku.brand}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                • {sku.category}
                              </span>
                            </div>

                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {sku.name}
                            </h3>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.45rem' }}>
                              <div style={{ flex: 1, height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${pctOfMax}%`, height: '100%', backgroundColor: isTop1 ? '#10b981' : '#38bdf8', borderRadius: '3px' }} />
                              </div>
                              <span style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                                En {sku.ordersCount} órdenes
                              </span>
                            </div>
                          </div>

                          {/* Métricas */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>
                              {sku.quantity} <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>unid.</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff', marginTop: '0.15rem' }}>
                              C$ {sku.revenue.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.1rem' }}>
                              P. Unit: C$ {sku.unitPrice.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>

                          <a
                            href={`https://sinsa.com.ni/${sku.id}/p`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ padding: '0.45rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.06)', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                            title="Ver producto en sinsa.com.ni"
                          >
                            <ExternalLink size={16} />
                          </a>
                        </div>

                        {/* 2. Tarjeta Táctil para Móvil (≤768px) - Cero Solapamientos */}
                        <div
                          className="mobile-only"
                          style={{
                            backgroundColor: isTop1 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(30, 41, 59, 0.6)',
                            border: `1px solid ${isTop1 ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
                            borderRadius: '16px',
                            padding: '0.95rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.25)',
                          }}
                        >
                          {/* Fila 1: Ranking + Imagen + SKU Pill + Categoría/Marca + Link */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '8px',
                                  backgroundColor: isTop1 ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                                  color: isTop1 ? '#0f172a' : '#94a3b8',
                                  fontWeight: 800,
                                  fontSize: '0.82rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                #{index + 1}
                              </div>

                              <img
                                src={sku.imageUrl}
                                alt={sku.name}
                                onError={(e) => { e.target.onerror = null; e.target.src = '/placeholder-product.svg'; }}
                                style={{ width: '44px', height: '44px', borderRadius: '8px', objectFit: 'cover', backgroundColor: '#ffffff', padding: '2px', flexShrink: 0 }}
                              />

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '6px', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 800, width: 'max-content' }}>
                                  SKU #{sku.id}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#a5b4fc', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {sku.brand} {sku.category ? `• ${sku.category}` : ''}
                                </span>
                              </div>
                            </div>

                            <a
                              href={`https://sinsa.com.ni/${sku.id}/p`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ padding: '0.45rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.08)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}
                              title="Ver en sinsa.com.ni"
                            >
                              <ExternalLink size={16} />
                            </a>
                          </div>

                          {/* Fila 2: Nombre Completo del Producto (Sin recortar a P..) */}
                          <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {sku.name}
                          </h3>

                          {/* Fila 3: Caja Destacada de Métricas de Venta */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.35)', padding: '0.65rem 0.85rem', borderRadius: '10px', gap: '0.5rem' }}>
                            <div>
                              <span style={{ fontSize: '0.66rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>INGRESOS TOTALES</span>
                              <strong style={{ fontSize: '1.02rem', color: '#10b981', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                                C$ {sku.revenue.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </strong>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.66rem', color: '#38bdf8', display: 'block', fontWeight: 700 }}>UNIDADES VENDIDAS</span>
                              <strong style={{ fontSize: '0.92rem', color: '#ffffff', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                                {sku.quantity} unid. <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>({sku.ordersCount} ord.)</span>
                              </strong>
                            </div>
                          </div>

                          {/* Barra de Progreso de Demanda */}
                          <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pctOfMax}%`, height: '100%', backgroundColor: isTop1 ? '#10b981' : '#38bdf8', borderRadius: '3px' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : activeTab === 'categories' ? (
              /* VISTA 2: TOP CATEGORÍAS */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '1rem' }} className="mobile-card-grid">
                {filteredCategories.map((cat, idx) => {
                  const pct = cat.revenuePercentage || 0;
                  return (
                    <div
                      key={cat.name}
                      style={{
                        backgroundColor: 'rgba(30, 41, 59, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '14px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              color: '#c084fc',
                              backgroundColor: 'rgba(168, 85, 247, 0.15)',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '6px',
                            }}
                          >
                            Categoría #{idx + 1}
                          </span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8' }}>
                            {pct.toFixed(1)}% del Total
                          </span>
                        </div>

                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                          {cat.name}
                        </h3>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.75rem 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                          <div>
                            📦 Unidades: <strong style={{ color: '#ffffff' }}>{cat.quantity}</strong>
                          </div>
                          <div>
                            🏷️ SKUs Distintos: <strong style={{ color: '#ffffff' }}>{cat.skusCount}</strong>
                          </div>
                        </div>
                      </div>

                      <div>
                        {/* Barra de Porcentaje de Ingresos */}
                        <div
                          style={{
                            height: '8px',
                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            marginBottom: '0.65rem',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              height: '100%',
                              background: 'linear-gradient(to right, #a855f7, #38bdf8)',
                              borderRadius: '4px',
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Ingresos generados:</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>
                            C$ {cat.revenue.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* VISTA 3: TOP MARCAS */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '1rem' }} className="mobile-card-grid">
                {filteredBrands.map((brand, idx) => (
                  <div
                    key={brand.name}
                    style={{
                      backgroundColor: 'rgba(30, 41, 59, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '1.1rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>#{idx + 1}</span>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
                          {brand.name}
                        </h4>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                        {brand.quantity} unidades vendidas • {brand.skusCount} SKUs
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981' }}>
                        C$ {brand.revenue.toLocaleString('es-NI', { maximumFractionDigits: 0 })}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600 }}>
                        {brand.revenuePercentage.toFixed(1)}% Share
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
