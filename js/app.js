// ==========================================================================
// RMPM Cycle Count System - Main Logic & State Controller
// ==========================================================================

const STORAGE_KEYS = {
  ITEMS: 'rmpm_cc_items_v1',
  SCHEDULE: 'rmpm_cc_schedule_v1',
  CURRENT_USER: 'rmpm_cc_user_v1'
};

class CycleCountApp {
  constructor() {
    this.items = [];
    this.schedule = {};
    this.users = INITIAL_USERS;
    this.currentUser = null;
    this.activeTab = 'view-dashboard';

    // Filters
    this.dashFilterBin = 'ALL';
    this.dashFilterStatus = 'ALL';
    this.dashSearchQuery = '';

    this.checkerFilterBin = 'ALL';
    this.checkerFilterStatus = 'ALL';
    this.checkerSearchQuery = '';

    // Active item being edited in modal
    this.activeEditItem = null;

    this.init();
  }

  async init() {
    this.loadState();
    this.bindEvents();
    this.renderUserBar();
    this.updateSupabaseStatusUi();
    this.renderDashboard();
    this.renderCheckerBinPills();
    this.renderCheckerCards();
    this.renderPrintout();

    // Initialize Supabase Sync if connected
    if (window.supabaseService && window.supabaseService.isConnected) {
      await this.initSupabaseSync();
    }
  }

  updateSupabaseStatusUi() {
    const dot = document.getElementById('sb-status-dot');
    const text = document.getElementById('sb-status-text');
    if (!dot || !text) return;

    if (window.supabaseService && window.supabaseService.isConnected) {
      dot.textContent = '🟢';
      text.textContent = 'Supabase: Online (Sync)';
      document.getElementById('btn-supabase-status').style.borderColor = '#16a34a';
      document.getElementById('btn-supabase-status').style.background = '#052e16';
    } else {
      dot.textContent = '🟡';
      text.textContent = 'Supabase: Setup URL';
      document.getElementById('btn-supabase-status').style.borderColor = '#0284c7';
      document.getElementById('btn-supabase-status').style.background = '#0c4a6e';
    }
  }

  async initSupabaseSync() {
    try {
      const cloudItems = await window.supabaseService.fetchItems();
      if (cloudItems && cloudItems.length > 0) {
        this.items = cloudItems;
        this.saveItems();
        this.renderDashboard();
        this.renderCheckerBinPills();
        this.renderCheckerCards();
        this.renderPrintout();
        console.log('[Supabase] Loaded items from cloud successfully.');
      }

      // Realtime listener
      window.supabaseService.subscribeToChanges((payload) => {
        if (payload.new && payload.new.id) {
          const idx = this.items.findIndex(i => i.id === payload.new.id);
          if (idx !== -1) {
            this.items[idx].actualQty = payload.new.actual_qty !== null ? parseFloat(payload.new.actual_qty) : null;
            this.items[idx].note = payload.new.note || '';
            this.items[idx].isMisplaced = !!payload.new.is_misplaced;
            this.items[idx].newBin = payload.new.new_bin || '';
            this.items[idx].status = payload.new.status || 'PENDING';
            this.items[idx].countedBy = payload.new.counted_by || '';
            this.saveItems();
            this.renderDashboard();
            this.renderCheckerCards();
            this.renderPrintout();
          }
        }
      });
    } catch (err) {
      console.warn('[Supabase Sync Error]', err);
    }
  }

  loadState() {
    // Load Items
    const storedItems = localStorage.getItem(STORAGE_KEYS.ITEMS);
    if (storedItems) {
      try {
        this.items = JSON.parse(storedItems);
      } catch (e) {
        this.items = [...INITIAL_ITEMS];
      }
    } else {
      this.items = [...INITIAL_ITEMS];
      this.saveItems();
    }

    // Load Schedule Metadata
    const storedSchedule = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
    if (storedSchedule) {
      try {
        this.schedule = JSON.parse(storedSchedule);
      } catch (e) {
        this.schedule = { ...INITIAL_SCHEDULE };
      }
    } else {
      this.schedule = { ...INITIAL_SCHEDULE };
      this.saveSchedule();
    }

    // Load Current User
    const storedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (storedUser) {
      const found = this.users.find(u => u.id === storedUser);
      this.currentUser = found || this.users[0];
    } else {
      this.currentUser = this.users[0]; // Default: SPV Asep
    }

    // Update Header Metadata
    document.getElementById('header-schedule-date').textContent = this.schedule.scheduleDate;
    document.getElementById('header-schedule-area').textContent = this.schedule.areaName;
    document.getElementById('header-schedule-spv').textContent = this.schedule.spvName;
  }

  saveItems() {
    localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(this.items));
  }

  saveSchedule() {
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(this.schedule));
  }

  saveUser() {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, this.currentUser.id);
  }

  // ================= Event Listeners =================
  bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetView = tab.getAttribute('data-target');
        this.switchView(targetView);
      });
    });

    // User Switcher Modal Trigger
    document.getElementById('btn-open-user-modal').addEventListener('click', () => {
      this.openUserModal();
    });

    // Close Modals
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        document.getElementById(modalId).style.display = 'none';
      });
    });

    // Close modal on clicking overlay backdrop
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.style.display = 'none';
        }
      });
    });

    // Dashboard Search & Filters
    document.getElementById('dash-search-input').addEventListener('input', (e) => {
      this.dashSearchQuery = e.target.value.toLowerCase().trim();
      this.renderDashboardTable();
    });

    document.getElementById('dash-filter-bin').addEventListener('change', (e) => {
      this.dashFilterBin = e.target.value;
      this.renderDashboardTable();
    });

    document.getElementById('dash-filter-status').addEventListener('change', (e) => {
      this.dashFilterStatus = e.target.value;
      this.renderDashboardTable();
    });

    // Checker Search & Filter
    document.getElementById('checker-search-input').addEventListener('input', (e) => {
      this.checkerSearchQuery = e.target.value.toLowerCase().trim();
      this.renderCheckerCards();
    });

    document.getElementById('checker-status-filter').addEventListener('change', (e) => {
      this.checkerFilterStatus = e.target.value;
      this.renderCheckerCards();
    });

    // Export & Reset
    document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCsv());
    document.getElementById('btn-reset-demo').addEventListener('click', () => this.resetDemoData());
    document.getElementById('btn-go-to-print').addEventListener('click', () => this.switchView('view-printout'));
    document.getElementById('btn-back-to-dash').addEventListener('click', () => this.switchView('view-dashboard'));

    // Modal Checker Input Events
    document.getElementById('check-is-misplaced').addEventListener('change', (e) => {
      document.getElementById('misplaced-input-box').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('btn-apply-calc').addEventListener('click', () => {
      this.applyPackagingCalculator();
    });

    document.getElementById('btn-save-checker-input').addEventListener('click', () => {
      this.saveCheckerItemInput();
    });

    // Supabase Cloud Configuration Modal Events
    document.getElementById('btn-supabase-status').addEventListener('click', () => {
      document.getElementById('cfg-supabase-url').value = localStorage.getItem('rmpm_supabase_url') || '';
      document.getElementById('modal-supabase-config').style.display = 'flex';
    });

    document.getElementById('btn-save-supabase-config').addEventListener('click', async () => {
      const urlInput = document.getElementById('cfg-supabase-url').value.trim();
      if (!urlInput) {
        alert('Masukkan URL Supabase yang valid (contoh: https://xyz.supabase.co)!');
        return;
      }
      if (window.supabaseService) {
        window.supabaseService.setUrl(urlInput);
        this.updateSupabaseStatusUi();
        await this.initSupabaseSync();
      }
      document.getElementById('modal-supabase-config').style.display = 'none';
      alert('Koneksi Supabase berhasil diperbarui!');
    });

    // Import SAP Events
    document.getElementById('btn-process-import').addEventListener('click', () => {
      this.processSapImport();
    });
    document.getElementById('btn-cancel-import').addEventListener('click', () => {
      this.switchView('view-dashboard');
    });
  }

  // ================= Role & User Management =================
  renderUserBar() {
    if (!this.currentUser) return;
    document.getElementById('user-avatar-initial').textContent = this.currentUser.name.charAt(0);
    document.getElementById('current-user-name').textContent = this.currentUser.name;
    document.getElementById('current-user-role').textContent = this.currentUser.badge;
  }

  openUserModal() {
    const container = document.getElementById('users-list-container');
    container.innerHTML = '';

    this.users.forEach(u => {
      const isCurrent = u.id === this.currentUser.id;
      const card = document.createElement('div');
      card.style.cssText = `
        border: 1px solid ${isCurrent ? 'var(--brand-primary)' : 'var(--border-color)'};
        background-color: ${isCurrent ? '#f0f9ff' : '#ffffff'};
        padding: 0.65rem 0.85rem;
        border-radius: var(--radius-sm);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
      `;

      card.innerHTML = `
        <div>
          <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">${u.name}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${u.title} &bull; <strong>${u.badge}</strong></div>
        </div>
        <div>
          ${isCurrent ? '<span style="font-size: 0.7rem; color: var(--brand-primary); font-weight: 700;">AKTIF</span>' : '<button class="btn btn-secondary btn-sm" style="font-size: 0.7rem;">Pilih</button>'}
        </div>
      `;

      card.addEventListener('click', () => {
        this.currentUser = u;
        this.saveUser();
        this.renderUserBar();
        document.getElementById('modal-user-switcher').style.display = 'none';

        // Auto adjust view recommendation based on role
        if (u.role === 'CHECKER') {
          this.switchView('view-checker');
        } else {
          this.switchView('view-dashboard');
        }
      });

      container.appendChild(card);
    });

    document.getElementById('modal-user-switcher').style.display = 'flex';
  }

  switchView(viewId) {
    this.activeTab = viewId;

    // Toggle active nav tab
    document.querySelectorAll('.nav-tab').forEach(t => {
      if (t.getAttribute('data-target') === viewId) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    // Toggle active section
    document.querySelectorAll('.view-section').forEach(s => {
      if (s.id === viewId) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });

    // Re-render target
    if (viewId === 'view-dashboard') {
      this.renderDashboard();
    } else if (viewId === 'view-checker') {
      this.renderCheckerCards();
    } else if (viewId === 'view-printout') {
      this.renderPrintout();
    }
  }

  // ================= KPI Calculations =================
  getKpiMetrics() {
    const total = this.items.length;
    let counted = 0;
    let matched = 0;
    let discrepancy = 0;
    let misplaced = 0;
    let totalSapKg = 0;
    let totalActualKg = 0;
    let netVarianceKg = 0;

    this.items.forEach(item => {
      const targetNet = item.qtySap - (item.pickingQty || 0);
      totalSapKg += item.qtySap;

      if (item.actualQty !== null && item.actualQty !== undefined) {
        counted++;
        totalActualKg += item.actualQty;
        const diff = item.actualQty - targetNet;
        netVarianceKg += diff;

        if (Math.abs(diff) < 0.001) {
          matched++;
        } else {
          discrepancy++;
        }
      }

      if (item.isMisplaced) {
        misplaced++;
      }
    });

    const pending = total - counted;
    const iraRate = total > 0 ? ((matched / total) * 100).toFixed(1) : '0.0';
    const progressRate = total > 0 ? ((counted / total) * 100).toFixed(0) : '0';

    return {
      total,
      counted,
      pending,
      matched,
      discrepancy,
      misplaced,
      totalSapKg: totalSapKg.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      netVarianceKg: (netVarianceKg >= 0 ? '+' : '') + netVarianceKg.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      iraRate,
      progressRate
    };
  }

  // ================= Dashboard Rendering =================
  renderDashboard() {
    const kpi = this.getKpiMetrics();

    // Update KPIs
    document.getElementById('kpi-total-items').textContent = kpi.total;
    document.getElementById('kpi-total-sap-weight').textContent = `Total SAP: ${kpi.totalSapKg} KG`;
    document.getElementById('kpi-ira-rate').textContent = `${kpi.iraRate}%`;
    document.getElementById('kpi-ira-count').textContent = `(${kpi.matched} Cocok)`;
    document.getElementById('kpi-discrepancy-items').textContent = kpi.discrepancy;
    document.getElementById('kpi-net-variance').textContent = `Net Selisih: ${kpi.netVarianceKg} KG`;
    document.getElementById('kpi-progress-rate').textContent = `${kpi.progressRate}%`;
    document.getElementById('kpi-progress-fraction').textContent = `(${kpi.counted} / ${kpi.total})`;
    document.getElementById('kpi-pending-items').textContent = `${kpi.pending} item menunggu hitung`;
    document.getElementById('kpi-misplaced-count').textContent = kpi.misplaced;

    // Badges in tabs
    document.getElementById('tab-total-badge').textContent = kpi.total;
    document.getElementById('tab-pending-badge').textContent = kpi.pending;

    this.renderDashboardTable();
  }

  renderDashboardTable() {
    const tbody = document.getElementById('master-table-body');
    tbody.innerHTML = '';

    const filtered = this.getFilteredItems(this.dashFilterBin, this.dashFilterStatus, this.dashSearchQuery);

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="16" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            Tidak ada item yang sesuai dengan filter atau kata kunci pencarian.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach((item, idx) => {
      const targetNet = item.qtySap - (item.pickingQty || 0);
      const isCounted = item.actualQty !== null && item.actualQty !== undefined;
      const variance = isCounted ? (item.actualQty - targetNet) : null;
      const isDiff = isCounted && Math.abs(variance) >= 0.001;

      const tr = document.createElement('tr');
      if (isDiff) tr.classList.add('row-discrepancy');
      if (item.isMisplaced) tr.classList.add('row-misplaced');

      let varianceHtml = '<span style="color: var(--text-muted);">-</span>';
      if (isCounted) {
        if (Math.abs(variance) < 0.001) {
          varianceHtml = '<span class="variance-zero">0.000</span>';
        } else if (variance > 0) {
          varianceHtml = `<span class="variance-pos">+${variance.toFixed(3)}</span>`;
        } else {
          varianceHtml = `<span class="variance-neg">${variance.toFixed(3)}</span>`;
        }
      }

      let statusBadge = '<span class="badge badge-pending">PENDING</span>';
      if (isCounted) {
        if (isDiff) {
          statusBadge = '<span class="badge badge-discrepancy">SELISIH</span>';
        } else {
          statusBadge = '<span class="badge badge-matched">COCOK</span>';
        }
      }
      if (item.isMisplaced) {
        statusBadge += ` <span class="badge badge-misplaced" title="Pindah ke ${item.newBin}">PINDAH</span>`;
      }

      tr.innerHTML = `
        <td class="text-center font-mono">${item.no || idx + 1}</td>
        <td><span class="badge-bin">${item.bin}</span></td>
        <td class="font-mono">${item.materialNumber}</td>
        <td>
          <div style="font-weight: 600;">${item.materialDesc}</div>
          ${item.unitConversion ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${item.unitConversion}</div>` : ''}
        </td>
        <td class="font-mono">${item.batchSap}</td>
        <td class="font-mono" style="color: #0369a1; font-weight: 600;">${item.batchFisik}</td>
        <td class="font-mono">${item.expDate}</td>
        <td class="text-center">${item.uom}</td>
        <td class="text-right font-mono">${item.qtySap.toFixed(3)}</td>
        <td class="text-right font-mono" style="color: ${item.pickingQty > 0 ? '#b45309' : 'inherit'};">${item.pickingQty.toFixed(3)}</td>
        <td class="text-right font-mono" style="font-weight: 700;">${targetNet.toFixed(3)}</td>
        <td class="text-right font-mono" style="font-weight: 700; color: ${isDiff ? 'var(--status-discrepancy)' : 'var(--text-main)'};">
          ${isCounted ? item.actualQty.toFixed(3) : '<em style="color:#94a3b8">Belum</em>'}
        </td>
        <td class="text-right font-mono">${varianceHtml}</td>
        <td class="text-center">${statusBadge}</td>
        <td style="font-size: 0.75rem;">
          ${item.note || '-'}
          ${item.isMisplaced && item.newBin ? `<div style="color: var(--status-misplaced); font-weight: 600;">↳ Lokasi baru: ${item.newBin}</div>` : ''}
        </td>
        <td class="text-center">
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${item.id}" title="Edit Fisik">✏️ Edit</button>
        </td>
      `;

      tr.querySelector('[data-action="edit"]').addEventListener('click', () => {
        this.openCheckerInputModal(item);
      });

      tbody.appendChild(tr);
    });
  }

  // ================= Checker View Rendering =================
  renderCheckerBinPills() {
    const scroller = document.getElementById('checker-bin-pills');
    scroller.innerHTML = '';

    // Collect unique zones (e.g., B.01A, B.01B, B.02A, B.02B)
    const binsSet = new Set();
    this.items.forEach(i => {
      const parts = i.bin.split('.');
      if (parts.length >= 2) {
        binsSet.add(`${parts[0]}.${parts[1]}`);
      } else {
        binsSet.add(i.bin);
      }
    });

    const allBtn = document.createElement('button');
    allBtn.className = `bin-pill-btn ${this.checkerFilterBin === 'ALL' ? 'active' : ''}`;
    allBtn.textContent = 'Semua Rak / BIN';
    allBtn.addEventListener('click', () => {
      this.checkerFilterBin = 'ALL';
      this.renderCheckerBinPills();
      this.renderCheckerCards();
    });
    scroller.appendChild(allBtn);

    Array.from(binsSet).sort().forEach(zone => {
      const btn = document.createElement('button');
      btn.className = `bin-pill-btn ${this.checkerFilterBin === zone ? 'active' : ''}`;
      btn.textContent = `Rak ${zone}`;
      btn.addEventListener('click', () => {
        this.checkerFilterBin = zone;
        this.renderCheckerBinPills();
        this.renderCheckerCards();
      });
      scroller.appendChild(btn);
    });
  }

  renderCheckerCards() {
    const container = document.getElementById('checker-cards-container');
    container.innerHTML = '';

    const filtered = this.getFilteredItems(this.checkerFilterBin, this.checkerFilterStatus, this.checkerSearchQuery);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: #ffffff; border-radius: var(--radius-md); border: 1px dashed var(--border-color); color: var(--text-muted);">
          <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">Tidak ada item pada filter ini</p>
          <p style="font-size: 0.85rem;">Coba pilih zona rak lain atau bersihkan kata kunci pencarian barcode/material.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const targetNet = item.qtySap - (item.pickingQty || 0);
      const isCounted = item.actualQty !== null && item.actualQty !== undefined;
      const isDiff = isCounted && Math.abs(item.actualQty - targetNet) >= 0.001;

      let cardClass = 'count-card card-pending';
      let statusBadge = '<span class="badge badge-pending">BELUM HITUNG</span>';

      if (isCounted) {
        if (isDiff) {
          cardClass = 'count-card card-discrepancy';
          statusBadge = '<span class="badge badge-discrepancy">SELISIH</span>';
        } else {
          cardClass = 'count-card card-matched';
          statusBadge = '<span class="badge badge-matched">COCOK</span>';
        }
      }

      const card = document.createElement('div');
      card.className = cardClass;

      card.innerHTML = `
        <div>
          <div class="card-header-row">
            <span class="badge-bin">${item.bin}</span>
            <div>${statusBadge}</div>
          </div>

          <div class="card-material-name">${item.materialDesc}</div>
          <div class="card-material-code">Kode: ${item.materialNumber} &bull; UoM: <strong>${item.uom}</strong></div>

          <div class="card-details-grid">
            <div class="detail-item">
              <span>Batch SAP:</span>
              <strong>${item.batchSap}</strong>
            </div>
            <div class="detail-item">
              <span>Batch Fisik / Vendor:</span>
              <strong style="color: #0284c7;">${item.batchFisik}</strong>
            </div>
            <div class="detail-item">
              <span>Expired Date:</span>
              <strong>${item.expDate}</strong>
            </div>
            <div class="detail-item">
              <span>Picking Reservasi:</span>
              <strong style="color: ${item.pickingQty > 0 ? '#b45309' : '#0f172a'}">${item.pickingQty.toFixed(1)} ${item.uom}</strong>
            </div>
          </div>

          <div class="card-qty-row">
            <div class="qty-target">
              Target Bersih (SAP - Pick):<br>
              <strong>${targetNet.toFixed(3)} ${item.uom}</strong>
            </div>
            <div class="qty-actual">
              Fisik Aktual:<br>
              <strong>${isCounted ? item.actualQty.toFixed(3) + ' ' + item.uom : '<span style="color:#94a3b8">-</span>'}</strong>
            </div>
          </div>

          ${item.note ? `<div class="card-note-box">📝 ${item.note}</div>` : ''}
          ${item.isMisplaced && item.newBin ? `<div class="card-note-box" style="background-color: var(--status-misplaced-bg); border-color: var(--status-misplaced); color: var(--status-misplaced);">📦 Pindah ke Lokasi: <strong>${item.newBin}</strong></div>` : ''}
        </div>

        <div class="card-action-bar">
          <button class="btn btn-success btn-sm" data-action="quick-match" data-id="${item.id}" title="Jika fisik sesuai target SAP">
            ✅ Cocok (${targetNet.toFixed(0)})
          </button>
          <button class="btn btn-secondary btn-sm" data-action="input-detail" data-id="${item.id}" title="Input angka fisik / selisih / konversi kemasan">
            ✏️ Input Fisik
          </button>
        </div>
      `;

      card.querySelector('[data-action="quick-match"]').addEventListener('click', () => {
        this.quickMatchItem(item);
      });

      card.querySelector('[data-action="input-detail"]').addEventListener('click', () => {
        this.openCheckerInputModal(item);
      });

      container.appendChild(card);
    });
  }

  quickMatchItem(item) {
    const targetNet = item.qtySap - (item.pickingQty || 0);
    item.actualQty = targetNet;
    item.status = 'MATCHED';
    item.note = item.note || 'Fisik utuh sesuai target SAP';
    item.countedBy = this.currentUser.name;
    item.countedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

    this.saveItems();
    if (window.supabaseService) {
      window.supabaseService.syncItem(item);
    }
    this.renderDashboard();
    this.renderCheckerCards();
    this.renderPrintout();
  }

  // ================= Modal Checker Input & Packaging Calculator =================
  openCheckerInputModal(item) {
    this.activeEditItem = item;
    const targetNet = item.qtySap - (item.pickingQty || 0);

    document.getElementById('modal-item-title').textContent = `Input Fisik: ${item.bin}`;
    document.getElementById('m-item-bin').textContent = item.bin;
    document.getElementById('m-item-batch-fisik').textContent = item.batchFisik;
    document.getElementById('m-item-desc').textContent = item.materialDesc;
    document.getElementById('m-item-code').textContent = item.materialNumber;
    document.getElementById('m-item-sap').textContent = item.qtySap.toFixed(3);
    document.getElementById('m-item-picking').textContent = item.pickingQty.toFixed(3);
    document.getElementById('m-item-net').textContent = targetNet.toFixed(3);

    // Form inputs
    document.getElementById('input-actual-qty').value = item.actualQty !== null ? item.actualQty : '';
    document.getElementById('check-is-misplaced').checked = !!item.isMisplaced;
    document.getElementById('misplaced-input-box').style.display = item.isMisplaced ? 'block' : 'none';
    document.getElementById('input-new-bin').value = item.newBin || '';
    document.getElementById('input-item-note').value = item.note || '';

    // Clear calc fields
    document.getElementById('calc-pack-qty').value = '';
    document.getElementById('calc-pack-partial').value = '';

    document.getElementById('modal-checker-input').style.display = 'flex';
  }

  applyPackagingCalculator() {
    const packType = document.getElementById('calc-pack-type').value;
    const packQty = parseFloat(document.getElementById('calc-pack-qty').value) || 0;
    const partialKg = parseFloat(document.getElementById('calc-pack-partial').value) || 0;

    let packWeight = parseFloat(packType);
    if (isNaN(packWeight)) {
      const customPrompt = prompt('Masukkan berat standar per kemasan (KG):', '25');
      packWeight = parseFloat(customPrompt) || 25;
    }

    const calculatedTotal = (packQty * packWeight) + partialKg;
    document.getElementById('input-actual-qty').value = calculatedTotal.toFixed(3);

    // Auto set description note
    const currentNote = document.getElementById('input-item-note').value;
    if (!currentNote) {
      document.getElementById('input-item-note').value = `${packQty} Kemasan (@${packWeight}kg)${partialKg > 0 ? ' + ' + partialKg + ' kg sisa' : ''}`;
    }
  }

  saveCheckerItemInput() {
    if (!this.activeEditItem) return;

    const actualVal = document.getElementById('input-actual-qty').value.trim();
    if (actualVal === '') {
      alert('Kuantitas fisik aktual harus diisi!');
      return;
    }

    const actualQty = parseFloat(actualVal);
    const isMisplaced = document.getElementById('check-is-misplaced').checked;
    const newBin = document.getElementById('input-new-bin').value.trim();
    const note = document.getElementById('input-item-note').value.trim();

    const targetNet = this.activeEditItem.qtySap - (this.activeEditItem.pickingQty || 0);

    this.activeEditItem.actualQty = actualQty;
    this.activeEditItem.isMisplaced = isMisplaced;
    this.activeEditItem.newBin = isMisplaced ? newBin : '';
    this.activeEditItem.note = note;
    this.activeEditItem.countedBy = this.currentUser.name;
    this.activeEditItem.countedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

    if (Math.abs(actualQty - targetNet) < 0.001) {
      this.activeEditItem.status = 'MATCHED';
    } else {
      this.activeEditItem.status = 'DISCREPANCY';
    }

    this.saveItems();
    if (window.supabaseService) {
      window.supabaseService.syncItem(this.activeEditItem);
    }
    document.getElementById('modal-checker-input').style.display = 'none';

    this.renderDashboard();
    this.renderCheckerCards();
    this.renderPrintout();
  }

  // ================= Official Printout (Berita Acara) Rendering =================
  renderPrintout() {
    const kpi = this.getKpiMetrics();

    document.getElementById('print-doc-no').textContent = this.schedule.docNo;
    document.getElementById('print-date').textContent = this.schedule.scheduleDate;
    document.getElementById('print-spv').textContent = this.schedule.spvName;
    document.getElementById('print-area').textContent = this.schedule.areaName;

    document.getElementById('print-sum-total').textContent = kpi.total;
    document.getElementById('print-sum-matched').textContent = kpi.matched;
    document.getElementById('print-sum-diff').textContent = kpi.discrepancy;
    document.getElementById('print-sum-ira').textContent = `${kpi.iraRate}%`;

    const tbody = document.getElementById('print-table-body');
    tbody.innerHTML = '';

    this.items.forEach((item, idx) => {
      const targetNet = item.qtySap - (item.pickingQty || 0);
      const isCounted = item.actualQty !== null && item.actualQty !== undefined;
      const variance = isCounted ? (item.actualQty - targetNet) : 0;
      const isDiff = isCounted && Math.abs(variance) >= 0.001;

      const tr = document.createElement('tr');
      if (isDiff) {
        tr.classList.add('highlight-diff');
      }

      let statusText = 'PENDING';
      if (isCounted) {
        statusText = isDiff ? 'SELISIH' : 'MATCH';
      }

      let varText = '-';
      if (isCounted) {
        varText = (variance >= 0 ? '+' : '') + variance.toFixed(3);
      }

      let remark = item.note || '-';
      if (item.isMisplaced && item.newBin) {
        remark += ` [Pindah ke ${item.newBin}]`;
      }

      tr.innerHTML = `
        <td style="text-align: center;">${item.no || idx + 1}</td>
        <td><strong>${item.bin}</strong></td>
        <td>${item.materialNumber}</td>
        <td>${item.materialDesc}</td>
        <td>${item.batchSap}</td>
        <td style="font-weight: 600;">${item.batchFisik}</td>
        <td>${item.expDate}</td>
        <td style="text-align: center;">${item.uom}</td>
        <td style="text-align: right;">${item.qtySap.toFixed(2)}</td>
        <td style="text-align: right;">${item.pickingQty.toFixed(2)}</td>
        <td style="text-align: right; font-weight: 700;">${targetNet.toFixed(2)}</td>
        <td style="text-align: right; font-weight: 700;">${isCounted ? item.actualQty.toFixed(2) : '-'}</td>
        <td style="text-align: right; font-weight: 700; color: ${isDiff ? '#b91c1c' : '#000000'};">${varText}</td>
        <td style="text-align: center; font-weight: 700;">${statusText}</td>
        <td style="font-size: 7pt;">${remark}</td>
      `;

      tbody.appendChild(tr);
    });
  }

  // ================= Filter Logic Helper =================
  getFilteredItems(filterBin, filterStatus, query) {
    return this.items.filter(item => {
      // 1. Bin Filter
      if (filterBin && filterBin !== 'ALL') {
        if (!item.bin.startsWith(filterBin)) {
          return false;
        }
      }

      // 2. Status Filter
      if (filterStatus && filterStatus !== 'ALL') {
        const targetNet = item.qtySap - (item.pickingQty || 0);
        const isCounted = item.actualQty !== null && item.actualQty !== undefined;
        const isDiff = isCounted && Math.abs(item.actualQty - targetNet) >= 0.001;

        if (filterStatus === 'DISCREPANCY' && !isDiff) return false;
        if (filterStatus === 'MATCHED' && (!isCounted || isDiff)) return false;
        if (filterStatus === 'PENDING' && isCounted) return false;
        if (filterStatus === 'MISPLACED' && !item.isMisplaced) return false;
      }

      // 3. Search Query
      if (query) {
        const targetStr = [
          item.bin,
          item.materialNumber,
          item.materialDesc,
          item.batchSap,
          item.batchFisik,
          item.note || ''
        ].join(' ').toLowerCase();

        if (!targetStr.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }

  // ================= Import SAP Data Handler =================
  processSapImport() {
    const rawText = document.getElementById('import-text-data').value.trim();
    if (!rawText) {
      alert('Silakan tempel (paste) data terlebih dahulu!');
      return;
    }

    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const newItems = [];

    lines.forEach((line, index) => {
      // Split by tab or multiple spaces / comma
      let cols = line.split('\t');
      if (cols.length < 5) {
        cols = line.split(/[\;,]/);
      }

      if (cols.length >= 7) {
        // Assume format: BIN, Material Number, Batch SAP, Batch Fisik, Exp Date, Material Description, UoM, Qty SAP, Picking Qty
        const bin = cols[0] ? cols[0].trim() : `B.01A.${index + 1}`;
        const matNum = cols[1] ? cols[1].trim() : '40000000';
        const batchSap = cols[2] ? cols[2].trim() : '-';
        const batchFisik = cols[3] ? cols[3].trim() : '-';
        const expDate = cols[4] ? cols[4].trim() : '-';
        const desc = cols[5] ? cols[5].trim() : 'MATERIAL RAW/PACKAGING';
        const uom = cols[6] ? cols[6].trim().toUpperCase() : 'KG';
        const qtySap = cols[7] ? parseFloat(cols[7].replace(/,/g, '')) || 0 : 0;
        const pickQty = cols[8] ? parseFloat(cols[8].replace(/,/g, '')) || 0 : 0;

        newItems.push({
          id: 'imported-' + Date.now() + '-' + index,
          no: index + 1,
          bin,
          materialNumber: matNum,
          batchSap,
          batchFisik,
          expDate,
          materialDesc: desc,
          uom,
          qtySap,
          pickingQty: pickQty,
          actualQty: null,
          unitConversion: '',
          note: '',
          isMisplaced: false,
          newBin: '',
          status: 'PENDING',
          countedBy: '',
          countedAt: ''
        });
      }
    });

    if (newItems.length === 0) {
      alert('Format data tidak sesuai. Pastikan kolom dipisahkan oleh Tab dari Excel.');
      return;
    }

    if (confirm(`Berhasil membaca ${newItems.length} baris data SAP. Apakah Anda ingin mengganti jadwal aktif saat ini?`)) {
      this.items = newItems;
      this.saveItems();
      document.getElementById('import-text-data').value = '';
      alert('Data jadwal cycle count berhasil dimuat!');
      this.switchView('view-dashboard');
      this.renderCheckerBinPills();
    }
  }

  // ================= Export to CSV =================
  exportCsv() {
    const headers = [
      'No',
      'BIN',
      'Kode Material',
      'Deskripsi Material',
      'Batch SAP',
      'Batch Fisik',
      'Exp Date',
      'UoM',
      'Qty Base On SAP',
      'Picking Qty',
      'Target Net Qty',
      'Fisik Aktual',
      'Variance',
      'Status',
      'Catatan',
      'Pindah Lokasi',
      'Petugas Hitung',
      'Waktu Hitung'
    ];

    const rows = this.items.map((item, idx) => {
      const targetNet = item.qtySap - (item.pickingQty || 0);
      const isCounted = item.actualQty !== null && item.actualQty !== undefined;
      const variance = isCounted ? (item.actualQty - targetNet) : '';

      return [
        item.no || idx + 1,
        `"${item.bin}"`,
        `"${item.materialNumber}"`,
        `"${item.materialDesc.replace(/"/g, '""')}"`,
        `"${item.batchSap}"`,
        `"${item.batchFisik}"`,
        `"${item.expDate}"`,
        item.uom,
        item.qtySap,
        item.pickingQty,
        targetNet,
        isCounted ? item.actualQty : '',
        variance,
        item.status,
        `"${(item.note || '').replace(/"/g, '""')}"`,
        `"${item.isMisplaced ? item.newBin : ''}"`,
        `"${item.countedBy || ''}"`,
        `"${item.countedAt || ''}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Hasil_Cycle_Count_RMPM_${this.schedule.scheduleDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ================= Reset Data Demo =================
  resetDemoData() {
    if (confirm('Apakah Anda yakin ingin mereset data kembali ke contoh formulir fisik awal?')) {
      this.items = [...INITIAL_ITEMS];
      this.schedule = { ...INITIAL_SCHEDULE };
      this.saveItems();
      this.saveSchedule();
      this.renderDashboard();
      this.renderCheckerBinPills();
      this.renderCheckerCards();
      this.renderPrintout();
      alert('Data telah direset ke contoh lembar fisik awal.');
    }
  }
}

// Initialize Application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new CycleCountApp();
});
