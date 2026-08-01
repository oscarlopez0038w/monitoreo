-- ==============================================================================
-- TABLA DE STOCK DE SEGURIDAD (RELACIÓN SKU + DESCRIPCIÓN + STOCK MÍNIMO)
-- Copia y ejecuta este bloque en el SQL Editor de Supabase
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.vtex_safety_stock (
    sku_id BIGINT PRIMARY KEY,
    description TEXT NULL,
    safety_stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vtex_safety_stock_sku ON public.vtex_safety_stock(sku_id);

ALTER TABLE public.vtex_safety_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acceso total vtex_safety_stock" ON public.vtex_safety_stock FOR ALL USING (true) WITH CHECK (true);


-- ==============================================================================
-- ACTUALIZACIÓN DE TABLA VTEX_SKUS: AGREGAR COLUMNAS DE DESGLOSE DE INVENTARIO Y PRECIOS
-- ==============================================================================

ALTER TABLE public.vtex_skus 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS wh1_total INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wh1_reserved INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wh2_total INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wh2_reserved INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_quantity INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_reserved INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS list_price NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Crear índices de apoyo para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_vtex_skus_is_active ON public.vtex_skus(is_active);
CREATE INDEX IF NOT EXISTS idx_vtex_skus_wh1_reserved ON public.vtex_skus(wh1_reserved);
CREATE INDEX IF NOT EXISTS idx_vtex_skus_wh2_reserved ON public.vtex_skus(wh2_reserved);
CREATE INDEX IF NOT EXISTS idx_vtex_skus_base_price ON public.vtex_skus(base_price);
CREATE INDEX IF NOT EXISTS idx_vtex_skus_list_price ON public.vtex_skus(list_price);


-- ==============================================================================
-- TABLA COMPLETA DESDE CERO (SI DESEAS RECREARLA COMPLETA)
-- ==============================================================================
/*
DROP TABLE IF EXISTS public.vtex_skus CASCADE;

CREATE TABLE public.vtex_skus (
    id BIGINT PRIMARY KEY,                        -- ID del SKU en VTEX
    is_active BOOLEAN DEFAULT true,               -- Estado (true: Activo, false: Inactivo)
    
    -- Bodega 1 / Mega (ID 24)
    wh1_total INT NULL DEFAULT 0,                 -- Total (Last Update) Mega
    wh1_reserved INT NULL DEFAULT 0,              -- Reservado Mega
    stock_wh1 INT NULL DEFAULT 0,                 -- Disponible Mega (wh1_total - wh1_reserved)
    
    -- Bodega 2 / Cedis (ID 1041)
    wh2_total INT NULL DEFAULT 0,                 -- Total (Last Update) Cedis
    wh2_reserved INT NULL DEFAULT 0,              -- Reservado Cedis
    stock_wh2 INT NULL DEFAULT 0,                 -- Disponible Cedis (wh2_total - wh2_reserved)
    
    -- Totales Consolidados
    total_quantity INT NULL DEFAULT 0,            -- Total Físico Consolidado
    total_reserved INT NULL DEFAULT 0,            -- Total Reservado Consolidado
    total_stock INT NULL DEFAULT 0,               -- Total Disponible (total_quantity - total_reserved)
    
    inventory_detail JSONB NULL,                 -- JSON balance original VTEX
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    inventory_updated_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_vtex_skus_id ON public.vtex_skus(id);
CREATE INDEX idx_vtex_skus_is_active ON public.vtex_skus(is_active);
CREATE INDEX idx_vtex_skus_total_stock ON public.vtex_skus(total_stock);

ALTER TABLE public.vtex_skus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acceso total vtex_skus" ON public.vtex_skus FOR ALL USING (true) WITH CHECK (true);
*/

-- ==============================================================================
-- TABLA DE ÓRDENES VTEX OMS EN TIEMPO REAL (HISTORIAL + WEBSOCKETS REALTIME)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.vtex_orders (
    order_id TEXT PRIMARY KEY,
    sequence TEXT NULL,
    status TEXT NOT NULL,
    status_description TEXT NULL,
    creation_date TIMESTAMPTZ NOT NULL,
    client_name TEXT NULL,
    client_email TEXT NULL,
    total_value NUMERIC(12,2) DEFAULT 0,
    items JSONB NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vtex_orders_status ON public.vtex_orders(status);
CREATE INDEX IF NOT EXISTS idx_vtex_orders_creation ON public.vtex_orders(creation_date DESC);

ALTER TABLE public.vtex_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acceso total vtex_orders" ON public.vtex_orders FOR ALL USING (true) WITH CHECK (true);

-- Habilitar publicación en tiempo real para la tabla vtex_orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.vtex_orders;

