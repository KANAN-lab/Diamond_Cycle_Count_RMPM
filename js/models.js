// ==============================================================================
// RMPM Cycle Count System - Object-Oriented Domain Models (OOP Architecture)
// Zero-Hardcode Design: All signature officers, company profiles, and item
// calculations are fully encapsulated into dynamic OOP models with serialization.
// ==============================================================================

/**
 * 1. CycleCountItem Model
 * Encapsulates a single SKU / Batch inventory line item with business logic.
 */
class CycleCountItem {
  constructor(data = {}) {
    this.id = data.id || ('item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5));
    this.no = data.no || 1;
    this.bin = data.bin || '';
    this.materialNumber = data.materialNumber || '';
    this.materialDesc = data.materialDesc || '';
    this.batchFisik = data.batchFisik || '';
    this.batchSap = data.batchSap || '';
    this.expDate = data.expDate || '';
    this.uom = (data.uom || 'KG').toUpperCase();
    this.qtySap = parseFloat(data.qtySap) || 0;
    this.pickingQty = parseFloat(data.pickingQty) || 0;
    this.actualQty = data.actualQty !== null && data.actualQty !== undefined ? parseFloat(data.actualQty) : null;
    this.unitConversion = data.unitConversion || '';
    this.note = data.note || '';
    this.isMisplaced = Boolean(data.isMisplaced);
    this.newBin = data.newBin || '';
    this.status = data.status || 'PENDING';
    this.countedBy = data.countedBy || '';
    this.countedAt = data.countedAt || '';
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  // Business Logic Methods
  getTargetNet() {
    return Math.max(0, this.qtySap - (this.pickingQty || 0));
  }

  isCounted() {
    return this.actualQty !== null && this.actualQty !== undefined && !isNaN(this.actualQty);
  }

  getVariance() {
    if (!this.isCounted()) return null;
    return this.actualQty - this.getTargetNet();
  }

  isMatched() {
    if (!this.isCounted()) return false;
    return Math.abs(this.getVariance()) < 0.001;
  }

  isDiscrepancy() {
    if (!this.isCounted()) return false;
    return Math.abs(this.getVariance()) >= 0.001;
  }

  recordCount(actualQty, note = '', isMisplaced = false, newBin = '', operatorName = 'Petugas') {
    this.actualQty = parseFloat(actualQty);
    this.note = note.trim();
    this.isMisplaced = Boolean(isMisplaced);
    this.newBin = isMisplaced ? newBin.trim() : '';
    this.status = this.isMatched() ? 'MATCHED' : 'DISCREPANCY';
    this.countedBy = operatorName;
    this.countedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);
    this.updatedAt = new Date().toISOString();
  }

  quickMatch(operatorName = 'Petugas') {
    this.recordCount(this.getTargetNet(), 'Fisik utuh sesuai target SAP', false, '', operatorName);
    this.status = 'MATCHED';
  }

  toJSON() {
    return {
      id: this.id,
      no: this.no,
      bin: this.bin,
      materialNumber: this.materialNumber,
      materialDesc: this.materialDesc,
      batchFisik: this.batchFisik,
      batchSap: this.batchSap,
      expDate: this.expDate,
      uom: this.uom,
      qtySap: this.qtySap,
      pickingQty: this.pickingQty,
      actualQty: this.actualQty,
      unitConversion: this.unitConversion,
      note: this.note,
      isMisplaced: this.isMisplaced,
      newBin: this.newBin,
      status: this.status,
      countedBy: this.countedBy,
      countedAt: this.countedAt,
      updatedAt: this.updatedAt
    };
  }

  static fromJSON(json) {
    return new CycleCountItem(json);
  }
}

/**
 * 2. SignatureOfficer Model
 * Represents one officer in the 4-tier official Berita Acara signature matrix.
 */
class SignatureOfficer {
  constructor(data = {}) {
    this.roleKey = data.roleKey || 'checker'; // 'checker', 'supervisor', 'controller', 'accounting'
    this.title = data.title || 'Dihitung Oleh (Checker)';
    this.name = data.name || '';
    this.position = data.position || '';
    this.department = data.department || '';
    this.nik = data.nik || '';
  }

  toJSON() {
    return {
      roleKey: this.roleKey,
      title: this.title,
      name: this.name,
      position: this.position,
      department: this.department,
      nik: this.nik
    };
  }

  static fromJSON(json) {
    return new SignatureOfficer(json);
  }
}

/**
 * 3. SignatureMatrix Model
 * Encapsulates all 4 official sign-off authorities for Berita Acara.
 * Can be customized by Administrator without touching code.
 */
class SignatureMatrix {
  constructor(data = {}) {
    this.checker = new SignatureOfficer(data.checker || {
      roleKey: 'checker',
      title: 'Dihitung Oleh (Checker)',
      name: 'BUDI SANTOSO',
      position: 'Petugas Cycle Count',
      department: 'Warehouse Operations'
    });

    this.supervisor = new SignatureOfficer(data.supervisor || {
      roleKey: 'supervisor',
      title: 'Diperiksa Oleh (SPV RMPM)',
      name: 'ASEP SAEPULLAH',
      position: 'Supervisor Warehouse',
      department: 'RMPM Warehouse'
    });

    this.controller = new SignatureOfficer(data.controller || {
      roleKey: 'controller',
      title: 'Diverifikasi (Inventory Control)',
      name: 'HENDRA WIJAYA',
      position: 'Inventory Controller',
      department: 'Supply Chain Planning'
    });

    this.accounting = new SignatureOfficer(data.accounting || {
      roleKey: 'accounting',
      title: 'Disetujui Oleh (Accounting)',
      name: 'SITI RAHAYU, SE.',
      position: 'Cost & Inventory Accounting',
      department: 'Finance & Accounting'
    });
  }

  updateOfficer(roleKey, fields = {}) {
    if (this[roleKey]) {
      if (fields.name !== undefined) this[roleKey].name = fields.name.trim();
      if (fields.position !== undefined) this[roleKey].position = fields.position.trim();
      if (fields.department !== undefined) this[roleKey].department = fields.department.trim();
      if (fields.nik !== undefined) this[roleKey].nik = fields.nik.trim();
    }
  }

  toJSON() {
    return {
      checker: this.checker.toJSON(),
      supervisor: this.supervisor.toJSON(),
      controller: this.controller.toJSON(),
      accounting: this.accounting.toJSON()
    };
  }

  static fromJSON(json) {
    return new SignatureMatrix(json || {});
  }

  static createDefault() {
    return new SignatureMatrix();
  }
}

/**
 * 4. CompanyProfile Model
 * Encapsulates company branding, document header and title for Berita Acara.
 * Fully customizable by Administrator.
 */
class CompanyProfile {
  constructor(data = {}) {
    this.companyName = data.companyName || 'PT INDUSTRI PANGAN NUSANTARA';
    this.divisionName = data.divisionName || 'Warehouse & Supply Chain Division';
    this.departmentName = data.departmentName || 'RMPM Department';
    this.docNumber = data.docNumber || 'BA-CC-RMPM/2026/09/21-01';
    this.iraTargetPercent = parseFloat(data.iraTargetPercent) || 98.0;
  }

  update(fields = {}) {
    if (fields.companyName !== undefined) this.companyName = fields.companyName.trim();
    if (fields.divisionName !== undefined) this.divisionName = fields.divisionName.trim();
    if (fields.departmentName !== undefined) this.departmentName = fields.departmentName.trim();
    if (fields.docNumber !== undefined) this.docNumber = fields.docNumber.trim();
    if (fields.iraTargetPercent !== undefined) this.iraTargetPercent = parseFloat(fields.iraTargetPercent) || 98.0;
  }

  toJSON() {
    return {
      companyName: this.companyName,
      divisionName: this.divisionName,
      departmentName: this.departmentName,
      docNumber: this.docNumber,
      iraTargetPercent: this.iraTargetPercent
    };
  }

  static fromJSON(json) {
    return new CompanyProfile(json || {});
  }

  static createDefault() {
    return new CompanyProfile();
  }
}

/**
 * 5. AuthManager Model (Login Session & RBAC)
 * Handles active session, permissions, login authentication, and logout.
 */
class AuthManager {
  static SESSION_KEY = 'rmpm_auth_session_v2';

  constructor(users = INITIAL_USERS) {
    this.users = users;
    this.currentUser = null;
    this.loadSession();
  }

  loadSession() {
    try {
      const stored = sessionStorage.getItem(AuthManager.SESSION_KEY) || localStorage.getItem(AuthManager.SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const match = this.users.find(u => u.id === parsed.id);
        this.currentUser = match || parsed;
      }
    } catch (e) {
      this.currentUser = null;
    }
  }

  isLoggedIn() {
    return Boolean(this.currentUser);
  }

  login(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return false;
    this.currentUser = user;
    const sessionData = {
      id: user.id,
      name: user.name,
      role: user.role,
      title: user.title,
      loggedInAt: new Date().toISOString()
    };
    sessionStorage.setItem(AuthManager.SESSION_KEY, JSON.stringify(sessionData));
    localStorage.setItem(AuthManager.SESSION_KEY, JSON.stringify(sessionData));
    return true;
  }

  logout() {
    this.currentUser = null;
    sessionStorage.removeItem(AuthManager.SESSION_KEY);
    localStorage.removeItem(AuthManager.SESSION_KEY);
  }

  // Permission Checks (Role-Based Access Control)
  isAdmin() {
    return this.currentUser && this.currentUser.role === 'ADMIN';
  }

  isChecker() {
    return this.currentUser && this.currentUser.role === 'CHECKER';
  }

  isAuditor() {
    return this.currentUser && (this.currentUser.role === 'AUDITOR' || this.currentUser.role === 'ACCOUNTING');
  }

  canEditItems() {
    return this.isAdmin() || this.isChecker();
  }

  canImportSap() {
    return this.isAdmin();
  }

  canCustomizeSettings() {
    return this.isAdmin();
  }

  canResetData() {
    return this.isAdmin();
  }
}

/**
 * 6. CycleCountRepository Model
 * Single Source of Truth managing persistence and state replication.
 */
class CycleCountRepository {
  static KEYS = {
    ITEMS: 'rmpm_cc_items_v2',
    SIGNATURES: 'rmpm_cc_signatures_v2',
    COMPANY: 'rmpm_cc_company_v2'
  };

  constructor() {
    this.items = [];
    this.signatureMatrix = SignatureMatrix.createDefault();
    this.companyProfile = CompanyProfile.createDefault();
    this.loadAll();
  }

  loadAll() {
    // 1. Load Items
    const storedItems = localStorage.getItem(CycleCountRepository.KEYS.ITEMS);
    if (storedItems) {
      try {
        const raw = JSON.parse(storedItems);
        this.items = raw.map(i => CycleCountItem.fromJSON(i));
      } catch (e) {
        this.items = INITIAL_ITEMS.map(i => CycleCountItem.fromJSON(i));
      }
    } else {
      this.items = INITIAL_ITEMS.map(i => CycleCountItem.fromJSON(i));
      this.saveItems();
    }

    // 2. Load Signatures
    const storedSigs = localStorage.getItem(CycleCountRepository.KEYS.SIGNATURES);
    if (storedSigs) {
      try {
        this.signatureMatrix = SignatureMatrix.fromJSON(JSON.parse(storedSigs));
      } catch (e) {
        this.signatureMatrix = SignatureMatrix.createDefault();
      }
    } else {
      this.signatureMatrix = SignatureMatrix.createDefault();
      this.saveSignatures();
    }

    // 3. Load Company Profile
    const storedCompany = localStorage.getItem(CycleCountRepository.KEYS.COMPANY);
    if (storedCompany) {
      try {
        this.companyProfile = CompanyProfile.fromJSON(JSON.parse(storedCompany));
      } catch (e) {
        this.companyProfile = CompanyProfile.createDefault();
      }
    } else {
      this.companyProfile = CompanyProfile.createDefault();
      this.saveCompany();
    }
  }

  saveItems() {
    localStorage.setItem(
      CycleCountRepository.KEYS.ITEMS,
      JSON.stringify(this.items.map(i => i.toJSON()))
    );
  }

  saveSignatures() {
    localStorage.setItem(
      CycleCountRepository.KEYS.SIGNATURES,
      JSON.stringify(this.signatureMatrix.toJSON())
    );
  }

  saveCompany() {
    localStorage.setItem(
      CycleCountRepository.KEYS.COMPANY,
      JSON.stringify(this.companyProfile.toJSON())
    );
  }

  clearAllItems() {
    this.items = [];
    this.saveItems();
  }

  loadDummyData() {
    this.items = INITIAL_ITEMS.map(i => CycleCountItem.fromJSON(i));
    this.saveItems();
  }

  addItem(item) {
    const itemObj = (item instanceof CycleCountItem) ? item : CycleCountItem.fromJSON(item);
    this.items.push(itemObj);
    this.saveItems();
    return itemObj;
  }

  resetDemoData() {
    this.items = INITIAL_ITEMS.map(i => CycleCountItem.fromJSON(i));
    this.signatureMatrix = SignatureMatrix.createDefault();
    this.companyProfile = CompanyProfile.createDefault();
    this.saveItems();
    this.saveSignatures();
    this.saveCompany();
  }
}

// Export models globally to window
window.CycleCountItem = CycleCountItem;
window.SignatureOfficer = SignatureOfficer;
window.SignatureMatrix = SignatureMatrix;
window.CompanyProfile = CompanyProfile;
window.AuthManager = AuthManager;
window.CycleCountRepository = CycleCountRepository;
