// ==========================================================================
// RMPM Cycle Count System - Unified Navbar & Dual Theme Controller
// Built for Warehouse Floor Scanners & Desktop Reconciliation Dashboard
// Default Theme: LIGHT THEME (Crisp, High-Contrast, Legible in Dark & Light)
// ==========================================================================

const STORAGE_KEYS = {
  ITEMS: 'rmpm_cc_items_v1',
  SCHEDULE: 'rmpm_cc_schedule_v1',
  CURRENT_USER: 'rmpm_cc_user_v1',
  THEME: 'rmpm_theme'
};

class CycleCountApp {
  constructor() {
    this.items = [];
    this.schedule = {};
    this.users = INITIAL_USERS;
    this.currentUser = null;
    this.activeTab = 'view-dashboard'; // Default desktop view: Table Editor

    // Mobile Location & Guided Walkthrough State
    this.uniqueBins = [];
    this.currentBinIndex = 0;
    this.currentItemIndexInBin = 0;
    this.isFocusMode = true; // Guided single-item Zebra style
    this.activePackWeight = 25; // default 25 KG per Sak

    // Filters & Search
    this.searchQuery = '';
    this.activeEditItem = null;

    this.init();
  }

  async init() {
    this.initTheme();
    this.loadState();
    this.calculateUniqueBins();
    this.bindEvents();
    this.renderUserBar();
    this.updateSupabaseStatusUi();
    this.renderActiveBinView();
    this.renderDashboard();
    this.renderPrintout();

    // Default to checker view on small handheld screens
    if (window.innerWidth <= 768) {
      this.switchView('view-checker');
    }

    // Automatic Supabase Real-time connection
    if (window.supabaseService && window.supabaseService.isConnected) {
      await this.initSupabaseSync();
    }
  }

  // ================= 1. THEME CONTROLLER (DEFAULT LIGHT, HIGH CONTRAST DARK) =================
  initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
    this.applyTheme(savedTheme);
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);

    const icon = document.getElementById('theme-toggle-icon');
    if (icon) {
      // If current is dark, show sun (to switch to light); if light, show moon
      icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  // ================= 2. STATE PERSISTENCE =================
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

    // Load Current User (Default: Supervisor Asep on desktop, Checker on mobile)
    const storedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (storedUser) {
      const found = this.users.find(u => u.id === storedUser);
      this.currentUser = found || this.users[0];
    } else {
      this.currentUser = window.innerWidth <= 768 ? this.users[1] : this.users[0];
    }
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

  // ================= 3. UNIQUE BIN CALCULATIONS =================
  calculateUniqueBins() {
    const set = new Set();
    this.items.forEach(i => {
      if (i.bin) set.add(i.bin);
    });
    this.uniqueBins = Array.from(set);
    if (this.currentBinIndex >= this.uniqueBins.length) {
      this.currentBinIndex = 0;
    }
  }

  getCurrentBin() {
    return this.uniqueBins[this.currentBinIndex] || (this.items[0] ? this.items[0].bin : 'B.01A.1.01');
  }

  getItemsInCurrentBin() {
    const currentBin = this.getCurrentBin();
    return this.items.filter(i => i.bin === currentBin);
  }

  // ================= 4. EVENT LISTENERS =================
  bindEvents() {
    // 1. Unified Top Navbar & Mobile Bottom Nav Buttons
    document.querySelectorAll('.nav-link-btn, .bnav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-target');
        if (targetView) {
          this.switchView(targetView);
        }
      });
    });

    // 2. Theme Toggle Button
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // 3. Dashboard Search & Filters
    const dashSearch = document.getElementById('dash-search-input');
    if (dashSearch) {
      dashSearch.addEventListener('input', () => this.renderDashboard());
    }
    const dashBin = document.getElementById('dash-filter-bin');
    if (dashBin) {
      dashBin.addEventListener('change', () => this.renderDashboard());
    }
    const dashStatus = document.getElementById('dash-filter-status');
    if (dashStatus) {
      dashStatus.addEventListener('change', () => this.renderDashboard());
    }

    // 4. BIN Steppers (◀ / ▶)
    document.getElementById('btn-prev-bin').addEventListener('click', () => {
      if (this.currentBinIndex > 0) {
        this.currentBinIndex--;
        this.currentItemIndexInBin = 0;
        this.renderActiveBinView();
      }
    });

    document.getElementById('btn-next-bin').addEventListener('click', () => {
      if (this.currentBinIndex < this.uniqueBins.length - 1) {
        this.currentBinIndex++;
        this.currentItemIndexInBin = 0;
        this.renderActiveBinView();
      }
    });

    // 5. Mode Toggle (🎯 Focus vs 📋 List)
    document.getElementById('btn-toggle-focus-mode').addEventListener('click', () => {
      this.isFocusMode = !this.isFocusMode;
      const btn = document.getElementById('btn-toggle-focus-mode');
      if (this.isFocusMode) {
        btn.textContent = '🎯 Mode Fokus';
      } else {
        btn.textContent = '📋 Mode List';
      }
      this.renderActiveBinView();
    });

    // 6. Mobile Barcode & Search
    document.getElementById('mobile-barcode-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      this.searchQuery = q;
      this.handleSearchOrBarcode(q);
    });

    // 7. Focus Item Steppers (Item Prev / Item Next in same BIN)
    document.getElementById('fc-prev-item').addEventListener('click', () => {
      if (this.currentItemIndexInBin > 0) {
        this.currentItemIndexInBin--;
        this.renderFocusWalkthrough();
      }
    });

    document.getElementById('fc-next-item').addEventListener('click', () => {
      const binItems = this.getItemsInCurrentBin();
      if (this.currentItemIndexInBin < binItems.length - 1) {
        this.currentItemIndexInBin++;
        this.renderFocusWalkthrough();
      }
    });

    // 8. Focus Item Quick Match Button
    document.getElementById('fc-btn-match').addEventListener('click', () => {
      const binItems = this.getItemsInCurrentBin();
      const currentItem = binItems[this.currentItemIndexInBin];
      if (currentItem) {
        this.quickMatchItem(currentItem);
      }
    });

    // 9. Focus Item Open Input & Packaging Calc
    document.getElementById('fc-btn-input-calc').addEventListener('click', () => {
      const binItems = this.getItemsInCurrentBin();
      const currentItem = binItems[this.currentItemIndexInBin];
      if (currentItem) {
        this.openCheckerInputModal(currentItem);
      }
    });

    // 10. Focus Item Misplaced Quick Trigger
    document.getElementById('fc-btn-misplaced').addEventListener('click', () => {
      const binItems = this.getItemsInCurrentBin();
      const currentItem = binItems[this.currentItemIndexInBin];
      if (currentItem) {
        this.openCheckerInputModal(currentItem, true);
      }
    });

    // 11. Modal Close Buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
      });
    });

    // 12. User Switcher Modal
    document.getElementById('btn-open-user-modal').addEventListener('click', () => {
      this.openUserModal();
    });

    // 13. Supabase Config Modal & Auto-Connect
    document.getElementById('btn-supabase-status').addEventListener('click', () => {
      document.getElementById('cfg-supabase-url').value = localStorage.getItem('rmpm_supabase_url') || APP_CONFIG.SUPABASE_URL || '';
      document.getElementById('modal-supabase-config').style.display = 'flex';
    });

    document.getElementById('btn-save-supabase-config').addEventListener('click', async () => {
      const urlInput = document.getElementById('cfg-supabase-url').value.trim();
      if (!urlInput) {
        alert('Masukkan URL Supabase yang valid (contoh: https://xxxxxxxx.supabase.co)');
        return;
      }
      if (window.supabaseService) {
        window.supabaseService.setUrl(urlInput);
        this.updateSupabaseStatusUi();
        await this.initSupabaseSync();
      }
      document.getElementById('modal-supabase-config').style.display = 'none';
      alert('Koneksi Supabase berhasil disimpan! Realtime sync aktif.');
    });

    // 14. Packaging Converter Steppers in Modal
    this.bindPackagingModalEvents();

    // 15. Dashboard Action Buttons
    document.getElementById('btn-dash-export').addEventListener('click', () => this.exportCsv());
    document.getElementById('btn-dash-reset').addEventListener('click', () => this.resetDemoData());
    document.getElementById('btn-dash-print').addEventListener('click', () => this.switchView('view-printout'));

    // 16. Import SAP Button
    document.getElementById('btn-process-import').addEventListener('click', () => this.processSapImport());
  }

  bindPackagingModalEvents() {
    // Preset buttons
    document.querySelectorAll('.btn-pack-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-pack-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const weightAttr = btn.getAttribute('data-weight');
        if (weightAttr === 'custom') {
          const userVal = prompt('Masukkan berat standar per kemasan (KG):', '25');
          this.activePackWeight = parseFloat(userVal) || 25;
        } else {
          this.activePackWeight = parseFloat(weightAttr) || 25;
        }
        this.recalcPackagingModalTotal();
      });
    });

    // Minus / Plus Stepper
    document.getElementById('btn-pack-minus').addEventListener('click', () => {
      const input = document.getElementById('calc-pack-qty');
      let val = parseInt(input.value) || 0;
      if (val > 0) val--;
      input.value = val;
      this.recalcPackagingModalTotal();
    });

    document.getElementById('btn-pack-plus').addEventListener('click', () => {
      const input = document.getElementById('calc-pack-qty');
      let val = parseInt(input.value) || 0;
      val++;
      input.value = val;
      this.recalcPackagingModalTotal();
    });

    document.getElementById('calc-pack-qty').addEventListener('input', () => {
      this.recalcPackagingModalTotal();
    });

    document.getElementById('calc-pack-partial').addEventListener('input', () => {
      this.recalcPackagingModalTotal();
    });

    document.getElementById('check-is-misplaced').addEventListener('change', (e) => {
      document.getElementById('misplaced-input-box').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('btn-save-checker-input').addEventListener('click', () => {
      this.saveCheckerItemInput();
    });
  }

  recalcPackagingModalTotal() {
    const packCount = parseFloat(document.getElementById('calc-pack-qty').value) || 0;
    const partialKg = parseFloat(document.getElementById('calc-pack-partial').value) || 0;
    const calculatedTotal = (packCount * this.activePackWeight) + partialKg;

    document.getElementById('input-actual-qty').value = calculatedTotal.toFixed(3);

    // Auto set descriptive note if empty
    const noteField = document.getElementById('input-item-note');
    if (!noteField.value || noteField.value.includes('Sak') || noteField.value.includes('Box')) {
      if (packCount > 0) {
        noteField.value = `${packCount} Sak/Kemasan (@${this.activePackWeight}kg)${partialKg > 0 ? ' + ' + partialKg + ' kg sisa' : ''}`;
      }
    }
  }

  // ================= 5. BARCODE & SEARCH HANDLER =================
  handleSearchOrBarcode(query) {
    if (!query) {
      this.renderActiveBinView();
      return;
    }

    // 1. Direct BIN match?
    const binIdx = this.uniqueBins.findIndex(b => b.toLowerCase() === query);
    if (binIdx !== -1) {
      this.currentBinIndex = binIdx;
      this.currentItemIndexInBin = 0;
      this.renderActiveBinView();
      return;
    }

    // 2. Material Code / Batch match?
    const itemIdx = this.items.findIndex(i =>
      i.materialNumber.toLowerCase() === query ||
      i.batchFisik.toLowerCase() === query ||
      i.batchSap.toLowerCase() === query
    );

    if (itemIdx !== -1) {
      const foundItem = this.items[itemIdx];
      const targetBinIdx = this.uniqueBins.findIndex(b => b === foundItem.bin);
      if (targetBinIdx !== -1) {
        this.currentBinIndex = targetBinIdx;
        const binItems = this.getItemsInCurrentBin();
        const inBinIdx = binItems.findIndex(i => i.id === foundItem.id);
        this.currentItemIndexInBin = inBinIdx !== -1 ? inBinIdx : 0;
        this.renderActiveBinView();
      }
      return;
    }

    // 3. Fallback: filter list
    this.renderActiveBinView();
  }

  // ================= 6. NAVIGATION SWITCHER =================
  switchView(viewId) {
    this.activeTab = viewId;

    // Toggle active sections
    document.querySelectorAll('.view-section').forEach(s => {
      s.classList.toggle('active', s.id === viewId);
    });

    // Update Desktop Navbar Links
    document.querySelectorAll('.nav-link-btn').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-target') === viewId);
    });

    // Update Mobile Bottom Nav
    document.querySelectorAll('.bnav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-target') === viewId);
    });

    if (viewId === 'view-checker') {
      this.renderActiveBinView();
    } else if (viewId === 'view-dashboard') {
      this.renderDashboard();
    } else if (viewId === 'view-printout') {
      this.renderPrintout();
    }
  }

  // ================= 7. USER & CLOUD STATUS =================
  renderUserBar() {
    if (!this.currentUser) return;
    document.getElementById('user-avatar-initial').textContent = this.currentUser.name.charAt(0);
    document.getElementById('current-user-name').textContent = this.currentUser.name.split(' ')[0];
    document.getElementById('current-user-role').textContent = this.currentUser.role;
  }

  updateSupabaseStatusUi() {
    const dot = document.getElementById('sb-status-dot');
    const text = document.getElementById('sb-status-text');
    const btn = document.getElementById('btn-supabase-status');
    if (!dot || !text || !btn) return;

    if (window.supabaseService && window.supabaseService.isConnected) {
      dot.textContent = '🟢';
      text.textContent = 'Cloud Sync';
      btn.style.borderColor = 'var(--brand-primary)';
      btn.style.color = 'var(--text-main)';
    } else {
      dot.textContent = '⚡';
      text.textContent = 'Hubungkan DB';
      btn.style.borderColor = 'var(--border-strong)';
      btn.style.color = 'var(--text-muted)';
    }
  }

  async initSupabaseSync() {
    try {
      const cloudItems = await window.supabaseService.fetchItems();
      if (cloudItems && cloudItems.length > 0) {
        this.items = cloudItems;
        this.calculateUniqueBins();
        this.saveItems();
        this.renderActiveBinView();
        this.renderDashboard();
        this.renderPrintout();
      }

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
            this.items[idx].countedAt = payload.new.counted_at || '';
            this.saveItems();
            this.renderActiveBinView();
            this.renderDashboard();
            this.renderPrintout();
          }
        }
      });
    } catch (e) {
      console.warn('Supabase sync exception:', e);
    }
  }

  openUserModal() {
    const container = document.getElementById('users-list-container');
    container.innerHTML = '';

    this.users.forEach(u => {
      const isCurrent = this.currentUser && this.currentUser.id === u.id;
      const card = document.createElement('div');
      card.style.cssText = `
        background-color: var(--surface-subtle);
        border: 1px solid ${isCurrent ? 'var(--brand-primary)' : 'var(--border-main)'};
        border-radius: var(--radius-sm);
        padding: 0.75rem 1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.5rem;
        transition: all 0.15s;
      `;

      card.innerHTML = `
        <div>
          <div style="font-weight: 800; font-size: 0.9rem; color: var(--text-main);">${u.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${u.title} &bull; <strong style="color: var(--brand-primary);">${u.badge}</strong></div>
        </div>
        <div>
          ${isCurrent ? '<span style="font-size: 0.75rem; color: var(--brand-primary); font-weight: 800;">AKTIF</span>' : '<button class="btn-core btn-secondary btn-sm">Pilih</button>'}
        </div>
      `;

      card.addEventListener('click', () => {
        this.currentUser = u;
        this.saveUser();
        this.renderUserBar();
        document.getElementById('modal-user-switcher').style.display = 'none';

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

  // ================= 8. CHECKER ACTIVE BIN VIEW RENDERING =================
  renderActiveBinView() {
    const currentBin = this.getCurrentBin();
    const binItems = this.getItemsInCurrentBin();

    // Update location strip
    document.getElementById('display-active-bin').textContent = currentBin;
    document.getElementById('display-active-bin-counter').textContent =
      `Rak ${this.currentBinIndex + 1} dari ${this.uniqueBins.length} &bull; ${binItems.length} Item`;

    // Stepper button disabled states
    document.getElementById('btn-prev-bin').disabled = this.currentBinIndex === 0;
    document.getElementById('btn-next-bin').disabled = this.currentBinIndex >= this.uniqueBins.length - 1;

    if (this.isFocusMode) {
      document.getElementById('checker-focus-container').style.display = 'block';
      document.getElementById('checker-list-container').style.display = 'none';
      this.renderFocusWalkthrough();
    } else {
      document.getElementById('checker-focus-container').style.display = 'none';
      document.getElementById('checker-list-container').style.display = 'flex';
      this.renderCardList(binItems);
    }
  }

  renderFocusWalkthrough() {
    const binItems = this.getItemsInCurrentBin();
    if (binItems.length === 0) return;

    if (this.currentItemIndexInBin >= binItems.length) {
      this.currentItemIndexInBin = 0;
    }

    const item = binItems[this.currentItemIndexInBin];
    const targetNet = item.qtySap - (item.pickingQty || 0);
    const isCounted = item.actualQty !== null && item.actualQty !== undefined;
    const diff = isCounted ? (item.actualQty - targetNet) : null;
    const isDiff = isCounted && Math.abs(diff) >= 0.001;

    // Set Card UI
    document.getElementById('fc-bin').textContent = item.bin;
    document.getElementById('fc-mat-desc').textContent = item.materialDesc;
    document.getElementById('fc-mat-code').textContent = item.materialNumber;
    document.getElementById('fc-uom').textContent = item.uom;
    document.getElementById('fc-batch-fisik').textContent = item.batchFisik;
    document.getElementById('fc-batch-sap').textContent = item.batchSap;
    document.getElementById('fc-exp-date').textContent = item.expDate;
    document.getElementById('fc-picking').textContent = `${item.pickingQty.toFixed(1)} ${item.uom}`;
    document.getElementById('fc-target-net').textContent = `${targetNet.toFixed(3)} ${item.uom}`;

    // Status Badge
    let badgeHtml = '<span class="app-badge badge-pending">BELUM HITUNG</span>';
    if (isCounted) {
      if (isDiff) {
        badgeHtml = '<span class="app-badge badge-diff">⚠️ SELISIH</span>';
      } else {
        badgeHtml = '<span class="app-badge badge-match">✅ COCOK</span>';
      }
    }
    if (item.isMisplaced) {
      badgeHtml += ` <span class="app-badge badge-reloc">PINDAH: ${item.newBin}</span>`;
    }
    document.getElementById('fc-status-badge').innerHTML = badgeHtml;

    // Actual Figure & Diff
    if (isCounted) {
      document.getElementById('fc-actual-val').textContent = `${item.actualQty.toFixed(3)} ${item.uom}`;
      if (isDiff) {
        document.getElementById('fc-diff-val').textContent = `Selisih: ${(diff >= 0 ? '+' : '') + diff.toFixed(3)} ${item.uom}`;
        document.getElementById('fc-diff-val').style.display = 'block';
        document.getElementById('fc-diff-val').style.color = 'var(--status-diff)';
      } else {
        document.getElementById('fc-diff-val').textContent = `Match (0.000 ${item.uom})`;
        document.getElementById('fc-diff-val').style.color = 'var(--brand-primary)';
        document.getElementById('fc-diff-val').style.display = 'block';
      }
    } else {
      document.getElementById('fc-actual-val').textContent = `- ${item.uom}`;
      document.getElementById('fc-diff-val').style.display = 'none';
    }

    // Notes Box
    const notesBox = document.getElementById('fc-notes-box');
    if (item.note || item.isMisplaced) {
      notesBox.style.display = 'block';
      let noteText = item.note || '';
      if (item.isMisplaced && item.newBin) {
        noteText += ` [Ditemukan di BIN ${item.newBin}]`;
      }
      document.getElementById('fc-note-text').textContent = noteText;
    } else {
      notesBox.style.display = 'none';
    }

    // Match Button text
    document.getElementById('fc-btn-match-text').textContent = `Sesuai Target (${targetNet.toFixed(0)} ${item.uom})`;

    // Steppers inside BIN
    document.getElementById('fc-item-step-text').textContent = `Item ${this.currentItemIndexInBin + 1} dari ${binItems.length}`;
    document.getElementById('fc-prev-item').disabled = this.currentItemIndexInBin === 0;
    document.getElementById('fc-next-item').disabled = this.currentItemIndexInBin >= binItems.length - 1;
  }

  renderCardList(binItems) {
    const container = document.getElementById('checker-list-container');
    container.innerHTML = '';

    if (binItems.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Tidak ada item di rak ini.</div>`;
      return;
    }

    binItems.forEach((item) => {
      const targetNet = item.qtySap - (item.pickingQty || 0);
      const isCounted = item.actualQty !== null && item.actualQty !== undefined;
      const isDiff = isCounted && Math.abs(item.actualQty - targetNet) >= 0.001;

      let badge = '<span class="app-badge badge-pending">BELUM</span>';
      if (isCounted) {
        badge = isDiff ? '<span class="app-badge badge-diff">SELISIH</span>' : '<span class="app-badge badge-match">COCOK</span>';
      }

      const card = document.createElement('div');
      card.className = 'focus-item-sheet';
      card.style.padding = '1rem';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
          <div>
            <div style="font-weight: 800; font-size: 0.95rem; color: var(--text-main);">${item.materialDesc}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">
              Kode: <strong class="font-mono" style="color: var(--text-main);">${item.materialNumber}</strong> &bull; Batch: <strong class="font-mono" style="color: var(--brand-primary);">${item.batchFisik}</strong>
            </div>
          </div>
          <div>${badge}</div>
        </div>

        <div style="display: flex; justify-content: space-between; background: var(--surface-subtle); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); font-size: 0.82rem; margin: 0.5rem 0;">
          <div>Target: <strong class="font-mono" style="color: var(--text-main);">${targetNet.toFixed(2)} ${item.uom}</strong></div>
          <div>Fisik: <strong class="font-mono" style="color: var(--brand-primary);">${isCounted ? item.actualQty.toFixed(2) : '-'} ${item.uom}</strong></div>
        </div>

        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button class="btn-core btn-primary btn-sm" data-action="list-match">✅ Sesuai</button>
          <button class="btn-core btn-secondary btn-sm" data-action="list-edit">✏️ Input Fisik</button>
        </div>
      `;

      card.querySelector('[data-action="list-match"]').addEventListener('click', () => {
        this.quickMatchItem(item);
      });

      card.querySelector('[data-action="list-edit"]').addEventListener('click', () => {
        this.openCheckerInputModal(item);
      });

      container.appendChild(card);
    });
  }

  // ================= 9. QUICK MATCH & MODAL ACTIONS =================
  quickMatchItem(item) {
    const targetNet = item.qtySap - (item.pickingQty || 0);
    item.actualQty = targetNet;
    item.status = 'MATCHED';
    item.note = item.note || 'Fisik utuh sesuai target SAP';
    item.countedBy = this.currentUser ? this.currentUser.name : 'Petugas';
    item.countedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

    this.saveItems();
    if (window.supabaseService) {
      window.supabaseService.syncItem(item);
    }

    this.renderActiveBinView();
    this.renderDashboard();
    this.renderPrintout();
  }

  openCheckerInputModal(item, forceMisplaced = false) {
    this.activeEditItem = item;
    const targetNet = item.qtySap - (item.pickingQty || 0);

    document.getElementById('m-item-desc').textContent = item.materialDesc;
    document.getElementById('m-item-code').textContent = item.materialNumber;
    document.getElementById('m-item-net').textContent = `${targetNet.toFixed(3)} ${item.uom}`;
    document.getElementById('m-item-batch-fisik').textContent = item.batchFisik;

    document.getElementById('calc-pack-qty').value = '';
    document.getElementById('calc-pack-partial').value = '';
    document.getElementById('input-actual-qty').value = item.actualQty !== null ? item.actualQty : '';
    document.getElementById('input-item-note').value = item.note || '';

    // Misplaced
    const isMisplaced = forceMisplaced || item.isMisplaced;
    document.getElementById('check-is-misplaced').checked = isMisplaced;
    document.getElementById('misplaced-input-box').style.display = isMisplaced ? 'block' : 'none';
    document.getElementById('input-new-bin').value = item.newBin || '';

    document.getElementById('modal-checker-input').style.display = 'flex';
  }

  saveCheckerItemInput() {
    if (!this.activeEditItem) return;

    const actualStr = document.getElementById('input-actual-qty').value.trim();
    if (actualStr === '') {
      alert('Total kuantitas fisik harus diisi!');
      return;
    }

    const actualQty = parseFloat(actualStr);
    const targetNet = this.activeEditItem.qtySap - (this.activeEditItem.pickingQty || 0);
    const isMisplaced = document.getElementById('check-is-misplaced').checked;
    const newBin = document.getElementById('input-new-bin').value.trim();
    const note = document.getElementById('input-item-note').value.trim();

    this.activeEditItem.actualQty = actualQty;
    this.activeEditItem.isMisplaced = isMisplaced;
    this.activeEditItem.newBin = isMisplaced ? newBin : '';
    this.activeEditItem.note = note;
    this.activeEditItem.countedBy = this.currentUser ? this.currentUser.name : 'Petugas';
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
    this.renderActiveBinView();
    this.renderDashboard();
    this.renderPrintout();
  }

  // ================= 10. DASHBOARD RENDERING (TABLE EDITOR) =================
  renderDashboard() {
    let total = this.items.length;
    let matched = 0;
    let diffCount = 0;
    let misplacedCount = 0;
    let netVariance = 0;

    this.items.forEach(item => {
      const targetNet = item.qtySap - (item.pickingQty || 0);
      if (item.actualQty !== null && item.actualQty !== undefined) {
        const diff = item.actualQty - targetNet;
        netVariance += diff;
        if (Math.abs(diff) < 0.001) {
          matched++;
        } else {
          diffCount++;
        }
      }
      if (item.isMisplaced) misplacedCount++;
    });

    const iraRate = total > 0 ? ((matched / total) * 100).toFixed(1) : '0.0';

    document.getElementById('dash-ira-rate').textContent = `${iraRate}%`;
    document.getElementById('dash-ira-count').textContent = `(${matched} Cocok)`;
    document.getElementById('dash-diff-items').textContent = `${diffCount} Item`;
    document.getElementById('dash-net-variance').textContent = `Net Selisih: ${(netVariance >= 0 ? '+' : '') + netVariance.toFixed(2)} KG`;
    document.getElementById('dash-misplaced-items').textContent = `${misplacedCount} Item`;
    document.getElementById('dash-total-items').textContent = total;
    
    // Navbar badge count
    const navBadge = document.getElementById('nav-item-count');
    if (navBadge) navBadge.textContent = total;

    let totalSapKg = 0;
    this.items.forEach(i => totalSapKg += i.qtySap);
    document.getElementById('dash-total-sap').textContent = `Total SAP: ${totalSapKg.toLocaleString('id-ID', { minimumFractionDigits: 2 })} KG`;

    // Filter Items for Table Editor
    const filterBin = document.getElementById('dash-filter-bin') ? document.getElementById('dash-filter-bin').value : 'ALL';
    const filterStatus = document.getElementById('dash-filter-status') ? document.getElementById('dash-filter-status').value : 'ALL';
    const searchVal = document.getElementById('dash-search-input') ? document.getElementById('dash-search-input').value.toLowerCase().trim() : '';

    const filteredItems = this.items.filter(item => {
      if (filterBin !== 'ALL' && !item.bin.startsWith(filterBin)) return false;
      
      const targetNet = item.qtySap - (item.pickingQty || 0);
      const isCounted = item.actualQty !== null && item.actualQty !== undefined;
      const isDiff = isCounted && Math.abs(item.actualQty - targetNet) >= 0.001;

      if (filterStatus === 'DISCREPANCY' && !isDiff) return false;
      if (filterStatus === 'MATCHED' && (!isCounted || isDiff)) return false;
      if (filterStatus === 'PENDING' && isCounted) return false;
      if (filterStatus === 'MISPLACED' && !item.isMisplaced) return false;

      if (searchVal) {
        const text = `${item.bin} ${item.materialNumber} ${item.materialDesc} ${item.batchFisik} ${item.batchSap}`.toLowerCase();
        if (!text.includes(searchVal)) return false;
      }

      return true;
    });

    // Render Master Table
    const tbody = document.getElementById('dash-master-tbody');
    tbody.innerHTML = '';

    if (filteredItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="14" style="text-align: center; padding: 3rem; color: var(--text-muted);">
            Tidak ada item yang sesuai dengan filter pencarian.
          </td>
        </tr>
      `;
      return;
    }

    filteredItems.forEach((item, idx) => {
      const targetNet = item.qtySap - (item.pickingQty || 0);
      const isCounted = item.actualQty !== null && item.actualQty !== undefined;
      const diff = isCounted ? (item.actualQty - targetNet) : 0;
      const isDiff = isCounted && Math.abs(diff) >= 0.001;

      const tr = document.createElement('tr');
      if (isDiff) tr.className = 'row-discrepancy';
      if (item.isMisplaced) tr.className = 'row-relocated';

      let statusBadge = '<span class="app-badge badge-pending">PENDING</span>';
      if (isCounted) {
        statusBadge = isDiff ? '<span class="app-badge badge-diff">SELISIH</span>' : '<span class="app-badge badge-match">COCOK</span>';
      }
      if (item.isMisplaced) statusBadge += ` <span class="app-badge badge-reloc">PINDAH</span>`;

      tr.innerHTML = `
        <td style="text-align: center; color: var(--text-muted); font-family: var(--font-mono);">${item.no || idx + 1}</td>
        <td><span class="badge-bin">${item.bin}</span></td>
        <td class="font-mono" style="color: var(--text-secondary);">${item.materialNumber}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${item.materialDesc}</div>
          ${item.unitConversion ? `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">${item.unitConversion}</div>` : ''}
        </td>
        <td class="font-mono" style="color: var(--brand-primary); font-weight: 700; white-space: nowrap;">${item.batchFisik}</td>
        <td class="font-mono" style="color: var(--text-muted); white-space: nowrap;">${item.batchSap}</td>
        <td class="num-cell">${item.qtySap.toFixed(2)}</td>
        <td class="num-cell" style="color: ${item.pickingQty > 0 ? 'var(--status-pending)' : 'inherit'};">${item.pickingQty.toFixed(2)}</td>
        <td class="num-cell" style="font-weight: 800; color: var(--text-main);">${targetNet.toFixed(2)}</td>
        <td class="num-cell" style="font-weight: 800; color: ${isCounted ? (isDiff ? 'var(--status-diff)' : 'var(--brand-primary)') : 'var(--text-muted)'};">
          ${isCounted ? item.actualQty.toFixed(2) : '-'}
        </td>
        <td class="num-cell" style="font-weight: 800; color: ${isDiff ? 'var(--status-diff)' : (isCounted ? 'var(--brand-primary)' : 'var(--text-muted)')};">
          ${isCounted ? (diff >= 0 ? '+' : '') + diff.toFixed(2) : '-'}
        </td>
        <td style="text-align: center;">${statusBadge}</td>
        <td style="font-size: 0.78rem; color: var(--text-secondary);">
          ${item.note || '-'}
          ${item.isMisplaced && item.newBin ? `<div style="color: var(--status-reloc); font-weight: 600; margin-top: 0.2rem;">↳ Pindah ke: ${item.newBin}</div>` : ''}
        </td>
        <td style="text-align: center;">
          <button class="btn-core btn-secondary btn-sm" data-action="tbl-edit">Edit</button>
        </td>
      `;

      tr.querySelector('[data-action="tbl-edit"]').addEventListener('click', () => {
        this.openCheckerInputModal(item);
      });

      tbody.appendChild(tr);
    });
  }

  // ================= 11. OFFICIAL PRINTOUT RENDERING =================
  renderPrintout() {
    const tbody = document.getElementById('printout-tbody');
    tbody.innerHTML = '';

    this.items.forEach((item, idx) => {
      const targetNet = item.qtySap - (item.pickingQty || 0);
      const isCounted = item.actualQty !== null && item.actualQty !== undefined;
      const diff = isCounted ? (item.actualQty - targetNet) : 0;
      const isDiff = isCounted && Math.abs(diff) >= 0.001;

      const tr = document.createElement('tr');
      if (isDiff) tr.className = 'highlight-diff';

      let remark = item.note || '-';
      if (item.isMisplaced && item.newBin) {
        remark += ` [Pindah ke ${item.newBin}]`;
      }

      tr.innerHTML = `
        <td style="text-align: center;">${item.no || idx + 1}</td>
        <td><strong>${item.bin}</strong></td>
        <td>${item.materialNumber}</td>
        <td>${item.materialDesc}</td>
        <td style="font-weight:700;">${item.batchFisik}</td>
        <td>${item.batchSap}</td>
        <td style="text-align: right;">${item.qtySap.toFixed(2)}</td>
        <td style="text-align: right;">${item.pickingQty.toFixed(2)}</td>
        <td style="text-align: right; font-weight:700;">${targetNet.toFixed(2)}</td>
        <td style="text-align: right; font-weight:700;">${isCounted ? item.actualQty.toFixed(2) : '-'}</td>
        <td style="text-align: right; font-weight:700; color:${isDiff ? '#dc2626' : '#000'};">
          ${isCounted ? (diff >= 0 ? '+' : '') + diff.toFixed(2) : '-'}
        </td>
        <td style="text-align: center; font-weight:700;">${isCounted ? (isDiff ? 'SELISIH' : 'MATCH') : 'PENDING'}</td>
        <td style="font-size: 7.5pt;">${remark}</td>
      `;

      tbody.appendChild(tr);
    });
  }

  // ================= 12. EXPORT CSV & RESET =================
  exportCsv() {
    const headers = ['No', 'BIN', 'Kode Material', 'Deskripsi Material', 'Batch Fisik Vendor', 'Batch SAP', 'Qty SAP', 'Picking', 'Target Net', 'Aktual Fisik', 'Variance', 'Status', 'Catatan'];
    const rows = this.items.map((item, idx) => {
      const targetNet = item.qtySap - (item.pickingQty || 0);
      const isCounted = item.actualQty !== null && item.actualQty !== undefined;
      const diff = isCounted ? (item.actualQty - targetNet) : '';

      return [
        item.no || idx + 1,
        `"${item.bin}"`,
        `"${item.materialNumber}"`,
        `"${item.materialDesc.replace(/"/g, '""')}"`,
        `"${item.batchFisik}"`,
        `"${item.batchSap}"`,
        item.qtySap,
        item.pickingQty,
        targetNet,
        isCounted ? item.actualQty : '',
        diff,
        item.status,
        `"${(item.note || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hasil_Cycle_Count_RMPM_${this.schedule.scheduleDate || 'Today'}.csv`;
    link.click();
  }

  resetDemoData() {
    if (confirm('Reset kembali ke 20 data asli dari lembar kertas?')) {
      this.items = [...INITIAL_ITEMS];
      this.calculateUniqueBins();
      this.currentBinIndex = 0;
      this.currentItemIndexInBin = 0;
      this.saveItems();
      this.renderActiveBinView();
      this.renderDashboard();
      this.renderPrintout();
    }
  }

  processSapImport() {
    const raw = document.getElementById('import-text-data').value.trim();
    if (!raw) {
      alert('Tempelkan data tabel terlebih dahulu!');
      return;
    }

    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const newItems = [];

    lines.forEach((line, idx) => {
      let cols = line.split('\t');
      if (cols.length < 5) cols = line.split(/[\;,]/);
      if (cols.length >= 7) {
        newItems.push({
          id: 'imported-' + Date.now() + '-' + idx,
          no: idx + 1,
          bin: cols[0].trim(),
          materialNumber: cols[1].trim(),
          batchSap: cols[2].trim(),
          batchFisik: cols[3].trim(),
          expDate: cols[4].trim(),
          materialDesc: cols[5].trim(),
          uom: cols[6].trim().toUpperCase() || 'KG',
          qtySap: parseFloat(cols[7].replace(/,/g, '')) || 0,
          pickingQty: cols[8] ? parseFloat(cols[8].replace(/,/g, '')) || 0 : 0,
          actualQty: null,
          note: '',
          isMisplaced: false,
          newBin: '',
          status: 'PENDING',
          countedBy: '',
          countedAt: ''
        });
      }
    });

    if (newItems.length > 0) {
      this.items = newItems;
      this.calculateUniqueBins();
      this.currentBinIndex = 0;
      this.currentItemIndexInBin = 0;
      this.saveItems();
      document.getElementById('import-text-data').value = '';
      alert(`Berhasil mengimpor ${newItems.length} baris jadwal!`);
      this.switchView('view-checker');
    } else {
      alert('Format kolom tidak terbaca. Pastikan dipisahkan oleh Tab dari Excel.');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new CycleCountApp();
});
