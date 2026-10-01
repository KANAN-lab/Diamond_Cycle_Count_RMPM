// ==============================================================================
// Supabase Cloud Realtime Connector
// ==============================================================================

class SupabaseService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.url = APP_CONFIG.SUPABASE_URL;
    this.key = APP_CONFIG.SUPABASE_ANON_KEY || APP_CONFIG.SUPABASE_PUBLISHABLE_KEY;
    this.init();
  }

  init() {
    const storedUrl = localStorage.getItem('rmpm_supabase_url');
    this.url = (storedUrl && storedUrl.includes('supabase.co')) ? storedUrl.trim() : APP_CONFIG.SUPABASE_URL;
    this.key = APP_CONFIG.SUPABASE_ANON_KEY || APP_CONFIG.SUPABASE_PUBLISHABLE_KEY;

    if (this.url) {
      if (!this.url.startsWith('http://') && !this.url.startsWith('https://')) {
        this.url = 'https://' + this.url;
      }
      this.url = this.url.replace(/\/+$/, '');
      localStorage.setItem('rmpm_supabase_url', this.url);
    }

    if (this.url && this.key && window.supabase) {
      try {
        this.client = window.supabase.createClient(this.url, this.key);
        this.isConnected = true;
        console.log('[Supabase Cloud] Initialized with:', this.url);
      } catch (err) {
        console.warn('[Supabase Cloud] Init failed:', err);
        this.isConnected = false;
      }
    } else {
      this.isConnected = false;
    }
  }

  async checkConnection() {
    if (!this.client) return false;
    try {
      const { error } = await this.client.from('cc_items').select('id').limit(1);
      this.isConnected = !error;
      return this.isConnected;
    } catch (e) {
      this.isConnected = false;
      return false;
    }
  }

  setUrl(newUrl) {
    let clean = newUrl.trim();
    if (clean) {
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = 'https://' + clean;
      }
      clean = clean.replace(/\/+$/, '');
    }
    this.url = clean;
    localStorage.setItem('rmpm_supabase_url', this.url);
    APP_CONFIG.SUPABASE_URL = this.url;
    this.init();
  }

  // Fetch all items from Supabase
  async fetchItems() {
    if (!this.isConnected || !this.client) return null;
    try {
      const { data, error } = await this.client
        .from('cc_items')
        .select('*')
        .order('no', { ascending: true });

      if (error) {
        console.warn('[Supabase] Error fetching items:', error);
        return null;
      }

      if (data && data.length > 0) {
        // Map database column snake_case to app camelCase
        return data.map(d => ({
          id: d.id,
          scheduleId: d.schedule_id,
          no: d.no,
          bin: d.bin,
          materialNumber: d.material_number,
          batchSap: d.batch_sap,
          batchFisik: d.batch_fisik,
          expDate: d.exp_date,
          materialDesc: d.material_desc,
          uom: d.uom,
          qtySap: parseFloat(d.qty_sap) || 0,
          pickingQty: parseFloat(d.picking_qty) || 0,
          actualQty: d.actual_qty !== null ? parseFloat(d.actual_qty) : null,
          unitConversion: d.unit_conversion || '',
          note: d.note || '',
          isMisplaced: !!d.is_misplaced,
          newBin: d.new_bin || '',
          status: d.status || 'PENDING',
          countedBy: d.counted_by || '',
          countedAt: d.counted_at || ''
        }));
      }
      return [];
    } catch (err) {
      console.warn('[Supabase] Exception fetching items:', err);
      return null;
    }
  }

  // Save / update single item to Supabase
  async syncItem(item) {
    if (!this.isConnected || !this.client) return;

    try {
      const payload = {
        id: item.id,
        actual_qty: item.actualQty,
        note: item.note,
        is_misplaced: item.isMisplaced,
        new_bin: item.newBin,
        status: item.status,
        counted_by: item.countedBy,
        counted_at: item.countedAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error } = await this.client
        .from('cc_items')
        .update(payload)
        .eq('id', item.id);

      if (error) {
        console.warn('[Supabase] Sync item failed:', error);
      } else {
        console.log('[Supabase] Item synced successfully:', item.id);
      }
    } catch (err) {
      console.warn('[Supabase] Error syncing item:', err);
    }
  }

  // Save / update system settings to Supabase
  async syncSettings(sigMatrix, companyProfile, updatedBy = 'ADMIN') {
    if (!this.isConnected || !this.client) return;

    try {
      const payload = {
        id: 'default_settings',
        company_name: companyProfile.companyName,
        division_name: companyProfile.divisionName,
        department_name: companyProfile.departmentName,
        doc_number_format: companyProfile.docNumber,
        ira_target_percent: companyProfile.iraTargetPercent,
        sig_checker_name: sigMatrix.checker.name,
        sig_checker_position: sigMatrix.checker.position,
        sig_spv_name: sigMatrix.supervisor.name,
        sig_spv_position: sigMatrix.supervisor.position,
        sig_controller_name: sigMatrix.controller.name,
        sig_controller_position: sigMatrix.controller.position,
        sig_accounting_name: sigMatrix.accounting.name,
        sig_accounting_position: sigMatrix.accounting.position,
        updated_by: updatedBy,
        updated_at: new Date().toISOString()
      };

      const { error } = await this.client
        .from('cc_settings')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        console.warn('[Supabase] Sync settings failed:', error);
      } else {
        console.log('[Supabase] Settings synced successfully');
      }
    } catch (err) {
      console.warn('[Supabase] Error syncing settings:', err);
    }
  }

  // Record activity to audit log
  async recordAudit(actionType, performedBy, role, details = {}) {
    if (!this.isConnected || !this.client) return;

    try {
      const { error } = await this.client
        .from('cc_audit_logs')
        .insert({
          action_type: actionType,
          performed_by: performedBy,
          role: role,
          details: details
        });

      if (error) {
        console.warn('[Supabase] Audit log failed:', error);
      }
    } catch (err) {
      console.warn('[Supabase] Error logging audit:', err);
    }
  }

  // Subscribe to real-time updates across devices (checker <-> admin)
  subscribeToChanges(onItemChange) {
    if (!this.isConnected || !this.client) return null;

    try {
      return this.client
        .channel('public:cc_items')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cc_items' },
          (payload) => {
            console.log('[Supabase Realtime] Change received:', payload);
            if (onItemChange) {
              onItemChange(payload);
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('[Supabase] Realtime subscription error:', err);
      return null;
    }
  }
}

window.supabaseService = new SupabaseService();
