-- ==============================================================================
-- RMPM Cycle Count Database Schema for Supabase
-- Tables: cc_schedules, cc_items, cc_users
-- ==============================================================================

-- 1. Schedules Table
CREATE TABLE IF NOT EXISTS public.cc_schedules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  doc_no TEXT NOT NULL,
  schedule_date DATE NOT NULL DEFAULT CURRENT_DATE,
  spv_name TEXT NOT NULL,
  area_name TEXT NOT NULL,
  target_category TEXT DEFAULT 'Raw Material & Packaging Material',
  status TEXT DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED, AUDITED
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Items Table
CREATE TABLE IF NOT EXISTS public.cc_items (
  id TEXT PRIMARY KEY,
  schedule_id TEXT REFERENCES public.cc_schedules(id) ON DELETE CASCADE,
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
  status TEXT DEFAULT 'PENDING', -- PENDING, MATCHED, DISCREPANCY, COUNTED
  counted_by TEXT,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Users Table
CREATE TABLE IF NOT EXISTS public.cc_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL, -- ADMIN, CHECKER, AUDITOR
  name TEXT NOT NULL,
  title TEXT,
  badge TEXT
);

-- 4. Enable Row Level Security (RLS) & Public Policies for Anon Client
ALTER TABLE public.cc_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read/write on cc_schedules" ON public.cc_schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write on cc_items" ON public.cc_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write on cc_users" ON public.cc_users FOR ALL USING (true) WITH CHECK (true);

-- 5. Enable Supabase Realtime for instant sync between Checker & Admin
ALTER PUBLICATION supabase_realtime ADD TABLE public.cc_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cc_schedules;

-- 6. Seed Initial Users
INSERT INTO public.cc_users (id, username, role, name, title, badge) VALUES
  ('admin_asep', 'spv_asep', 'ADMIN', 'Asep Saepullah', 'SPV Warehouse RMPM', 'Administrator / SPV'),
  ('checker_budi', 'checker_budi', 'CHECKER', 'Budi Santoso', 'Field Checker RMPM', 'Cycle Count Team A'),
  ('checker_dedi', 'checker_dedi', 'CHECKER', 'Dedi Kurniawan', 'Field Checker RMPM', 'Cycle Count Team B'),
  ('acc_siti', 'acc_siti', 'AUDITOR', 'Siti Rahayu, SE.', 'Cost & Inventory Accounting', 'Accounting & Audit')
ON CONFLICT (id) DO NOTHING;

-- 7. Seed Initial Active Schedule
INSERT INTO public.cc_schedules (id, doc_no, schedule_date, spv_name, area_name, target_category) VALUES
  ('sched-2026-09-21-01', 'BA-CC-RMPM/2026/09/21-01', '2026-09-21', 'SPV ASEP', 'RMPM Warehouse - Zone B (B.01 & B.02)', 'Raw Material & Packaging Material')
ON CONFLICT (id) DO NOTHING;

-- 8. Seed 20 Initial Items from Physical Form
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
ON CONFLICT (id) DO UPDATE SET
  actual_qty = EXCLUDED.actual_qty,
  note = EXCLUDED.note,
  is_misplaced = EXCLUDED.is_misplaced,
  new_bin = EXCLUDED.new_bin,
  status = EXCLUDED.status;
