'use client';

import { Database, Layers, Clock, CheckCircle2 } from 'lucide-react';

export default function StatsCards({ stats, loading }) {
  const totalSkus = stats?.supabase?.totalSkus || 0;
  const lastUpdated = stats?.supabase?.lastUpdated
    ? new Date(stats.supabase.lastUpdated).toLocaleString('es-NI', {
        dateStyle: 'short',
        timeStyle: 'medium',
      })
    : 'Sin registros';

  const cards = [
    {
      title: 'Total SKUs en Supabase',
      value: loading ? '...' : totalSkus.toLocaleString(),
      icon: Database,
      color: '#38bdf8',
      bgGlow: 'rgba(56, 189, 248, 0.15)',
      subtitle: 'Almacenados en vtex_skus',
    },
    {
      title: 'Cuenta VTEX',
      value: stats?.vtex?.account || 'b2csinsa',
      icon: Layers,
      color: '#818cf8',
      bgGlow: 'rgba(129, 140, 248, 0.15)',
      subtitle: `${stats?.vtex?.environment || 'vtexcommercestable'}`,
    },
    {
      title: 'Última Sincronización',
      value: loading ? '...' : lastUpdated,
      icon: Clock,
      color: '#34d399',
      bgGlow: 'rgba(52, 211, 153, 0.15)',
      subtitle: 'Fecha del registro más reciente',
    },
    {
      title: 'Estado del Sistema',
      value: stats?.supabase?.configured && stats?.vtex?.configured ? 'Listo' : 'Atención',
      icon: CheckCircle2,
      color: stats?.supabase?.configured && stats?.vtex?.configured ? '#34d399' : '#fbbf24',
      bgGlow: stats?.supabase?.configured && stats?.vtex?.configured ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 191, 36, 0.15)',
      subtitle: stats?.supabase?.configured && stats?.vtex?.configured ? 'Variables de entorno listas' : 'Configura claves en .env.local',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
      {cards.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <div key={idx} className="glass-card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div
              style={{
                position: 'absolute',
                top: '-20px',
                right: '-20px',
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                background: card.bgGlow,
                filter: 'blur(20px)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                {card.title}
              </span>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <IconComponent size={18} color={card.color} />
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
              {card.value}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              {card.subtitle}
            </div>
          </div>
        );
      })}
    </div>
  );
}
