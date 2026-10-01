// ==============================================================================
// RMPM Cycle Count System - Enterprise Industrial Controller (OOP Architecture)
// Powered by: Models OOP, AuthManager (RBAC), DataTables, ApexCharts & Supabase
// Zero Hardcode: All signature matrix & company profiles customizable by Admin
// ==============================================================================

const STORAGE_KEYS = {
  THEME: 'rmpm_theme'
};

class CycleCountApp {
  constructor() {
    // 1. Initialize OOP Domain Repositories & Auth
    this.repo = new CycleCountRepository();
    this.auth = new AuthManager(INITIAL_USERS);
    this.items = this.repo.items;
    this.signatureMatrix = this.repo.signatureMatrix;
    this.companyProfile = this.repo.companyProfile;

    // View state
    this.activeTab = 'view-dashboard';
    this.uniqueBins = [];
    this.currentBinIndex = 0;
    this.currentItemIndexInBin = 0;
    this.isFocusMode = true;
    this.activePackWeight = 25;

    // Chart & Table references
    this.dataTable = null;
    this.iraDonutChart = null;
    this.varianceBarChart = null;
    this.selectedLoginUserId = null;

    this.init();
  }

  async init() {
    this.initTheme();
    this.calculateUniqueBins();
    this.bindEvents();
    this.renderPrintout();

    // Check login session
    if (!this.auth.isLoggedIn()) {
      this.showLoginModal();
    } else {
      this.handleUserLoggedIn();
    }

    // Auto-connect Supabase in background (Zero UI Popup)
    if (window.supabaseService) {
      const isOnline = await window.supabaseService.checkConnection();
      this.updateCloudStatusUi();
      if (isOnline) {
        await this.initSupabaseSync();
        this.updateCloudStatusUi();
      }
    }
  }

  // ================= 1. AUTHENTICATION & LOGIN SESSION (RBAC) =================
  showLoginModal(canCancel = false) {
    const modal = document.getElementById('modal-auth-login');
    const container = document.getElementById('login-user-list');
    const closeBtn = document.getElementById('btn-close-login-modal');
    if (closeBtn) {
      closeBtn.style.display = (canCancel && this.auth.isLoggedIn()) ? 'inline-flex' : 'none';
    }
    container.innerHTML = '';

    const users = this.auth.users;
    this.selectedLoginUserId = this.auth.currentUser ? this.auth.currentUser.id : users[0].id;

    users.forEach((u, idx) => {
      const isCurrentActive = this.auth.currentUser && this.auth.currentUser.id === u.id;
      const option = document.createElement('div');
      option.className = `user-login-option ${u.id === this.selectedLoginUserId ? 'selected' : ''}`;
      option.dataset.userId = u.id;

      let roleBadgeClass = 'role-admin';
      let roleDesc = 'Akses Penuh: Dashboard, Scanner, BA, Import, Pengaturan TTD & Data';
      if (u.role === 'CHECKER') {
        roleBadgeClass = 'role-checker';
        roleDesc = 'Akses Lapangan: Hitung Fisik Rak BIN, Scanner, Kalkulator Kemasan';
      } else if (u.role === 'AUDITOR' || u.role === 'ACCOUNTING') {
        roleBadgeClass = 'role-auditor';
        roleDesc = 'Akses Verifikasi: View-only Table Editor, Analytics, Cetak Berita Acara';
      }

      option.innerHTML = `
        <div class="user-login-option-left">
          <div class="user-login-avatar">${u.name.charAt(0)}</div>
          <div>
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <span class="user-login-name">${u.name}</span>
              ${isCurrentActive ? '<span class="app-badge badge-matched" style="font-size: 0.62rem; padding: 0.1rem 0.35rem;">Sedang Aktif</span>' : ''}
            </div>
            <div class="user-login-role">${u.title}</div>
            <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 2px;">${roleDesc}</div>
          </div>
        </div>
        <span class="role-badge ${roleBadgeClass}">${u.role}</span>
      `;

      option.addEventListener('click', () => {
        document.querySelectorAll('.user-login-option').forEach(el => el.classList.remove('selected'));
        option.classList.add('selected');
        this.selectedLoginUserId = u.id;
      });

      // Double click or fast select to login immediately
      option.addEventListener('dblclick', () => {
        this.selectedLoginUserId = u.id;
        document.getElementById('btn-do-login').click();
      });

      container.appendChild(option);
    });

    modal.style.display = 'flex';
  }

  handleUserLoggedIn() {
    const user = this.auth.currentUser;
    if (!user) return;

    // Update Navbar user chip
    document.getElementById('user-avatar-initial').textContent = user.name.charAt(0);
    document.getElementById('current-user-name').textContent = user.name.split(' ')[0];
    document.getElementById('current-user-role').textContent = user.role;

    // Apply Role-Based Access Control & update user info
    this.applyRolePermissions();

    // Render active views
    this.renderActiveBinView();
    this.renderDashboard();
    this.renderPrintout();
    this.loadAdminSettingsForm();
    this.updateSettingsDataInfo();
  }

  applyRolePermissions() {
    const user = this.auth.currentUser;
    const settingsTab = document.getElementById('tab-nav-settings');
    const importTab = document.getElementById('tab-nav-import');
    const resetBtn = document.getElementById('btn-dash-reset');
    const adminBottomTab = document.querySelector('.admin-only-tab');
    const bnavSettings = document.getElementById('bnav-settings');

    // Settings tab is ALWAYS accessible on desktop and mobile!
    if (settingsTab) settingsTab.style.display = 'inline-flex';
    if (bnavSettings) bnavSettings.style.display = 'flex';

    if (this.auth.isAdmin()) {
      // Administrator: Full access
      if (importTab) importTab.style.display = 'inline-flex';
      if (resetBtn) resetBtn.style.display = 'inline-flex';
      if (adminBottomTab) adminBottomTab.style.display = 'flex';
      this.switchView('view-dashboard');
    } else if (this.auth.isChecker()) {
      // Checker: Mobile scanner focus, hide import
      if (importTab) importTab.style.display = 'none';
      if (resetBtn) resetBtn.style.display = 'none';
      if (adminBottomTab) adminBottomTab.style.display = 'none';
      this.switchView('view-checker');
    } else {
      // Auditor / Accounting: View-only dashboard & printout
      if (importTab) importTab.style.display = 'none';
      if (resetBtn) resetBtn.style.display = 'none';
      if (adminBottomTab) adminBottomTab.style.display = 'none';
      this.switchView('view-dashboard');
    }

    // Update User Profile in Settings Card
    this.updateSettingsUserCard();
    this.updateSettingsDataInfo();
  }

  updateSettingsUserCard() {
    const user = this.auth.currentUser;
    if (!user) return;

    const avatarEl = document.getElementById('settings-user-avatar');
    const nameEl = document.getElementById('settings-user-name');
    const badgeEl = document.getElementById('settings-user-badge');
    const titleEl = document.getElementById('settings-user-title');
    const pillsEl = document.getElementById('settings-permission-pills');

    if (avatarEl) avatarEl.textContent = user.name.charAt(0);
    if (nameEl) nameEl.textContent = user.name;
    if (titleEl) titleEl.textContent = user.title;
    if (badgeEl) {
      badgeEl.textContent = user.role;
      badgeEl.className = `role-badge ${user.role === 'ADMIN' ? 'role-admin' : (user.role === 'CHECKER' ? 'role-checker' : 'role-auditor')}`;
    }

    if (pillsEl) {
      const canEdit = this.auth.canEditItems();
      const canImport = this.auth.canImportSap();
      const canCustom = this.auth.canCustomizeSettings();
      const canReset = this.auth.canResetData();

      pillsEl.innerHTML = `
        <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
          <i class="fa-solid ${canEdit ? 'fa-circle-check' : 'fa-circle-xmark'}" style="color: ${canEdit ? 'var(--status-match)' : 'var(--text-muted)'};"></i>
          Hitung Fisik: <strong>${canEdit ? 'Diizinkan' : 'Dibatasi'}</strong>
        </span>
        <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
          <i class="fa-solid ${canImport ? 'fa-circle-check' : 'fa-circle-xmark'}" style="color: ${canImport ? 'var(--status-match)' : 'var(--text-muted)'};"></i>
          Import SAP: <strong>${canImport ? 'Diizinkan' : 'Dibatasi'}</strong>
        </span>
        <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
          <i class="fa-solid ${canCustom ? 'fa-circle-check' : 'fa-circle-xmark'}" style="color: ${canCustom ? 'var(--status-match)' : 'var(--text-muted)'};"></i>
          Kustomisasi TTD: <strong>${canCustom ? 'Diizinkan' : 'Dibatasi'}</strong>
        </span>
        <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
          <i class="fa-solid ${canReset ? 'fa-circle-check' : 'fa-circle-xmark'}" style="color: ${canReset ? 'var(--status-match)' : 'var(--text-muted)'};"></i>
          Hapus/Set Dummy: <strong>${canReset ? 'Diizinkan' : 'Dibatasi'}</strong>
        </span>
      `;
    }
  }

  logout() {
    Swal.fire({
      title: 'Keluar dari Sesi Kerja?',
      text: 'Sesi pengguna aktif akan diakhiri.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-right-from-bracket"></i> Ya, Keluar',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626',
      customClass: { popup: 'swal-custom-popup' }
    }).then(result => {
      if (result.isConfirmed) {
        this.auth.logout();
        this.showLoginModal(false);
      }
    });
  }

  // ================= 2. THEME CONTROLLER =================
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
      icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

    if (this.iraDonutChart || this.varianceBarChart) {
      this.renderAnalyticsCharts();
    }
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

    // 3. Logout Button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    // 4. Do Login Button
    const doLoginBtn = document.getElementById('btn-do-login');
    if (doLoginBtn) {
      doLoginBtn.addEventListener('click', () => {
        if (this.selectedLoginUserId) {
          this.auth.login(this.selectedLoginUserId);
          document.getElementById('modal-auth-login').style.display = 'none';
          this.handleUserLoggedIn();
          Swal.fire({
            icon: 'success',
            title: 'Berhasil Masuk',
            text: `Selamat datang, ${this.auth.currentUser.name} (${this.auth.currentUser.role})`,
            timer: 1300,
            showConfirmButton: false,
            customClass: { popup: 'swal-custom-popup' }
          });
        }
      });
    }

    const closeLoginBtn = document.getElementById('btn-close-login-modal');
    if (closeLoginBtn) {
      closeLoginBtn.addEventListener('click', () => {
        if (this.auth.isLoggedIn()) {
          document.getElementById('modal-auth-login').style.display = 'none';
        }
      });
    }

    // 4b. Cloud Status Pill Click -> Connection Info / Reconnect
    const cloudPill = document.querySelector('.pill-status-btn');
    if (cloudPill) {
      cloudPill.style.cursor = 'pointer';
      cloudPill.addEventListener('click', async () => {
        const isOnline = window.supabaseService ? await window.supabaseService.checkConnection() : false;
        this.updateCloudStatusUi();

        if (isOnline) {
          Swal.fire({
            title: 'Koneksi Supabase Cloud',
            html: `
              <div style="text-align: left; font-size: 0.85rem; line-height: 1.6; background: var(--surface-subtle); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-main);">
                <div style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
                  <i class="fa-solid fa-circle-check" style="color: #10b981; font-size: 1rem;"></i>
                  <span style="font-weight: 800; color: var(--text-main);">Status: Tersambung (Online)</span>
                </div>
                <div><strong>Project ID:</strong> <span class="font-mono" style="color: var(--brand-primary);">zaxrouzuwryymdolhlix</span></div>
                <div><strong>Database URL:</strong> <span class="font-mono">zaxrouzuwryymdolhlix.supabase.co</span></div>
                <div><strong>Protokol:</strong> REST API + Realtime WebSocket</div>
                <div><strong>Tabel Aktif:</strong> <code>cc_items</code>, <code>cc_schedules</code>, <code>cc_settings</code></div>
              </div>
            `,
            icon: 'success',
            confirmButtonText: 'Tutup',
            customClass: { popup: 'swal-custom-popup' }
          });
        } else {
          Swal.fire({
            title: 'Koneksi Cloud Offline',
            text: 'Aplikasi saat ini berjalan dalam mode database lokal (offline). Ingin mencoba menyambungkan ulang ke Supabase?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '<i class="fa-solid fa-rotate"></i> Sambungkan Sekarang',
            cancelButtonText: 'Batal',
            customClass: { popup: 'swal-custom-popup' }
          }).then(async (res) => {
            if (res.isConfirmed) {
              if (window.supabaseService) {
                window.supabaseService.init();
                const rechecked = await window.supabaseService.checkConnection();
                this.updateCloudStatusUi();
                if (rechecked) {
                  await this.initSupabaseSync();
                  Swal.fire({
                    icon: 'success',
                    title: 'Berhasil Tersambung',
                    text: 'Koneksi ke Supabase Cloud zaxrouzuwryymdolhlix telah aktif.',
                    timer: 1500,
                    showConfirmButton: false,
                    customClass: { popup: 'swal-custom-popup' }
                  });
                }
              }
            }
          });
        }
      });
    }

    // 5. Dashboard Filters
    const dashBin = document.getElementById('dash-filter-bin');
    if (dashBin) {
      dashBin.addEventListener('change', () => this.renderDashboard());
    }
    const dashStatus = document.getElementById('dash-filter-status');
    if (dashStatus) {
      dashStatus.addEventListener('change', () => this.renderDashboard());
    }
    const dashSearch = document.getElementById('dash-search-input');
    if (dashSearch) {
      dashSearch.addEventListener('input', () => this.renderDashboard());
    }

    // 6. BIN Steppers (Prev / Next)
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

    // 7. Mode Toggle (Focus vs List)
    document.getElementById('btn-toggle-focus-mode').addEventListener('click', () => {
      this.isFocusMode = !this.isFocusMode;
      const textSpan = document.getElementById('btn-toggle-focus-text');
      if (textSpan) {
        textSpan.textContent = this.isFocusMode ? 'Mode Fokus' : 'Mode List';
      }
      this.renderActiveBinView();
    });

    // 8. Mobile Barcode & Search
    document.getElementById('mobile-barcode-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      this.searchQuery = q;
      this.handleSearchOrBarcode(q);
    });

    // 9. Focus Item Steppers (Item Prev / Item Next in same BIN)
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

    // 10. Focus Item Quick Match Button
    document.getElementById('fc-btn-match').addEventListener('click', () => {
      const binItems = this.getItemsInCurrentBin();
      const currentItem = binItems[this.currentItemIndexInBin];
      if (currentItem) {
        this.quickMatchItem(currentItem);
      }
    });

    // 11. Focus Item Open Input & Packaging Calc
    document.getElementById('fc-btn-input-calc').addEventListener('click', () => {
      const binItems = this.getItemsInCurrentBin();
      const currentItem = binItems[this.currentItemIndexInBin];
      if (currentItem) {
        this.openCheckerInputModal(currentItem);
      }
    });

    // 12. Focus Item Misplaced Quick Trigger
    document.getElementById('fc-btn-misplaced').addEventListener('click', () => {
      const binItems = this.getItemsInCurrentBin();
      const currentItem = binItems[this.currentItemIndexInBin];
      if (currentItem) {
        this.openCheckerInputModal(currentItem, true);
      }
    });

    // 13. Modal Close Buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
      });
    });

    // 14. User Profile & Session Switcher
    const openUserBtn = document.getElementById('btn-open-user-modal');
    if (openUserBtn) {
      openUserBtn.addEventListener('click', () => this.showLoginModal(true));
    }

    const settingsSwitchUserBtn = document.getElementById('btn-settings-switch-user');
    if (settingsSwitchUserBtn) {
      settingsSwitchUserBtn.addEventListener('click', () => this.showLoginModal(true));
    }

    const settingsLogoutBtn = document.getElementById('btn-settings-logout');
    if (settingsLogoutBtn) {
      settingsLogoutBtn.addEventListener('click', () => this.logout());
    }

    // 15. Settings Dataset & Dummy Data Management
    const clearDummyBtn = document.getElementById('btn-clear-dummy-data');
    if (clearDummyBtn) {
      clearDummyBtn.addEventListener('click', () => this.clearDummyData());
    }

    const loadDummyBtn = document.getElementById('btn-load-dummy-data');
    if (loadDummyBtn) {
      loadDummyBtn.addEventListener('click', () => this.loadDefaultDummyData());
    }

    const openAddItemBtn = document.getElementById('btn-open-modal-add-item');
    if (openAddItemBtn) {
      openAddItemBtn.addEventListener('click', () => {
        const form = document.getElementById('form-add-item');
        if (form) form.reset();
        document.getElementById('modal-add-item').style.display = 'flex';
      });
    }

    const submitAddItemBtn = document.getElementById('btn-submit-add-item');
    if (submitAddItemBtn) {
      submitAddItemBtn.addEventListener('click', () => this.handleAddNewItem());
    }

    const skuSearchInput = document.getElementById('settings-sku-search');
    if (skuSearchInput) {
      skuSearchInput.addEventListener('input', () => this.renderSettingsSkuTable());
    }

    const submitEditItemBtn = document.getElementById('btn-submit-edit-item');
    if (submitEditItemBtn) {
      submitEditItemBtn.addEventListener('click', () => this.handleSaveEditItem());
    }

    // 16. Packaging Converter Steppers in Modal
    this.bindPackagingModalEvents();

    // 17. Dashboard Action Buttons
    document.getElementById('btn-dash-export').addEventListener('click', () => this.exportCsv());
    document.getElementById('btn-dash-reset').addEventListener('click', () => this.resetDemoData());
    document.getElementById('btn-dash-print').addEventListener('click', () => this.switchView('view-printout'));

    // 18. Import SAP Button
    document.getElementById('btn-process-import').addEventListener('click', () => this.processSapImport());

    // 19. Save Admin Settings Button
    const saveAdminBtn = document.getElementById('btn-save-admin-settings');
    if (saveAdminBtn) {
      saveAdminBtn.addEventListener('click', () => this.saveAdminSettings());
    }
  }

  bindPackagingModalEvents() {
    document.querySelectorAll('.btn-pack-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-pack-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const weightAttr = btn.getAttribute('data-weight');
        if (weightAttr === 'custom') {
          Swal.fire({
            title: 'Berat Kemasan Khusus',
            input: 'number',
            inputLabel: 'Masukkan berat standar per kemasan (KG):',
            inputValue: 25,
            showCancelButton: true,
            confirmButtonText: 'Terapkan',
            cancelButtonText: 'Batal',
            customClass: { popup: 'swal-custom-popup' }
          }).then(result => {
            if (result.isConfirmed && result.value) {
              this.activePackWeight = parseFloat(result.value) || 25;
              this.recalcPackagingModalTotal();
            }
          });
        } else {
          this.activePackWeight = parseFloat(weightAttr) || 25;
          this.recalcPackagingModalTotal();
        }
      });
    });

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

    const noteField = document.getElementById('input-item-note');
    if (!noteField.value || noteField.value.includes('Sak') || noteField.value.includes('Box')) {
      if (packCount > 0) {
        noteField.value = `${packCount} Kemasan (@${this.activePackWeight}kg)${partialKg > 0 ? ' + ' + partialKg + ' kg sisa' : ''}`;
      }
    }
  }

  // ================= 5. BARCODE & SEARCH HANDLER =================
  handleSearchOrBarcode(query) {
    if (!query) {
      this.renderActiveBinView();
      return;
    }

    const binIdx = this.uniqueBins.findIndex(b => b.toLowerCase() === query);
    if (binIdx !== -1) {
      this.currentBinIndex = binIdx;
      this.currentItemIndexInBin = 0;
      this.renderActiveBinView();
      return;
    }

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

    this.renderActiveBinView();
  }

  // ================= 6. NAVIGATION SWITCHER =================
  switchView(viewId) {
    // Role protection
    if (viewId === 'view-settings' && !this.auth.isAdmin()) {
      Swal.fire({
        icon: 'error',
        title: 'Akses Ditolak',
        text: 'Menu Pengaturan hanya dapat diakses oleh Administrator / SPV.',
        customClass: { popup: 'swal-custom-popup' }
      });
      return;
    }

    if (viewId === 'view-import' && !this.auth.isAdmin()) {
      Swal.fire({
        icon: 'error',
        title: 'Akses Ditolak',
        text: 'Menu Import SAP hanya dapat diakses oleh Administrator.',
        customClass: { popup: 'swal-custom-popup' }
      });
      return;
    }

    this.activeTab = viewId;

    document.querySelectorAll('.view-section').forEach(s => {
      s.classList.toggle('active', s.id === viewId);
    });

    document.querySelectorAll('.nav-link-btn').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-target') === viewId);
    });

    document.querySelectorAll('.bnav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-target') === viewId);
    });

    if (viewId === 'view-checker') {
      this.renderActiveBinView();
    } else if (viewId === 'view-dashboard') {
      this.renderDashboard();
    } else if (viewId === 'view-printout') {
      this.renderPrintout();
    } else if (viewId === 'view-settings') {
      this.loadAdminSettingsForm();
      this.updateSettingsDataInfo();
      this.renderSettingsSkuTable();
    }
  }

  // ================= 7. CLOUD STATUS (AUTOMATIC BACKEND CONNECTION) =================
  updateCloudStatusUi() {
    const dot = document.getElementById('sb-status-dot');
    const text = document.getElementById('sb-status-text');
    const pill = document.querySelector('.pill-status-btn');
    if (!dot || !text) return;

    if (window.supabaseService && window.supabaseService.isConnected) {
      dot.style.color = '#10b981';
      dot.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.6)';
      text.textContent = 'Supabase Cloud';
      if (pill) {
        pill.title = 'Terhubung ke Supabase Cloud (zaxrouzuwryymdolhlix). Klik untuk melihat detail status.';
      }
    } else {
      dot.style.color = 'var(--text-muted)';
      dot.style.boxShadow = 'none';
      text.textContent = 'Local Database';
      if (pill) {
        pill.title = 'Database offline / lokal. Klik untuk menghubungkan ke Supabase Cloud.';
      }
    }
  }

  async initSupabaseSync() {
    try {
      // 1. Sync Settings from Cloud cc_settings
      const cloudSettings = await window.supabaseService.fetchSettings();
      if (cloudSettings) {
        this.companyProfile.update({
          companyName: cloudSettings.company_name,
          divisionName: cloudSettings.division_name,
          departmentName: cloudSettings.department_name,
          docNumber: cloudSettings.doc_number_format,
          iraTargetPercent: cloudSettings.ira_target_percent
        });
        if (cloudSettings.sig_checker_name) {
          this.signatureMatrix.updateOfficer('checker', {
            name: cloudSettings.sig_checker_name,
            position: cloudSettings.sig_checker_position
          });
        }
        if (cloudSettings.sig_spv_name) {
          this.signatureMatrix.updateOfficer('supervisor', {
            name: cloudSettings.sig_spv_name,
            position: cloudSettings.sig_spv_position
          });
        }
        if (cloudSettings.sig_controller_name) {
          this.signatureMatrix.updateOfficer('controller', {
            name: cloudSettings.sig_controller_name,
            position: cloudSettings.sig_controller_position
          });
        }
        if (cloudSettings.sig_accounting_name) {
          this.signatureMatrix.updateOfficer('accounting', {
            name: cloudSettings.sig_accounting_name,
            position: cloudSettings.sig_accounting_position
          });
        }
        this.repo.saveCompany();
        this.repo.saveSignatures();
        this.loadAdminSettingsForm();
      }

      // 2. Sync Items from Cloud cc_items
      const cloudItems = await window.supabaseService.fetchItems();
      if (cloudItems && cloudItems.length > 0) {
        this.items = cloudItems.map(i => CycleCountItem.fromJSON(i));
        this.repo.items = this.items;
        this.calculateUniqueBins();
        this.repo.saveItems();
        this.renderActiveBinView();
        this.renderDashboard();
        this.renderPrintout();
        this.updateSettingsDataInfo();
        this.renderSettingsSkuTable();
      }

      // 3. Realtime Subscription
      window.supabaseService.subscribeToChanges((payload) => {
        if (payload.new && payload.new.id) {
          const idx = this.items.findIndex(i => i.id === payload.new.id);
          if (idx !== -1) {
            this.items[idx].actualQty = payload.new.actual_qty !== null ? parseFloat(payload.new.actual_qty) : null;
            this.items[idx].note = payload.new.note || '';
            this.items[idx].isMisplaced = Boolean(payload.new.is_misplaced);
            this.items[idx].newBin = payload.new.new_bin || '';
            this.items[idx].status = payload.new.status || 'PENDING';
            this.items[idx].countedBy = payload.new.counted_by || '';
            this.items[idx].countedAt = payload.new.counted_at || '';
            this.repo.saveItems();
            this.renderActiveBinView();
            this.renderDashboard();
            this.renderPrintout();
            this.renderSettingsSkuTable();
          }
        }
      });
    } catch (e) {
      console.warn('Supabase sync exception:', e);
    }
  }

  openUserProfileModal() {
    const container = document.getElementById('users-list-container');
    container.innerHTML = '';
    const user = this.auth.currentUser;
    if (!user) return;

    const div = document.createElement('div');
    div.innerHTML = `
      <div style="background: var(--surface-subtle); padding: 1.25rem; border-radius: var(--radius-sm); border: 1px solid var(--border-main); text-align: center;">
        <div style="width: 52px; height: 52px; border-radius: 50%; background: var(--brand-surface); color: var(--brand-primary); font-size: 1.5rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 0.5rem; border: 1px solid var(--brand-border);">
          ${user.name.charAt(0)}
        </div>
        <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.2rem;">${user.name}</h4>
        <div style="font-size: 0.8rem; color: var(--text-muted);">${user.title}</div>
        <div style="margin-top: 0.65rem;">
          <span class="role-badge ${user.role === 'ADMIN' ? 'role-admin' : (user.role === 'CHECKER' ? 'role-checker' : 'role-auditor')}">
            OTORITAS: ${user.role}
          </span>
        </div>
      </div>
    `;
    container.appendChild(div);
    document.getElementById('modal-user-switcher').style.display = 'flex';
  }

  // ================= 8. ADMIN SETTINGS: CUSTOMIZATION TTD & MASTER DATA =================
  loadAdminSettingsForm() {
    const sigs = this.signatureMatrix;
    const comp = this.companyProfile;

    // Load Signatures
    if (document.getElementById('cfg-sig-checker-name')) {
      document.getElementById('cfg-sig-checker-name').value = sigs.checker.name;
      document.getElementById('cfg-sig-checker-pos').value = sigs.checker.position;

      document.getElementById('cfg-sig-spv-name').value = sigs.supervisor.name;
      document.getElementById('cfg-sig-spv-pos').value = sigs.supervisor.position;

      document.getElementById('cfg-sig-ctrl-name').value = sigs.controller.name;
      document.getElementById('cfg-sig-ctrl-pos').value = sigs.controller.position;

      document.getElementById('cfg-sig-acc-name').value = sigs.accounting.name;
      document.getElementById('cfg-sig-acc-pos').value = sigs.accounting.position;

      // Load Company & Audit
      document.getElementById('cfg-company-name').value = comp.companyName;
      document.getElementById('cfg-division-name').value = `${comp.divisionName} • ${comp.departmentName}`;
      document.getElementById('cfg-doc-number').value = comp.docNumber;
      document.getElementById('cfg-ira-target').value = comp.iraTargetPercent;
    }
  }

  async saveAdminSettings() {
    if (!this.auth.isAdmin()) return;

    // Update Signatures
    this.signatureMatrix.updateOfficer('checker', {
      name: document.getElementById('cfg-sig-checker-name').value,
      position: document.getElementById('cfg-sig-checker-pos').value
    });

    this.signatureMatrix.updateOfficer('supervisor', {
      name: document.getElementById('cfg-sig-spv-name').value,
      position: document.getElementById('cfg-sig-spv-pos').value
    });

    this.signatureMatrix.updateOfficer('controller', {
      name: document.getElementById('cfg-sig-ctrl-name').value,
      position: document.getElementById('cfg-sig-ctrl-pos').value
    });

    this.signatureMatrix.updateOfficer('accounting', {
      name: document.getElementById('cfg-sig-acc-name').value,
      position: document.getElementById('cfg-sig-acc-pos').value
    });

    // Update Company & Target
    const divDeptStr = document.getElementById('cfg-division-name').value;
    const parts = divDeptStr.split('•');
    const divName = parts[0] ? parts[0].trim() : 'Warehouse & Supply Chain Division';
    const deptName = parts[1] ? parts[1].trim() : 'RMPM Department';

    this.companyProfile.update({
      companyName: document.getElementById('cfg-company-name').value,
      divisionName: divName,
      departmentName: deptName,
      docNumber: document.getElementById('cfg-doc-number').value,
      iraTargetPercent: parseFloat(document.getElementById('cfg-ira-target').value) || 98.0
    });

    // Save to local repository
    this.repo.saveSignatures();
    this.repo.saveCompany();

    // Update Printout, Dashboard View, and Settings info
    this.renderPrintout();
    this.renderDashboard();
    this.updateSettingsDataInfo();

    // Sync to Supabase Cloud cc_settings
    let cloudSynced = false;
    if (window.supabaseService && window.supabaseService.isConnected) {
      const res = await window.supabaseService.syncSettings(
        this.signatureMatrix,
        this.companyProfile,
        this.auth.currentUser ? this.auth.currentUser.name : 'ADMIN'
      );
      cloudSynced = res && res.success;
    }

    Swal.fire({
      icon: 'success',
      title: 'Pengaturan Disimpan',
      html: `
        <div>Kustomisasi tanda tangan (TTD) dan standar audit telah diperbarui.</div>
        <div style="margin-top: 0.5rem; font-size: 0.8rem; color: ${cloudSynced ? 'var(--brand-primary)' : 'var(--text-muted)'}; font-weight: 700;">
          <i class="fa-solid ${cloudSynced ? 'fa-cloud-arrow-up' : 'fa-hard-drive'}"></i>
          ${cloudSynced ? 'Tersinkronisasi ke Supabase Cloud (zaxrouzuwryymdolhlix)' : 'Tersimpan di Penyimpanan Lokal (Offline)'}
        </div>
      `,
      customClass: { popup: 'swal-custom-popup' }
    });
  }

  // ================= 8B. SETTINGS: DATASET & DUMMY DATA MANAGEMENT =================
  updateSettingsDataInfo() {
    const totalEl = document.getElementById('settings-data-total');
    const summaryEl = document.getElementById('settings-data-summary');
    if (!totalEl || !summaryEl) return;

    const total = this.items.length;
    if (total === 0) {
      totalEl.textContent = '0 SKU (Data Kosong)';
      summaryEl.textContent = 'Tabel bersih. Siap untuk input manual atau import SAP.';
      return;
    }

    let matched = 0;
    let diff = 0;
    let totalSap = 0;
    this.items.forEach(i => {
      if (i.isCounted()) {
        if (i.isMatched()) matched++;
        else diff++;
      }
      totalSap += (i.qtySap || 0);
    });

    totalEl.textContent = `${total} SKU Material`;
    summaryEl.textContent = `${matched} Cocok • ${diff} Selisih • Total SAP: ${totalSap.toLocaleString('id-ID', { minimumFractionDigits: 2 })} KG`;
  }

  clearDummyData() {
    Swal.fire({
      title: 'Kosongkan Seluruh Data?',
      text: 'Semua item SKU dummy akan dihapus (0 item) baik di penyimpanan lokal maupun di database cloud.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-trash-can"></i> Ya, Kosongkan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626',
      customClass: { popup: 'swal-custom-popup' }
    }).then(async (result) => {
      if (result.isConfirmed) {
        // Clear local repository
        this.repo.clearAllItems();
        this.items = this.repo.items;

        // Clear Supabase Cloud
        let cloudCleared = false;
        if (window.supabaseService && window.supabaseService.isConnected) {
          const res = await window.supabaseService.clearAllItems();
          cloudCleared = res && res.success;
        }

        this.calculateUniqueBins();
        this.renderDashboard();
        this.renderActiveBinView();
        this.renderPrintout();
        this.updateSettingsDataInfo();
        this.renderSettingsSkuTable();

        Swal.fire({
          icon: 'success',
          title: 'Data Dikosongkan',
          html: `
            <div>Seluruh data dummy berhasil dihapus (0 SKU).</div>
            <div style="margin-top: 0.4rem; font-size: 0.8rem; color: var(--brand-primary); font-weight: 700;">
              ${cloudCleared ? '<i class="fa-solid fa-cloud"></i> Sinkronisasi cloud berhasil: tabel cc_items telah dikosongkan.' : '<i class="fa-solid fa-hard-drive"></i> Data lokal berhasil dikosongkan.'}
            </div>
          `,
          timer: 1800,
          showConfirmButton: false,
          customClass: { popup: 'swal-custom-popup' }
        });
      }
    });
  }

  loadDefaultDummyData() {
    Swal.fire({
      title: 'Set / Muat 20 Data Dummy SAP?',
      text: 'Data akan digantikan dengan 20 item dummy SAP standar (termasuk 4 studi kasus: normal, selisih kurang, salah BIN, selisih lebih) dan disinkronkan ke Supabase Cloud.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-rotate-left"></i> Ya, Muat Dummy',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#10b981',
      customClass: { popup: 'swal-custom-popup' }
    }).then(async (result) => {
      if (result.isConfirmed) {
        this.repo.loadDummyData();
        this.items = this.repo.items;

        let cloudSynced = false;
        if (window.supabaseService && window.supabaseService.isConnected) {
          const res = await window.supabaseService.bulkUpsertItems(this.items);
          cloudSynced = res && res.success;
        }

        this.calculateUniqueBins();
        this.renderDashboard();
        this.renderActiveBinView();
        this.renderPrintout();
        this.updateSettingsDataInfo();
        this.renderSettingsSkuTable();

        Swal.fire({
          icon: 'success',
          title: 'Data Dummy Siap',
          html: `
            <div>20 data dummy SAP standar berhasil dimuat ke sistem.</div>
            <div style="margin-top: 0.4rem; font-size: 0.8rem; color: var(--brand-primary); font-weight: 700;">
              ${cloudSynced ? '<i class="fa-solid fa-cloud"></i> 20 SKU berhasil disinkronkan ke Supabase Cloud (cc_items).' : '<i class="fa-solid fa-hard-drive"></i> Dimuat ke penyimpanan lokal browser.'}
            </div>
          `,
          timer: 1800,
          showConfirmButton: false,
          customClass: { popup: 'swal-custom-popup' }
        });
      }
    });
  }

  async handleAddNewItem() {
    const bin = document.getElementById('add-item-bin').value.trim();
    const matCode = document.getElementById('add-item-code').value.trim();
    const matDesc = document.getElementById('add-item-desc').value.trim();
    const batchSap = document.getElementById('add-item-batch-sap').value.trim();
    const batchFisik = document.getElementById('add-item-batch-fisik').value.trim() || batchSap;
    const qtySap = parseFloat(document.getElementById('add-item-qty-sap').value);
    const picking = parseFloat(document.getElementById('add-item-qty-picking').value) || 0;
    const uom = document.getElementById('add-item-uom').value.trim() || 'KG';
    const expDate = document.getElementById('add-item-exp').value.trim() || '';

    if (!bin || !matCode || !matDesc || !batchSap || isNaN(qtySap)) {
      Swal.fire({
        icon: 'error',
        title: 'Form Belum Lengkap',
        text: 'Mohon lengkapi alamat BIN, Kode Material, Deskripsi, Batch SAP, dan Qty SAP.',
        customClass: { popup: 'swal-custom-popup' }
      });
      return;
    }

    const newItem = new CycleCountItem({
      no: this.items.length + 1,
      bin,
      materialNumber: matCode,
      materialDesc: matDesc,
      batchFisik,
      batchSap,
      expDate,
      uom,
      qtySap,
      pickingQty: picking,
      status: 'PENDING'
    });

    this.repo.addItem(newItem);
    this.items = this.repo.items;

    let cloudSaved = false;
    if (window.supabaseService && window.supabaseService.isConnected) {
      const res = await window.supabaseService.createItem(newItem);
      cloudSaved = res && res.success;
    }

    this.calculateUniqueBins();
    this.renderDashboard();
    this.renderActiveBinView();
    this.renderPrintout();
    this.updateSettingsDataInfo();
    this.renderSettingsSkuTable();

    // Reset Form & Close Modal
    const form = document.getElementById('form-add-item');
    if (form) form.reset();
    document.getElementById('modal-add-item').style.display = 'none';

    Swal.fire({
      icon: 'success',
      title: 'Item Ditambahkan',
      html: `
        <div>Material <strong>${matCode}</strong> (${matDesc}) berhasil ditambahkan ke rak <code>${bin}</code>.</div>
        <div style="margin-top: 0.4rem; font-size: 0.8rem; color: var(--brand-primary); font-weight: 700;">
          ${cloudSaved ? '<i class="fa-solid fa-cloud"></i> Tersimpan di Supabase Cloud & Lokal.' : '<i class="fa-solid fa-hard-drive"></i> Tersimpan di penyimpanan lokal.'}
        </div>
      `,
      timer: 1800,
      showConfirmButton: false,
      customClass: { popup: 'swal-custom-popup' }
    });
  }

  openEditItemModal(item) {
    if (!item) return;
    document.getElementById('edit-item-id').value = item.id;
    document.getElementById('edit-item-bin').value = item.bin;
    document.getElementById('edit-item-code').value = item.materialNumber;
    document.getElementById('edit-item-desc').value = item.materialDesc;
    document.getElementById('edit-item-batch-sap').value = item.batchSap;
    document.getElementById('edit-item-batch-fisik').value = item.batchFisik || item.batchSap;
    document.getElementById('edit-item-qty-sap').value = item.qtySap;
    document.getElementById('edit-item-qty-picking').value = item.pickingQty || 0;
    document.getElementById('edit-item-uom').value = item.uom || 'KG';
    document.getElementById('edit-item-exp').value = item.expDate || '';

    document.getElementById('modal-edit-item').style.display = 'flex';
  }

  async handleSaveEditItem() {
    const itemId = document.getElementById('edit-item-id').value;
    const bin = document.getElementById('edit-item-bin').value.trim();
    const matCode = document.getElementById('edit-item-code').value.trim();
    const matDesc = document.getElementById('edit-item-desc').value.trim();
    const batchSap = document.getElementById('edit-item-batch-sap').value.trim();
    const batchFisik = document.getElementById('edit-item-batch-fisik').value.trim() || batchSap;
    const qtySap = parseFloat(document.getElementById('edit-item-qty-sap').value);
    const picking = parseFloat(document.getElementById('edit-item-qty-picking').value) || 0;
    const uom = document.getElementById('edit-item-uom').value.trim() || 'KG';
    const expDate = document.getElementById('edit-item-exp').value.trim() || '';

    if (!itemId || !bin || !matCode || !matDesc || !batchSap || isNaN(qtySap)) {
      Swal.fire({
        icon: 'error',
        title: 'Data Belum Lengkap',
        text: 'Mohon lengkapi alamat BIN, Kode Material, Deskripsi, Batch SAP, dan Qty SAP.',
        customClass: { popup: 'swal-custom-popup' }
      });
      return;
    }

    const updatedItem = this.repo.updateItem(itemId, {
      bin,
      materialNumber: matCode,
      materialDesc: matDesc,
      batchSap,
      batchFisik,
      qtySap,
      pickingQty: picking,
      uom,
      expDate
    });

    this.items = this.repo.items;

    let cloudUpdated = false;
    if (window.supabaseService && window.supabaseService.isConnected && updatedItem) {
      const res = await window.supabaseService.updateItemMaster(updatedItem);
      cloudUpdated = res && res.success;
    }

    this.calculateUniqueBins();
    this.renderDashboard();
    this.renderActiveBinView();
    this.renderPrintout();
    this.updateSettingsDataInfo();
    this.renderSettingsSkuTable();

    document.getElementById('modal-edit-item').style.display = 'none';

    Swal.fire({
      icon: 'success',
      title: 'Perubahan Disimpan',
      html: `
        <div>Data material <strong>${matCode}</strong> berhasil diperbarui.</div>
        <div style="margin-top: 0.4rem; font-size: 0.8rem; color: var(--brand-primary); font-weight: 700;">
          ${cloudUpdated ? '<i class="fa-solid fa-cloud"></i> Terupdate di Supabase Cloud & Lokal.' : '<i class="fa-solid fa-hard-drive"></i> Terupdate di penyimpanan lokal.'}
        </div>
      `,
      timer: 1600,
      showConfirmButton: false,
      customClass: { popup: 'swal-custom-popup' }
    });
  }

  handleDeleteItem(itemId) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) return;

    Swal.fire({
      title: 'Hapus SKU Ini?',
      html: `Apakah Anda yakin ingin menghapus material <strong>${item.materialNumber}</strong> (${item.materialDesc}) di rak <code>${item.bin}</code>?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-trash-can"></i> Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626',
      customClass: { popup: 'swal-custom-popup' }
    }).then(async (result) => {
      if (result.isConfirmed) {
        this.repo.deleteItem(itemId);
        this.items = this.repo.items;

        let cloudDeleted = false;
        if (window.supabaseService && window.supabaseService.isConnected) {
          const res = await window.supabaseService.deleteItem(itemId);
          cloudDeleted = res && res.success;
        }

        this.calculateUniqueBins();
        this.renderDashboard();
        this.renderActiveBinView();
        this.renderPrintout();
        this.updateSettingsDataInfo();
        this.renderSettingsSkuTable();

        Swal.fire({
          icon: 'success',
          title: 'Item Dihapus',
          text: `Item berhasil dihapus dari sistem.${cloudDeleted ? ' (Tersinkronisasi ke Cloud)' : ''}`,
          timer: 1500,
          showConfirmButton: false,
          customClass: { popup: 'swal-custom-popup' }
        });
      }
    });
  }

  renderSettingsSkuTable() {
    const tbody = document.getElementById('settings-sku-tbody');
    if (!tbody) return;

    const searchInput = document.getElementById('settings-sku-search');
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const list = this.items.filter(item => {
      if (!q) return true;
      const str = `${item.bin} ${item.materialNumber} ${item.materialDesc} ${item.batchSap}`.toLowerCase();
      return str.includes(q);
    });

    tbody.innerHTML = '';

    if (list.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="7" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">
          <i class="fa-solid fa-box-open" style="font-size: 1.5rem; margin-bottom: 0.4rem; display: block;"></i>
          ${this.items.length === 0 ? 'Dataset kosong (0 SKU). Silakan klik "Tambah SKU Baru" atau "Set / Muat 20 Data Dummy SAP".' : 'Tidak ada SKU yang cocok dengan pencarian "' + q + '".'}
        </td>
      `;
      tbody.appendChild(tr);
      return;
    }

    list.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-subtle)';
      tr.innerHTML = `
        <td style="text-align: center; color: var(--text-muted); font-family: var(--font-mono); padding: 0.45rem 0.65rem;">${item.no || idx + 1}</td>
        <td style="padding: 0.45rem 0.65rem;"><span class="badge-bin" style="font-size: 0.72rem;">${item.bin}</span></td>
        <td class="font-mono" style="color: var(--text-secondary); padding: 0.45rem 0.65rem;">${item.materialNumber}</td>
        <td style="padding: 0.45rem 0.65rem;">
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.76rem;">${item.materialDesc}</div>
        </td>
        <td class="font-mono" style="color: var(--text-muted); padding: 0.45rem 0.65rem; font-size: 0.74rem;">${item.batchSap}</td>
        <td style="text-align: right; font-weight: 800; font-family: var(--font-mono); padding: 0.45rem 0.65rem;">${item.qtySap.toLocaleString('id-ID', { minimumFractionDigits: 2 })} ${item.uom}</td>
        <td style="text-align: center; padding: 0.45rem 0.65rem; white-space: nowrap;">
          <button class="btn-core btn-secondary btn-sm" style="padding: 0.2rem 0.45rem; font-size: 0.72rem; margin-right: 0.25rem;" data-action="edit-sku" data-id="${item.id}" title="Edit SKU">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn-core btn-danger-outline btn-sm" style="padding: 0.2rem 0.45rem; font-size: 0.72rem;" data-action="delete-sku" data-id="${item.id}" title="Hapus SKU">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      `;

      tr.querySelector('[data-action="edit-sku"]').addEventListener('click', () => {
        this.openEditItemModal(item);
      });

      tr.querySelector('[data-action="delete-sku"]').addEventListener('click', () => {
        this.handleDeleteItem(item.id);
      });

      tbody.appendChild(tr);
    });
  }

  // ================= 9. CHECKER ACTIVE BIN VIEW RENDERING =================
  renderActiveBinView() {
    if (this.items.length === 0) {
      document.getElementById('display-active-bin').textContent = '-';
      document.getElementById('display-active-bin-counter').textContent = 'Data Kosong (0 Item)';
      document.getElementById('btn-prev-bin').disabled = true;
      document.getElementById('btn-next-bin').disabled = true;
      document.getElementById('checker-focus-container').style.display = 'none';
      document.getElementById('checker-list-container').style.display = 'flex';
      document.getElementById('checker-list-container').innerHTML = `
        <div style="background: var(--surface-main); border: 1px dashed var(--border-strong); border-radius: var(--radius-md); padding: 2.5rem 1.5rem; text-align: center; width: 100%;">
          <i class="fa-solid fa-boxes-stacked" style="font-size: 2.5rem; color: var(--text-subtle); margin-bottom: 0.75rem;"></i>
          <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.4rem;">Belum Ada Data Rak &amp; Material</h4>
          <p style="font-size: 0.82rem; color: var(--text-muted); max-width: 400px; margin: 0 auto 1.25rem;">Dataset saat ini kosong. Anda dapat memuat 20 data dummy SAP standar di Pengaturan atau melakukan Import dari file SAP ALV.</p>
          <button class="btn-core btn-primary" id="btn-empty-load-dummy">
            <i class="fa-solid fa-rotate-left"></i>
            <span>Muat 20 Data Dummy SAP</span>
          </button>
        </div>
      `;
      const emptyBtn = document.getElementById('btn-empty-load-dummy');
      if (emptyBtn) emptyBtn.addEventListener('click', () => this.loadDefaultDummyData());
      return;
    }

    const currentBin = this.getCurrentBin();
    const binItems = this.getItemsInCurrentBin();

    document.getElementById('display-active-bin').textContent = currentBin;
    document.getElementById('display-active-bin-counter').textContent =
      `Rak ${this.currentBinIndex + 1} dari ${this.uniqueBins.length} &bull; ${binItems.length} Item`;

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
    const targetNet = item.getTargetNet();
    const isCounted = item.isCounted();
    const diff = item.getVariance();
    const isDiff = item.isDiscrepancy();

    document.getElementById('fc-bin').textContent = item.bin;
    document.getElementById('fc-mat-desc').textContent = item.materialDesc;
    document.getElementById('fc-mat-code').textContent = item.materialNumber;
    document.getElementById('fc-uom').textContent = item.uom;
    document.getElementById('fc-batch-fisik').textContent = item.batchFisik;
    document.getElementById('fc-batch-sap').textContent = item.batchSap;
    document.getElementById('fc-exp-date').textContent = item.expDate;
    document.getElementById('fc-picking').textContent = `${item.pickingQty.toFixed(1)} ${item.uom}`;
    document.getElementById('fc-target-net').textContent = `${targetNet.toFixed(3)} ${item.uom}`;

    let badgeHtml = '<span class="app-badge badge-pending"><i class="fa-regular fa-clock"></i> BELUM HITUNG</span>';
    if (isCounted) {
      if (isDiff) {
        badgeHtml = '<span class="app-badge badge-diff"><i class="fa-solid fa-triangle-exclamation"></i> SELISIH</span>';
      } else {
        badgeHtml = '<span class="app-badge badge-match"><i class="fa-solid fa-circle-check"></i> COCOK</span>';
      }
    }
    if (item.isMisplaced) {
      badgeHtml += ` <span class="app-badge badge-reloc"><i class="fa-solid fa-truck-ramp-box"></i> PINDAH: ${item.newBin}</span>`;
    }
    document.getElementById('fc-status-badge').innerHTML = badgeHtml;

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

    document.getElementById('fc-btn-match-text').textContent = `Sesuai Target (${targetNet.toFixed(0)} ${item.uom})`;
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
      const targetNet = item.getTargetNet();
      const isCounted = item.isCounted();
      const isDiff = item.isDiscrepancy();

      let badge = '<span class="app-badge badge-pending"><i class="fa-regular fa-clock"></i> BELUM</span>';
      if (isCounted) {
        badge = isDiff ? '<span class="app-badge badge-diff"><i class="fa-solid fa-triangle-exclamation"></i> SELISIH</span>' : '<span class="app-badge badge-match"><i class="fa-solid fa-circle-check"></i> COCOK</span>';
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
          <button class="btn-core btn-primary btn-sm" data-action="list-match">
            <i class="fa-solid fa-check"></i>
            <span>Sesuai</span>
          </button>
          <button class="btn-core btn-secondary btn-sm" data-action="list-edit">
            <i class="fa-solid fa-pen-to-square"></i>
            <span>Input Fisik</span>
          </button>
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

  // ================= 10. QUICK MATCH & MODAL ACTIONS =================
  quickMatchItem(item) {
    if (!this.auth.canEditItems()) {
      Swal.fire({ icon: 'warning', title: 'Akses Ditolak', text: 'Peran akun Anda tidak memiliki hak akses mengubah stok fisik.' });
      return;
    }

    const operatorName = this.auth.currentUser ? this.auth.currentUser.name : 'Petugas';
    item.quickMatch(operatorName);

    this.repo.saveItems();
    if (window.supabaseService) {
      window.supabaseService.syncItem(item);
    }

    this.renderActiveBinView();
    this.renderDashboard();
    this.renderPrintout();

    Swal.fire({
      icon: 'success',
      title: 'Stok Sesuai (100% Cocok)',
      text: `${item.materialDesc} telah ditandai cocok dengan SAP (${item.getTargetNet().toFixed(2)} ${item.uom}).`,
      timer: 1200,
      showConfirmButton: false,
      customClass: { popup: 'swal-custom-popup' }
    });
  }

  openCheckerInputModal(item, forceMisplaced = false) {
    if (!this.auth.canEditItems()) {
      Swal.fire({ icon: 'warning', title: 'Akses Ditolak', text: 'Peran akun Anda tidak memiliki hak akses mengubah stok fisik.' });
      return;
    }

    this.activeEditItem = item;
    const targetNet = item.getTargetNet();

    document.getElementById('m-item-desc').textContent = item.materialDesc;
    document.getElementById('m-item-code').textContent = item.materialNumber;
    document.getElementById('m-item-net').textContent = `${targetNet.toFixed(3)} ${item.uom}`;
    document.getElementById('m-item-batch-fisik').textContent = item.batchFisik;

    document.getElementById('calc-pack-qty').value = '';
    document.getElementById('calc-pack-partial').value = '';
    document.getElementById('input-actual-qty').value = item.actualQty !== null ? item.actualQty : '';
    document.getElementById('input-item-note').value = item.note || '';

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
      Swal.fire({
        icon: 'warning',
        title: 'Input Kuantitas Kosong',
        text: 'Total kuantitas fisik aktual wajib diisi!',
        customClass: { popup: 'swal-custom-popup' }
      });
      return;
    }

    const actualQty = parseFloat(actualStr);
    const isMisplaced = document.getElementById('check-is-misplaced').checked;
    const newBin = document.getElementById('input-new-bin').value.trim();
    const note = document.getElementById('input-item-note').value.trim();
    const operatorName = this.auth.currentUser ? this.auth.currentUser.name : 'Petugas';

    this.activeEditItem.recordCount(actualQty, note, isMisplaced, newBin, operatorName);

    this.repo.saveItems();
    if (window.supabaseService) {
      window.supabaseService.syncItem(this.activeEditItem);
    }

    document.getElementById('modal-checker-input').style.display = 'none';
    this.renderActiveBinView();
    this.renderDashboard();
    this.renderPrintout();

    Swal.fire({
      icon: this.activeEditItem.isMatched() ? 'success' : 'warning',
      title: this.activeEditItem.isMatched() ? 'Hasil Hitung Cocok' : 'Tercatat Selisih',
      text: `${this.activeEditItem.materialDesc}: ${actualQty.toFixed(2)} ${this.activeEditItem.uom}`,
      timer: 1300,
      showConfirmButton: false,
      customClass: { popup: 'swal-custom-popup' }
    });
  }

  // ================= 11. MODERN APEXCHARTS ANALYTICS =================
  renderAnalyticsCharts() {
    if (typeof ApexCharts === 'undefined') return;

    let matched = 0;
    let discrepancy = 0;
    let pending = 0;
    const binVarianceMap = {};

    this.items.forEach(item => {
      const binPrefix = item.bin ? item.bin.substring(0, 5) : 'OTHER';
      if (!binVarianceMap[binPrefix]) binVarianceMap[binPrefix] = 0;

      if (!item.isCounted()) {
        pending++;
      } else {
        const diff = item.getVariance();
        binVarianceMap[binPrefix] += diff;
        if (item.isMatched()) {
          matched++;
        } else {
          discrepancy++;
        }
      }
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const subtextColor = isDark ? '#94a3b8' : '#64748b';

    // 1. Donut Chart
    const donutOptions = {
      series: [matched, discrepancy, pending],
      labels: ['Cocok (Matched)', 'Selisih (Discrepancy)', 'Belum Hitung'],
      colors: ['#10b981', '#f87171', '#fbbf24'],
      chart: {
        type: 'donut',
        height: 240,
        background: 'transparent',
        toolbar: { show: false }
      },
      dataLabels: { enabled: false },
      legend: {
        position: 'bottom',
        labels: { colors: textColor },
        fontSize: '12px'
      },
      stroke: {
        show: true,
        colors: [isDark ? '#181818' : '#ffffff'],
        width: 2
      },
      plotOptions: {
        pie: {
          donut: {
            size: '72%',
            labels: {
              show: true,
              name: { color: subtextColor, fontSize: '12px' },
              value: { color: textColor, fontSize: '18px', fontWeight: 800 },
              total: {
                show: true,
                label: 'Total Item',
                color: subtextColor,
                formatter: () => `${this.items.length} SKU`
              }
            }
          }
        }
      }
    };

    const donutEl = document.getElementById('chart-ira-donut');
    if (donutEl) {
      if (this.iraDonutChart) this.iraDonutChart.destroy();
      this.iraDonutChart = new ApexCharts(donutEl, donutOptions);
      this.iraDonutChart.render();
    }

    // 2. Bar Chart
    const binCategories = Object.keys(binVarianceMap);
    const binValues = binCategories.map(k => parseFloat(binVarianceMap[k].toFixed(2)));

    const barOptions = {
      series: [{
        name: 'Net Variance (KG)',
        data: binValues
      }],
      chart: {
        type: 'bar',
        height: 240,
        background: 'transparent',
        toolbar: { show: false }
      },
      colors: [function({ value }) {
        return value < 0 ? '#f87171' : (value > 0 ? '#60a5fa' : '#10b981');
      }],
      plotOptions: {
        bar: {
          borderRadius: 4,
          columnWidth: '45%',
          colors: {
            ranges: [
              { from: -99999, to: -0.01, color: '#f87171' },
              { from: 0.01, to: 99999, color: '#60a5fa' }
            ]
          }
        }
      },
      dataLabels: {
        enabled: true,
        formatter: (val) => `${val > 0 ? '+' : ''}${val} kg`,
        style: { fontSize: '11px', colors: [textColor] }
      },
      xaxis: {
        categories: binCategories,
        labels: { style: { colors: subtextColor, fontSize: '12px', fontWeight: 700 } },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          style: { colors: subtextColor, fontSize: '11px' },
          formatter: (val) => `${val} kg`
        }
      },
      grid: {
        borderColor: isDark ? '#2e2e2e' : '#e2e8f0',
        strokeDashArray: 4
      },
      tooltip: {
        theme: isDark ? 'dark' : 'light',
        y: { formatter: (val) => `${val} KG` }
      }
    };

    const barEl = document.getElementById('chart-variance-bar');
    if (barEl) {
      if (this.varianceBarChart) this.varianceBarChart.destroy();
      this.varianceBarChart = new ApexCharts(barEl, barOptions);
      this.varianceBarChart.render();
    }
  }

  // ================= 12. DASHBOARD RENDERING & DATATABLES =================
  renderDashboard() {
    let total = this.items.length;
    let matched = 0;
    let diffCount = 0;
    let misplacedCount = 0;
    let netVariance = 0;

    this.items.forEach(item => {
      if (item.isCounted()) {
        const diff = item.getVariance();
        netVariance += diff;
        if (item.isMatched()) {
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

    // Benchmark target label from CompanyProfile model
    const benchEl = document.getElementById('dash-ira-benchmark');
    if (benchEl) {
      benchEl.textContent = `Target Standar Audit: \u2265 ${this.companyProfile.iraTargetPercent.toFixed(1)}%`;
    }

    const navBadge = document.getElementById('nav-item-count');
    if (navBadge) navBadge.textContent = total;

    let totalSapKg = 0;
    this.items.forEach(i => totalSapKg += i.qtySap);
    document.getElementById('dash-total-sap').textContent = `Total SAP: ${totalSapKg.toLocaleString('id-ID', { minimumFractionDigits: 2 })} KG`;

    this.renderAnalyticsCharts();

    if (window.jQuery && $.fn.DataTable && $.fn.DataTable.isDataTable('#master-table')) {
      $('#master-table').DataTable().destroy();
    }

    const filterBin = document.getElementById('dash-filter-bin') ? document.getElementById('dash-filter-bin').value : 'ALL';
    const filterStatus = document.getElementById('dash-filter-status') ? document.getElementById('dash-filter-status').value : 'ALL';
    const searchVal = document.getElementById('dash-search-input') ? document.getElementById('dash-search-input').value.toLowerCase().trim() : '';

    const filteredItems = this.items.filter(item => {
      if (filterBin !== 'ALL' && !item.bin.startsWith(filterBin)) return false;

      if (filterStatus === 'DISCREPANCY' && !item.isDiscrepancy()) return false;
      if (filterStatus === 'MATCHED' && !item.isMatched()) return false;
      if (filterStatus === 'PENDING' && item.isCounted()) return false;
      if (filterStatus === 'MISPLACED' && !item.isMisplaced) return false;

      if (searchVal) {
        const text = `${item.bin} ${item.materialNumber} ${item.materialDesc} ${item.batchFisik} ${item.batchSap}`.toLowerCase();
        if (!text.includes(searchVal)) return false;
      }

      return true;
    });

    const tbody = document.getElementById('dash-master-tbody');
    tbody.innerHTML = '';

    filteredItems.forEach((item, idx) => {
      const targetNet = item.getTargetNet();
      const isCounted = item.isCounted();
      const diff = item.getVariance();
      const isDiff = item.isDiscrepancy();

      const tr = document.createElement('tr');
      if (isDiff) tr.className = 'row-discrepancy';
      if (item.isMisplaced) tr.className = 'row-relocated';

      let statusBadge = '<span class="app-badge badge-pending"><i class="fa-regular fa-clock"></i> PENDING</span>';
      if (isCounted) {
        statusBadge = isDiff ? '<span class="app-badge badge-diff"><i class="fa-solid fa-triangle-exclamation"></i> SELISIH</span>' : '<span class="app-badge badge-match"><i class="fa-solid fa-circle-check"></i> COCOK</span>';
      }
      if (item.isMisplaced) statusBadge += ` <span class="app-badge badge-reloc"><i class="fa-solid fa-truck-ramp-box"></i> PINDAH</span>`;

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
          ${item.isMisplaced && item.newBin ? `<div style="color: var(--status-reloc); font-weight: 600; margin-top: 0.2rem;"><i class="fa-solid fa-arrow-turn-down"></i> Pindah ke: ${item.newBin}</div>` : ''}
        </td>
        <td style="text-align: center;">
          <button class="btn-core btn-secondary btn-sm" data-action="tbl-edit">
            <i class="fa-solid fa-pen-to-square"></i>
            <span>Edit</span>
          </button>
        </td>
      `;

      tr.querySelector('[data-action="tbl-edit"]').addEventListener('click', () => {
        this.openCheckerInputModal(item);
      });

      tbody.appendChild(tr);
    });

    if (window.jQuery && $.fn.DataTable) {
      this.dataTable = $('#master-table').DataTable({
        pageLength: 10,
        lengthMenu: [5, 10, 20, 50],
        order: [[0, 'asc']],
        destroy: true,
        language: {
          search: '<i class="fa-solid fa-magnifying-glass"></i>',
          searchPlaceholder: 'Filter tabel...',
          lengthMenu: 'Tampilkan _MENU_ baris',
          info: '_START_ - _END_ dari _TOTAL_ item',
          infoEmpty: '0 item',
          paginate: {
            first: '<i class="fa-solid fa-angles-left"></i>',
            previous: '<i class="fa-solid fa-angle-left"></i>',
            next: '<i class="fa-solid fa-angle-right"></i>',
            last: '<i class="fa-solid fa-angles-right"></i>'
          }
        },
        drawCallback: () => {
          document.querySelectorAll('[data-action="tbl-edit"]').forEach(btn => {
            btn.onclick = () => {
              const row = btn.closest('tr');
              const matNumber = row.cells[2].textContent.trim();
              const item = this.items.find(i => i.materialNumber === matNumber);
              if (item) this.openCheckerInputModal(item);
            };
          });
        }
      });
    }
  }

  // ================= 13. DYNAMIC BERITA ACARA PRINTOUT (OOP-POWERED) =================
  renderPrintout() {
    const comp = this.companyProfile;
    const sigs = this.signatureMatrix;

    // 1. Dynamic Header & Document Info (Customizable)
    const docCompEl = document.getElementById('doc-company-name');
    if (docCompEl) docCompEl.textContent = comp.companyName;

    const docDivEl = document.getElementById('doc-division-name');
    if (docDivEl) docDivEl.textContent = `${comp.divisionName} • ${comp.departmentName}`;

    const docNoEl = document.getElementById('doc-no-text');
    if (docNoEl) docNoEl.textContent = comp.docNumber;

    const docSpvEl = document.getElementById('doc-spv-text');
    if (docSpvEl) docSpvEl.textContent = sigs.supervisor.name;

    // 2. Dynamic 4-Tier Signatures Matrix (Customizable)
    const setSig = (roleKey, titleId, nameId, posId) => {
      const officer = sigs[roleKey];
      if (document.getElementById(titleId)) document.getElementById(titleId).textContent = officer.title;
      if (document.getElementById(nameId)) document.getElementById(nameId).textContent = officer.name;
      if (document.getElementById(posId)) document.getElementById(posId).textContent = officer.position;
    };

    setSig('checker', 'sig-checker-title', 'sig-checker-name', 'sig-checker-position');
    setSig('supervisor', 'sig-supervisor-title', 'sig-supervisor-name', 'sig-supervisor-position');
    setSig('controller', 'sig-controller-title', 'sig-controller-name', 'sig-controller-position');
    setSig('accounting', 'sig-accounting-title', 'sig-accounting-name', 'sig-accounting-position');

    // 3. Render Table Rows
    const tbody = document.getElementById('printout-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    this.items.forEach((item, idx) => {
      const targetNet = item.getTargetNet();
      const isCounted = item.isCounted();
      const diff = item.getVariance();
      const isDiff = item.isDiscrepancy();

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

  // ================= 14. EXPORT CSV & RESET =================
  exportCsv() {
    const headers = ['No', 'BIN', 'Kode Material', 'Deskripsi Material', 'Batch Fisik Vendor', 'Batch SAP', 'Qty SAP', 'Picking', 'Target Net', 'Aktual Fisik', 'Variance', 'Status', 'Catatan'];
    const rows = this.items.map((item, idx) => {
      const targetNet = item.getTargetNet();
      const isCounted = item.isCounted();
      const diff = isCounted ? item.getVariance() : '';

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
    link.download = `Hasil_Cycle_Count_RMPM_${new Date().toISOString().substring(0, 10)}.csv`;
    link.click();

    Swal.fire({
      icon: 'success',
      title: 'Export Berhasil',
      text: 'File CSV hasil rekonsiliasi telah diunduh.',
      timer: 1400,
      showConfirmButton: false,
      customClass: { popup: 'swal-custom-popup' }
    });
  }

  async resetDemoData() {
    if (!this.auth.canResetData()) {
      Swal.fire({ icon: 'error', title: 'Akses Ditolak', text: 'Hanya Administrator yang memiliki wewenang mereset data.' });
      return;
    }

    const res = await Swal.fire({
      title: 'Reset ke Data Contoh Asli?',
      text: 'Data akan dikembalikan ke 20 baris asli dari lembar kertas audit.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-arrows-rotate"></i> Ya, Reset',
      cancelButtonText: 'Batal',
      customClass: { popup: 'swal-custom-popup' }
    });

    if (res.isConfirmed) {
      this.repo.resetDemoData();
      this.items = this.repo.items;
      this.signatureMatrix = this.repo.signatureMatrix;
      this.companyProfile = this.repo.companyProfile;
      this.calculateUniqueBins();
      this.currentBinIndex = 0;
      this.currentItemIndexInBin = 0;

      this.renderActiveBinView();
      this.renderDashboard();
      this.renderPrintout();
      this.loadAdminSettingsForm();

      Swal.fire({
        icon: 'success',
        title: 'Berhasil Direset',
        text: 'Data jadwal telah dikembalikan ke kondisi awal lembar fisik.',
        timer: 1400,
        showConfirmButton: false,
        customClass: { popup: 'swal-custom-popup' }
      });
    }
  }

  processSapImport() {
    if (!this.auth.canImportSap()) {
      Swal.fire({ icon: 'error', title: 'Akses Ditolak', text: 'Hanya Administrator yang memiliki wewenang mengimpor data SAP.' });
      return;
    }

    const raw = document.getElementById('import-text-data').value.trim();
    if (!raw) {
      Swal.fire({
        icon: 'warning',
        title: 'Data Masih Kosong',
        text: 'Tempelkan data tabel ALV Grid SAP terlebih dahulu!',
        customClass: { popup: 'swal-custom-popup' }
      });
      return;
    }

    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const newItems = [];

    lines.forEach((line, idx) => {
      let cols = line.split('\t');
      if (cols.length < 5) cols = line.split(/[\;,]/);
      if (cols.length >= 7) {
        newItems.push(new CycleCountItem({
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
        }));
      }
    });

    if (newItems.length > 0) {
      this.items = newItems;
      this.repo.items = newItems;
      this.calculateUniqueBins();
      this.currentBinIndex = 0;
      this.currentItemIndexInBin = 0;
      this.repo.saveItems();
      document.getElementById('import-text-data').value = '';

      Swal.fire({
        icon: 'success',
        title: 'Import Selesai',
        text: `Berhasil memuat ${newItems.length} baris jadwal SKU dari SAP!`,
        customClass: { popup: 'swal-custom-popup' }
      });

      this.switchView('view-checker');
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Format Tidak Valid',
        text: 'Format kolom tidak terbaca. Pastikan dipisahkan oleh Tab dari Excel ALV Grid.',
        customClass: { popup: 'swal-custom-popup' }
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new CycleCountApp();
});
