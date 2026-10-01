-- ==============================================================================
-- RMPM Cycle Count Database Schema for Supabase (Safe & Idempotent Migration)
-- VERSION: v2.5 Enterprise Production
-- GUARANTEE: Idempotent & Non-Destructive!
-- Does NOT drop, truncate, or overwrite live user count records!
-- ==============================================================================

-- 0. Required Extensions (Safe)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. CORE TABLES DEFINITIONS (CREATE TABLE IF NOT EXISTS)
-- ==============================================================================

-- 1.1 Schedules Table
CREATE TABLE IF NOT EXISTS public.cc_schedules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  doc_no TEXT NOT NULL,
  schedule_date DATE NOT NULL DEFAULT CURRENT_DATE,
  spv_name TEXT NOT NULL,
  area_name TEXT NOT NULL,
  target_category TEXT DEFAULT 'Raw Material & Packaging Material',
  status TEXT DEFAULT 'IN_PROGRESS',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Inventory Items Table (Cycle Count SKU & Physical Findings)
CREATE TABLE IF NOT EXISTS public.cc_items (
  id TEXT PRIMARY KEY,
  schedule_id TEXT,
  no INTEGER,
  bin TEXT NOT NULL,
  material_number TEXT NOT NULL,
  material_desc TEXT NOT NULL,
  batch_sap TEXT,
  batch_fisik TEXT,
  exp_date TEXT,
  uom TEXT DEFAULT 'KG',
  qty_sap NUMERIC(15, 3) NOT NULL DEFAULT 0,
  picking_qty NUMERIC(15, 3) NOT NULL DEFAULT 0,
  actual_qty NUMERIC(15, 3),
  unit_conversion TEXT,
  note TEXT,
  is_misplaced BOOLEAN DEFAULT FALSE,
  new_bin TEXT,
  status TEXT DEFAULT 'PENDING',
  counted_by TEXT,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Users Table (Role-Based Access Control)
CREATE TABLE IF NOT EXISTS public.cc_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  badge TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 System Settings & Customization Table (Zero Hardcode Support)
CREATE TABLE IF NOT EXISTS public.cc_settings (
  id TEXT PRIMARY KEY DEFAULT 'default_settings',
  company_name TEXT NOT NULL DEFAULT 'PT INDUSTRI PANGAN NUSANTARA',
  division_name TEXT DEFAULT 'Warehouse & Supply Chain Division',
  department_name TEXT DEFAULT 'RMPM Department',
  doc_number_format TEXT DEFAULT 'BA-CC-RMPM/2026/09/21-01',
  ira_target_percent NUMERIC(5, 2) DEFAULT 98.0,
  sig_checker_name TEXT DEFAULT 'BUDI SANTOSO',
  sig_checker_position TEXT DEFAULT 'Petugas Cycle Count',
  sig_spv_name TEXT DEFAULT 'ASEP SAEPULLAH',
  sig_spv_position TEXT DEFAULT 'Supervisor Warehouse',
  sig_controller_name TEXT DEFAULT 'HENDRA WIJAYA',
  sig_controller_position TEXT DEFAULT 'Inventory Controller',
  sig_accounting_name TEXT DEFAULT 'SITI RAHAYU, SE.',
  sig_accounting_position TEXT DEFAULT 'Cost & Inventory Accounting',
  updated_by TEXT DEFAULT 'ADMIN',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.5 Audit Trail & Activity Logs (ISO / WMS Audit Compliance)
CREATE TABLE IF NOT EXISTS public.cc_audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  schedule_id TEXT,
  item_id TEXT,
  action_type TEXT NOT NULL, -- e.g. COUNT_SAVED, QUICK_MATCH, MISPLACED_FLAG, DUMMY_CLEARED, DUMMY_RELOADED, SETTINGS_SAVED, SAP_IMPORTED, AUTH_LOGIN, AUTH_LOGOUT
  performed_by TEXT NOT NULL,
  role TEXT NOT NULL,
  details JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 2. SAFE COLUMN & CONSTRAINT ALTERATIONS (IDEMPOTENT BLOCKS)
-- ==============================================================================
DO $$
BEGIN
  -- Foreign Key cc_items -> cc_schedules
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cc_items_schedule'
  ) THEN
    ALTER TABLE public.cc_items
    ADD CONSTRAINT fk_cc_items_schedule
    FOREIGN KEY (schedule_id) REFERENCES public.cc_schedules(id) ON DELETE CASCADE;
  END IF;

  -- Ensure all new columns exist on cc_items without failing if already present
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_items' AND column_name = 'unit_conversion') THEN
    ALTER TABLE public.cc_items ADD COLUMN unit_conversion TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_items' AND column_name = 'is_misplaced') THEN
    ALTER TABLE public.cc_items ADD COLUMN is_misplaced BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_items' AND column_name = 'new_bin') THEN
    ALTER TABLE public.cc_items ADD COLUMN new_bin TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_items' AND column_name = 'updated_at') THEN
    ALTER TABLE public.cc_items ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Ensure timestamps on cc_users
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_users' AND column_name = 'created_at') THEN
    ALTER TABLE public.cc_users ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_users' AND column_name = 'updated_at') THEN
    ALTER TABLE public.cc_users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ==============================================================================
-- 3. HIGH-PERFORMANCE QUERY INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_cc_items_schedule ON public.cc_items(schedule_id);
CREATE INDEX IF NOT EXISTS idx_cc_items_bin ON public.cc_items(bin);
CREATE INDEX IF NOT EXISTS idx_cc_items_mat_num ON public.cc_items(material_number);
CREATE INDEX IF NOT EXISTS idx_cc_items_batch_sap ON public.cc_items(batch_sap);
CREATE INDEX IF NOT EXISTS idx_cc_items_batch_fisik ON public.cc_items(batch_fisik);
CREATE INDEX IF NOT EXISTS idx_cc_items_status ON public.cc_items(status);
CREATE INDEX IF NOT EXISTS idx_cc_items_misplaced ON public.cc_items(is_misplaced) WHERE is_misplaced = TRUE;
CREATE INDEX IF NOT EXISTS idx_cc_audit_logs_action ON public.cc_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_cc_audit_logs_created ON public.cc_audit_logs(created_at DESC);

-- ==============================================================================
-- 4. AUTOMATED TIMESTAMP TRIGGER FUNCTIONS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- Trigger on cc_items
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_updated_at_cc_items') THEN
    CREATE TRIGGER trg_set_updated_at_cc_items
    BEFORE UPDATE ON public.cc_items
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;

  -- Trigger on cc_schedules
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_updated_at_cc_schedules') THEN
    CREATE TRIGGER trg_set_updated_at_cc_schedules
    BEFORE UPDATE ON public.cc_schedules
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;

  -- Trigger on cc_settings
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_updated_at_cc_settings') THEN
    CREATE TRIGGER trg_set_updated_at_cc_settings
    BEFORE UPDATE ON public.cc_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END $$;

-- ==============================================================================
-- 5. RECONCILIATION ANALYTICS VIEW
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_cc_reconciliation AS
SELECT
  i.id,
  i.schedule_id,
  i.no,
  i.bin,
  i.material_number,
  i.material_desc,
  i.batch_sap,
  i.batch_fisik,
  i.exp_date,
  i.uom,
  i.qty_sap,
  i.picking_qty,
  GREATEST(0, (i.qty_sap - i.picking_qty)) AS target_net,
  i.actual_qty,
  CASE
    WHEN i.actual_qty IS NOT NULL THEN (i.actual_qty - GREATEST(0, (i.qty_sap - i.picking_qty)))
    ELSE NULL
  END AS variance,
  CASE
    WHEN i.actual_qty IS NULL THEN 'PENDING'
    WHEN ABS(i.actual_qty - GREATEST(0, (i.qty_sap - i.picking_qty))) < 0.001 THEN 'MATCHED'
    ELSE 'DISCREPANCY'
  END AS calc_status,
  i.is_misplaced,
  i.new_bin,
  i.note,
  i.counted_by,
  i.counted_at,
  i.updated_at
FROM public.cc_items i;

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.cc_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read/write on cc_schedules" ON public.cc_schedules;
CREATE POLICY "Allow public read/write on cc_schedules" ON public.cc_schedules FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on cc_items" ON public.cc_items;
CREATE POLICY "Allow public read/write on cc_items" ON public.cc_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on cc_users" ON public.cc_users;
CREATE POLICY "Allow public read/write on cc_users" ON public.cc_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on cc_settings" ON public.cc_settings;
CREATE POLICY "Allow public read/write on cc_settings" ON public.cc_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on cc_audit_logs" ON public.cc_audit_logs;
CREATE POLICY "Allow public read/write on cc_audit_logs" ON public.cc_audit_logs FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 7. REALTIME REPLICATION PUBLICATION SETUP
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cc_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cc_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cc_schedules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cc_schedules;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cc_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cc_settings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cc_audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cc_audit_logs;
  END IF;
END $$;

-- ==============================================================================
-- 8. SEED DATA (DO NOTHING ON CONFLICT -> ZERO OVERWRITE OF LIVE USER DATA)
-- ==============================================================================

-- 8.1 Seed Default Settings
INSERT INTO public.cc_settings (
  id,
  company_name,
  division_name,
  department_name,
  doc_number_format,
  ira_target_percent,
  sig_checker_name,
  sig_checker_position,
  sig_spv_name,
  sig_spv_position,
  sig_controller_name,
  sig_controller_position,
  sig_accounting_name,
  sig_accounting_position
) VALUES (
  'default_settings',
  'PT INDUSTRI PANGAN NUSANTARA',
  'Warehouse & Supply Chain Division',
  'RMPM Department',
  'BA-CC-RMPM/2026/09/21-01',
  98.0,
  'BUDI SANTOSO',
  'Petugas Cycle Count',
  'ASEP SAEPULLAH',
  'Supervisor Warehouse',
  'HENDRA WIJAYA',
  'Inventory Controller',
  'SITI RAHAYU, SE.',
  'Cost & Inventory Accounting'
) ON CONFLICT (id) DO NOTHING;

-- 8.2 Seed Initial Users
INSERT INTO public.cc_users (id, username, role, name, title, badge) VALUES
  ('admin_asep', 'spv_asep', 'ADMIN', 'Asep Saepullah', 'SPV Warehouse RMPM', 'Administrator / SPV'),
  ('checker_budi', 'checker_budi', 'CHECKER', 'Budi Santoso', 'Field Checker RMPM', 'Cycle Count Team A'),
  ('checker_dedi', 'checker_dedi', 'CHECKER', 'Dedi Kurniawan', 'Field Checker RMPM', 'Cycle Count Team B'),
  ('acc_siti', 'acc_siti', 'AUDITOR', 'Siti Rahayu, SE.', 'Cost & Inventory Accounting', 'Accounting & Audit')
ON CONFLICT (id) DO NOTHING;

-- 8.3 Seed Initial Active Schedule
INSERT INTO public.cc_schedules (id, doc_no, schedule_date, spv_name, area_name, target_category) VALUES
  ('sched-2026-09-21-01', 'BA-CC-RMPM/2026/09/21-01', '2026-09-21', 'SPV ASEP', 'RMPM Warehouse - Zone B (B.01 & B.02)', 'Raw Material & Packaging Material')
ON CONFLICT (id) DO NOTHING;

-- 8.4 Seed 20 Initial Items
INSERT INTO public.cc_items (id, schedule_id, no, bin, material_number, batch_sap, batch_fisik, exp_date, material_desc, uom, qty_sap, picking_qty, actual_qty, unit_conversion, note, is_misplaced, new_bin, status, counted_by) VALUES
  ('item-1', 'sched-2026-09-21-01', 1, 'B.01B.2.01', '40000210', '4000079065', '25391003-PALSGA', '22-Sep-27', 'MONO & DI GLYCERIDE (DMG 0097)', 'KG', 500.0, 0.0, 380.0, '10 Sak KG', 'Fisik 380 KG (10 Sak KG)', false, '', 'COUNTED', 'Budi Santoso'),
  ('item-2', 'sched-2026-09-21-01', 2, 'B.01A.5.01', '40000210', '4000079065', '25391003-PALSGA', '22-Sep-27', 'MONO & DI GLYCERIDE (DMG 0097)', 'KG', 200.0, 60.0, 180.0, 'FL-2', 'Ada proses picking FL-2', false, '', 'COUNTED', 'Budi Santoso'),
  ('item-3', 'sched-2026-09-21-01', 3, 'B.01B.5.01', '40000210', '4000079065', '25391003-PALSGA', '22-Sep-27', 'MONO & DI GLYCERIDE (DMG 0097)', 'KG', 0.0, 0.0, 0.0, '', 'Stok kosong sesuai SAP', false, '', 'MATCHED', 'Budi Santoso'),
  ('item-4', 'sched-2026-09-21-01', 4, 'B.01A.5.04', '40000305', '4000079401', '6D3124K-CPKELCO', '20-Apr-28', 'GELLAN GUM', 'KG', 500.0, 0.0, 500.0, '20 Sak @25kg', 'Fisik utuh sesuai', false, '', 'MATCHED', 'Budi Santoso'),
  ('item-5', 'sched-2026-09-21-01', 5, 'B.01B.5.04', '40000305', '4000079402', '6E3420K-CPKELCO', '17-May-28', 'GELLAN GUM', 'KG', 525.0, 0.0, 525.0, '21 Sak @25kg', 'Sesuai', false, '', 'MATCHED', 'Budi Santoso'),
  ('item-6', 'sched-2026-09-21-01', 6, 'B.01B.3.06', '40000305', '4000079402', '6E3420K-CPKELCO', '17-May-28', 'GELLAN GUM', 'KG', 450.0, 0.0, 450.0, '18 Sak @25kg', 'Sesuai', false, '', 'MATCHED', 'Budi Santoso'),
  ('item-7', 'sched-2026-09-21-01', 7, 'B.01A.5.06', '40000305', '4000079402', '6E3420K-CPKELCO', '17-May-28', 'GELLAN GUM', 'KG', 600.0, 0.0, 600.0, '24 Sak @25kg', 'Sesuai', false, '', 'MATCHED', 'Budi Santoso'),
  ('item-8', 'sched-2026-09-21-01', 8, 'B.01B.7.11', '40000228', '4000077598', 'FS19754FG-CHANG', '01-Jun-28', 'MALIC ACID', 'KG', 320.0, 0.0, 320.0, '', 'Sesuai', false, '', 'MATCHED', 'Budi Santoso'),
  ('item-9', 'sched-2026-09-21-01', 9, 'B.01A.6.12', '40000210', '4000079277', '25391003-PALSGA', '22-Sep-27', 'MONO & DI GLYCERIDE (DMG 0097)', 'KG', 575.0, 0.0, 575.0, '', 'Sesuai', false, '', 'MATCHED', 'Budi Santoso'),
  ('item-10', 'sched-2026-09-21-01', 10, 'B.01A.6.17', '40000305', '4000078324', '6C2819K-CPKELCO', '23-Mar-28', 'GELLAN GUM', 'KG', 777.6, 0.0, 210.0, '12 BOX', 'Hanya ada 12 BOX (210 KG)', false, '', 'DISCREPANCY', 'Budi Santoso'),
  ('item-11', 'sched-2026-09-21-01', 11, 'B.01B.7.20', '40000219', '4000077711', '070728/11ATJP-S', '07-Jul-28', 'DF PALM OIL', 'KG', 777.6, 0.0, 777.6, '', 'Sesuai', false, '', 'MATCHED', 'Dedi Kurniawan'),
  ('item-12', 'sched-2026-09-21-01', 12, 'B.01B.2.21', '40000219', '4000077711', '070728/11ATJP-S', '07-Jul-28', 'DF PALM OIL', 'KG', 750.0, 0.0, 750.0, '', 'Sesuai', false, '', 'MATCHED', 'Dedi Kurniawan'),
  ('item-13', 'sched-2026-09-21-01', 13, 'B.01B.7.21', '40000219', '4000077711', '070728/11ATJP-S', '07-Jul-28', 'DF PALM OIL', 'KG', 162.0, 0.0, 162.0, '', 'Sesuai', false, '', 'MATCHED', 'Dedi Kurniawan'),
  ('item-14', 'sched-2026-09-21-01', 14, 'B.01A.5.22', '40000228', '4000074170', 'FS20025FG-CHANG', '28-Aug-28', 'MALIC ACID', 'KG', 194.4, 0.0, 194.4, '', 'Sesuai', false, '', 'MATCHED', 'Dedi Kurniawan'),
  ('item-15', 'sched-2026-09-21-01', 15, 'B.01A.7.23', '40000219', '4000077711', '070728/11ATJP-S', '07-Jul-28', 'DF PALM OIL', 'KG', 777.6, 0.0, 777.6, '', 'Sesuai', false, '', 'MATCHED', 'Dedi Kurniawan'),
  ('item-16', 'sched-2026-09-21-01', 16, 'B.01B.3.25', '40000219', '4000076048', '080628/11ATJP-S', '08-Jun-28', 'DF PALM OIL', 'KG', 777.6, 0.0, 777.6, '', 'Sesuai', false, '', 'MATCHED', 'Dedi Kurniawan'),
  ('item-17', 'sched-2026-09-21-01', 17, 'B.02B.4.03', '40000219', '4000077711', '070728/11ATJP-S', '07-Jul-28', 'DF PALM OIL', 'KG', 600.0, 0.0, 450.0, '', 'Pindah lokasi Gellan Gum B01A501', true, 'B.01A.5.01', 'DISCREPANCY', 'Dedi Kurniawan'),
  ('item-18', 'sched-2026-09-21-01', 18, 'B.02A.4.03', '40000305', '4000078324', '6C2819K-CPKELCO', '23-Mar-28', 'GELLAN GUM', 'KG', 175.0, 25.0, 600.0, '+450 KG', 'Kelebihan fisik +450 KG, cek transfer belum posting', false, '', 'DISCREPANCY', 'Budi Santoso'),
  ('item-19', 'sched-2026-09-21-01', 19, 'B.02A.5.03', '40000228', '4000077598', 'FS19754FG-CHANG', '01-Jun-28', 'MALIC ACID', 'KG', 400.0, 0.0, 400.0, '16 Sak @25kg', 'Sesuai', false, '', 'MATCHED', 'Budi Santoso'),
  ('item-20', 'sched-2026-09-21-01', 20, 'B.02A.2.14', '40000228', '4000077598', 'FS19754FG-CHANG', '01-Jun-28', 'MALIC ACID', 'KG', 600.0, 0.0, 150.0, '6 Sak @25kg', 'Fisik hanya 150 KG (selisih -450 KG)', false, '', 'DISCREPANCY', 'Budi Santoso')
ON CONFLICT (id) DO NOTHING;
