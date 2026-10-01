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
      console.warn('[Supabase Cloud] Exception fetching items:', err);
      return null;
    }
  }

  // Fetch system settings from Supabase cc_settings
  async fetchSettings() {
    if (!this.isConnected || !this.client) return null;
    try {
      const { data, error } = await this.client
        .from('cc_settings')
        .select('*')
        .eq('id', 'default_settings')
        .maybeSingle();

      if (error) {
        console.warn('[Supabase Cloud] Error fetching settings:', error);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('[Supabase Cloud] Exception fetching settings:', err);
      return null;
    }
  }

  // Create single new item in Supabase cc_items
  async createItem(item) {
    if (!this.isConnected || !this.client) return { success: false, reason: 'offline' };
    try {
      const payload = {
        id: item.id,
        schedule_id: item.scheduleId || 'sched-2026-09-21-01',
        no: item.no || 1,
        bin: item.bin,
        material_number: item.materialNumber,
        material_desc: item.materialDesc,
        batch_sap: item.batchSap,
        batch_fisik: item.batchFisik || item.batchSap,
        exp_date: item.expDate || null,
        uom: item.uom || 'KG',
        qty_sap: item.qtySap || 0,
        picking_qty: item.pickingQty || 0,
        actual_qty: item.actualQty !== null && item.actualQty !== undefined ? item.actualQty : null,
        unit_conversion: item.unitConversion || null,
        note: item.note || null,
        is_misplaced: Boolean(item.isMisplaced),
        new_bin: item.newBin || null,
        status: item.status || 'PENDING',
        counted_by: item.countedBy || null,
        counted_at: item.countedAt ? new Date(item.countedAt).toISOString() : null,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.client
        .from('cc_items')
        .insert(payload)
        .select();

      if (error) {
        console.warn('[Supabase Cloud] Create item failed:', error);
        return { success: false, error };
      }
      console.log('[Supabase Cloud] Item created successfully:', item.id);
      return { success: true, data };
    } catch (err) {
      console.warn('[Supabase Cloud] Exception creating item:', err);
      return { success: false, error: err };
    }
  }

  // Update item master data in Supabase cc_items
  async updateItemMaster(item) {
    if (!this.isConnected || !this.client) return { success: false, reason: 'offline' };
    try {
      const payload = {
        bin: item.bin,
        material_number: item.materialNumber,
        material_desc: item.materialDesc,
        batch_sap: item.batchSap,
        batch_fisik: item.batchFisik || item.batchSap,
        exp_date: item.expDate || null,
        qty_sap: item.qtySap || 0,
        picking_qty: item.pickingQty || 0,
        uom: item.uom || 'KG',
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.client
        .from('cc_items')
        .update(payload)
        .eq('id', item.id)
        .select();

      if (error) {
        console.warn('[Supabase Cloud] Update item master failed:', error);
        return { success: false, error };
      }
      console.log('[Supabase Cloud] Item master updated successfully:', item.id);
      return { success: true, data };
    } catch (err) {
      console.warn('[Supabase Cloud] Exception updating item master:', err);
      return { success: false, error: err };
    }
  }

  // Delete single item from Supabase cc_items
  async deleteItem(itemId) {
    if (!this.isConnected || !this.client) return { success: false, reason: 'offline' };
    try {
      const { error } = await this.client
        .from('cc_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        console.warn('[Supabase Cloud] Delete item failed:', error);
        return { success: false, error };
      }
      console.log('[Supabase Cloud] Item deleted successfully:', itemId);
      return { success: true };
    } catch (err) {
      console.warn('[Supabase Cloud] Exception deleting item:', err);
      return { success: false, error: err };
    }
  }

  // Clear all items from Supabase cc_items
  async clearAllItems() {
    if (!this.isConnected || !this.client) return { success: false, reason: 'offline' };
    try {
      const { error } = await this.client
        .from('cc_items')
        .delete()
        .neq('id', '___NEVER_MATCH___');

      if (error) {
        console.warn('[Supabase Cloud] Clear all items failed:', error);
        return { success: false, error };
      }
      console.log('[Supabase Cloud] All items cleared successfully');
      return { success: true };
    } catch (err) {
      console.warn('[Supabase Cloud] Exception clearing all items:', err);
      return { success: false, error: err };
    }
  }

  // Bulk upsert items into Supabase cc_items
  async bulkUpsertItems(items) {
    if (!this.isConnected || !this.client || !items || items.length === 0) return { success: false };
    try {
      const payloads = items.map(item => ({
        id: item.id,
        schedule_id: item.scheduleId || 'sched-2026-09-21-01',
        no: item.no,
        bin: item.bin,
        material_number: item.materialNumber,
        material_desc: item.materialDesc,
        batch_sap: item.batchSap,
        batch_fisik: item.batchFisik || item.batchSap,
        exp_date: item.expDate || null,
        uom: item.uom || 'KG',
        qty_sap: item.qtySap || 0,
        picking_qty: item.pickingQty || 0,
        actual_qty: item.actualQty !== null && item.actualQty !== undefined ? item.actualQty : null,
        unit_conversion: item.unitConversion || null,
        note: item.note || null,
        is_misplaced: Boolean(item.isMisplaced),
        new_bin: item.newBin || null,
        status: item.status || 'PENDING',
        counted_by: item.countedBy || null,
        counted_at: item.countedAt ? new Date(item.countedAt).toISOString() : null,
        updated_at: new Date().toISOString()
      }));

      const { error } = await this.client
        .from('cc_items')
        .upsert(payloads, { onConflict: 'id' });

      if (error) {
        console.warn('[Supabase Cloud] Bulk upsert items failed:', error);
        return { success: false, error };
      }
      console.log('[Supabase Cloud] Bulk upsert items succeeded:', payloads.length, 'records');
      return { success: true };
    } catch (err) {
      console.warn('[Supabase Cloud] Exception bulk upserting items:', err);
      return { success: false, error: err };
    }
  }

  // Save / update single item physical count result
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
        console.warn('[Supabase Cloud] Sync item failed:', error);
      } else {
        console.log('[Supabase Cloud] Item synced successfully:', item.id);
      }
    } catch (err) {
      console.warn('[Supabase Cloud] Error syncing item:', err);
    }
  }

  // Save / update system settings to Supabase cc_settings
  async syncSettings(sigMatrix, companyProfile, updatedBy = 'ADMIN') {
    if (!this.isConnected || !this.client) return { success: false, reason: 'offline' };

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

      // Try update first (primary row exists)
      const { data: updateData, error: updateError } = await this.client
        .from('cc_settings')
        .update(payload)
        .eq('id', 'default_settings')
        .select();

      if (!updateError && updateData && updateData.length > 0) {
        console.log('[Supabase Cloud] Settings updated successfully');
        return { success: true };
      }

      // If not exists yet, insert
      const { error: insertError } = await this.client
        .from('cc_settings')
        .insert(payload);

      if (insertError) {
        console.warn('[Supabase Cloud] Sync settings failed:', insertError);
        return { success: false, error: insertError };
      }

      console.log('[Supabase Cloud] Settings inserted successfully');
      return { success: true };
    } catch (err) {
      console.warn('[Supabase Cloud] Error syncing settings:', err);
      return { success: false, error: err };
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
