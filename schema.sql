-- ==============================================================================
-- ESQUEMA COMPLETO DE PRODUCCIÓN SUPABASE (SINSA MONITORING)
-- ==============================================================================

-- 1. TABLA DE STOCK DE SEGURIDAD (RELACIÓN SKU + DESCRIPCIÓN + STOCK MÍNIMO)
CREATE TABLE IF NOT EXISTS public.vtex_safety_stock (
    sku_id BIGINT PRIMARY KEY,
    description TEXT NULL,
    safety_stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vtex_safety_stock_sku ON public.vtex_safety_stock(sku_id);
ALTER TABLE public.vtex_safety_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total vtex_safety_stock" ON public.vtex_safety_stock;
CREATE POLICY "Permitir acceso total vtex_safety_stock" ON public.vtex_safety_stock FOR ALL USING (true) WITH CHECK (true);


-- 2. TABLA DE SKUS, INVENTARIOS Y PRECIOS VTEX
CREATE TABLE IF NOT EXISTS public.vtex_skus (
    id BIGINT PRIMARY KEY,
    is_active BOOLEAN DEFAULT true,
    wh1_total INT DEFAULT 0,
    wh1_reserved INT DEFAULT 0,
    stock_wh1 INT DEFAULT 0,
    wh2_total INT DEFAULT 0,
    wh2_reserved INT DEFAULT 0,
    stock_wh2 INT DEFAULT 0,
    total_quantity INT DEFAULT 0,
    total_reserved INT DEFAULT 0,
    total_stock INT DEFAULT 0,
    inventory_detail JSONB NULL,
    inventory_updated_at TIMESTAMPTZ NULL,
    list_price NUMERIC(12,2) DEFAULT NULL,
    base_price NUMERIC(12,2) DEFAULT NULL,
    cost_price NUMERIC(12,2) DEFAULT NULL,
    price_updated_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vtex_skus_id ON public.vtex_skus(id);
CREATE INDEX IF NOT EXISTS idx_vtex_skus_is_active ON public.vtex_skus(is_active);
CREATE INDEX IF NOT EXISTS idx_vtex_skus_base_price ON public.vtex_skus(base_price);
ALTER TABLE public.vtex_skus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total vtex_skus" ON public.vtex_skus;
CREATE POLICY "Permitir acceso total vtex_skus" ON public.vtex_skus FOR ALL USING (true) WITH CHECK (true);


-- 3. TABLA DE ÓRDENES VTEX OMS EN TIEMPO REAL
CREATE TABLE IF NOT EXISTS public.vtex_orders (
    order_id TEXT PRIMARY KEY,
    sequence TEXT NULL,
    status TEXT NOT NULL,
    status_description TEXT NULL,
    creation_date TIMESTAMPTZ NOT NULL,
    client_name TEXT NULL,
    client_email TEXT NULL,
    total_value NUMERIC(12,2) DEFAULT 0,
    fulfillment_type TEXT NULL,
    pickup_store TEXT NULL,
    shipping_cost NUMERIC(12,2) DEFAULT 0,
    address_json JSONB NULL,
    marketing_json JSONB NULL,
    detail_json JSONB NULL,
    items JSONB NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MIGRACIÓN / ALTER TABLE PARA INSTALACIONES EXISTENTES:
ALTER TABLE public.vtex_orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NULL;
ALTER TABLE public.vtex_orders ADD COLUMN IF NOT EXISTS pickup_store TEXT NULL;
ALTER TABLE public.vtex_orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.vtex_orders ADD COLUMN IF NOT EXISTS address_json JSONB NULL;
ALTER TABLE public.vtex_orders ADD COLUMN IF NOT EXISTS marketing_json JSONB NULL;
ALTER TABLE public.vtex_orders ADD COLUMN IF NOT EXISTS detail_json JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_vtex_orders_status ON public.vtex_orders(status);
CREATE INDEX IF NOT EXISTS idx_vtex_orders_creation ON public.vtex_orders(creation_date DESC);
CREATE INDEX IF NOT EXISTS idx_vtex_orders_fulfillment ON public.vtex_orders(fulfillment_type);
CREATE INDEX IF NOT EXISTS idx_vtex_orders_pickup_store ON public.vtex_orders(pickup_store);
ALTER TABLE public.vtex_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total vtex_orders" ON public.vtex_orders;
CREATE POLICY "Permitir acceso total vtex_orders" ON public.vtex_orders FOR ALL USING (true) WITH CHECK (true);


-- 4. TABLA DE TRANSACCIONES Y DEVOLUCIONES GA4 (VTEX PCI GATEWAY / TILOPAY)
CREATE TABLE IF NOT EXISTS public.vtex_transactions (
    transaction_id TEXT PRIMARY KEY,
    order_id TEXT NULL,
    status TEXT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    client_name TEXT NULL,
    client_email TEXT NULL,
    client_phone TEXT NULL,
    client_document TEXT NULL,
    payment_system TEXT NULL,
    card_number TEXT NULL,
    card_holder TEXT NULL,
    amount NUMERIC(12,2) DEFAULT 0,
    acquirer TEXT NULL,
    tid TEXT NULL,
    auth_id TEXT NULL,
    return_code TEXT NULL,
    return_message TEXT NULL,
    error_code TEXT NULL,
    error_title TEXT NULL,
    error_description TEXT NULL,
    is_error BOOLEAN DEFAULT false,
    is_refund BOOLEAN DEFAULT false,
    cancel_reason TEXT NULL,
    items JSONB NULL,
    ga4_refund_sent BOOLEAN DEFAULT false,
    ga4_refund_sent_at TIMESTAMPTZ NULL,
    raw_payload JSONB NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vtex_tx_status ON public.vtex_transactions(status);
CREATE INDEX IF NOT EXISTS idx_vtex_tx_start_date ON public.vtex_transactions(start_date DESC);
ALTER TABLE public.vtex_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total vtex_transactions" ON public.vtex_transactions;
CREATE POLICY "Permitir acceso total vtex_transactions" ON public.vtex_transactions FOR ALL USING (true) WITH CHECK (true);


-- ==============================================================================
-- SCRIPT DE ACTUALIZACIÓN RÁPIDA PARA TABLAS EXISTENTES EN SUPABASE
-- Copia y ejecuta este bloque en el SQL Editor de Supabase si ya tienes las tablas creadas
-- ==============================================================================

ALTER TABLE public.vtex_transactions 
  ADD COLUMN IF NOT EXISTS items JSONB NULL,
  ADD COLUMN IF NOT EXISTS ga4_refund_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ga4_refund_sent_at TIMESTAMPTZ NULL;

-- 5. TABLA DE MONITOREO DE KITS VTEX
CREATE TABLE IF NOT EXISTS public.vtex_kits (
    kit_sku_id BIGINT PRIMARY KEY,
    description TEXT NULL,
    is_active BOOLEAN DEFAULT true,
    custom_skus JSONB NULL,
    last_sync_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vtex_kits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total vtex_kits" ON public.vtex_kits;
CREATE POLICY "Permitir acceso total vtex_kits" ON public.vtex_kits FOR ALL USING (true) WITH CHECK (true);


-- 6. TABLA DE VITRINAS Y GRUPOS DE PRODUCTOS DESTACADOS PARA HOME
CREATE TABLE IF NOT EXISTS public.home_showcases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NULL,
    category_focus TEXT DEFAULT 'General',
    skus_count INT DEFAULT 0,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.home_showcases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total home_showcases" ON public.home_showcases;
CREATE POLICY "Permitir acceso total home_showcases" ON public.home_showcases FOR ALL USING (true) WITH CHECK (true);



