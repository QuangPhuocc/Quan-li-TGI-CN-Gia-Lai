import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import { mockOrders, mockUsers } from './src/mock/data.js';
import { 
  InsuranceOrder, 
  User, 
  ChangeLog, 
  SystemConfig,
  ImportBatch,
  Provider,
  CommissionConfig,
  BonusConfig,
  BatchStatus,
  BatchQuality
} from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ═══════════════════════════════════════════════════════════
// DATABASE PATHS
// ═══════════════════════════════════════════════════════════
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BATCHES_FILE = path.join(DATA_DIR, 'batches.json');
const COMMISSION_CONFIGS_FILE = path.join(DATA_DIR, 'commission_configs.json');
const BONUS_CONFIGS_FILE = path.join(DATA_DIR, 'bonus_configs.json');
const PROVIDERS_FILE = path.join(DATA_DIR, 'providers.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Atomic file writing helper
function writeJsonAtomic(filePath: string, data: any) {
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

// ═══════════════════════════════════════════════════════════
// INSURANCE TYPE LABELS
// ═══════════════════════════════════════════════════════════
const INSURANCE_TYPE_LABELS: Record<string, string> = {
  'TNDS_OTO': 'TNDS Ô tô',
  'VCX_OTO': 'VCX Ô tô',
  'TNDS_XEMAY': 'TNDS Xe máy',
  'Y_TE': 'BH Y tế',
  'ETC': 'Thẻ ETC',
  'KHAC': 'Khác'
};

// ═══════════════════════════════════════════════════════════
// BUSINESS LOGIC ENGINE — Core computation functions
// ═══════════════════════════════════════════════════════════

/**
 * Compute Data Quality metrics for a list of orders.
 */
function computeBatchQuality(batchOrders: InsuranceOrder[], users: User[]): BatchQuality {
  let missing_staff = 0;
  let missing_agency = 0;
  let missing_phone = 0;
  let missing_cod = 0;
  let unpaid = 0;
  let incomplete = 0;
  const total = batchOrders.length;

  batchOrders.forEach(o => {
    if (o.status === 'CANCELLED') return;

    const staffUser = users.find(u => u.id === o.staff_id);
    const isStaffOrCtv = staffUser && (staffUser.role === 'STAFF' || staffUser.role === 'CTV' || staffUser.role === 'ACCOUNTANT');
    if (!o.staff_id || !isStaffOrCtv) missing_staff++;

    if (!o.agency_id) missing_agency++;
    if (!o.customer_phone || !o.customer_phone.trim()) missing_phone++;
    if (o.cod_amount === undefined || o.cod_amount === null) missing_cod++;
    if (o.payment_status !== 'PAID') unpaid++;

    // Incomplete criteria
    let orderIncomplete = false;
    if (o.insurance_type === 'VCX_OTO') {
      orderIncomplete = !o.vehicle_owner || !o.license_plate || !o.issue_date || !o.effective_date || !o.provider || !o.hinh_xe || !o.total_fee || o.vcx_nop_ve === undefined || o.vcx_nop_ve === null || o.vcx_payment === undefined || o.vcx_payment === null || o.vcx_payment === 0;
    } else {
      const isCTV = staffUser?.role === 'CTV';
      const hasMissingStaff = !o.staff_id || !isStaffOrCtv;
      const hasMissingPhoneOrAgency = !isCTV && !o.customer_phone && !o.agency_id;
      const hasMissingFee = o.tnds_fee === 0 || o.total_fee === 0;
      orderIncomplete = hasMissingStaff || hasMissingPhoneOrAgency || hasMissingFee;
    }
    if (orderIncomplete) incomplete++;
  });

  const completed = total - incomplete;
  const completion_rate = total > 0 ? Math.round((completed / total) * 100) : 100;

  return {
    missing_staff,
    missing_agency,
    missing_phone,
    missing_cod,
    unpaid,
    incomplete,
    total,
    completion_rate
  };
}

/**
 * Resolve commission rate for a CTV based on Provider and effective date.
 * Priority: 
 * 1. If commission_rate is set manually on order -> use it
 * 2. Find config in commission_configs.json for ctv_id + provider + effective date
 * 3. Find wildcard "*" config for ctv_id + effective date
 * 4. Fallback to 0
 */
function resolveCommissionRate(
  record: InsuranceOrder,
  users?: User[],
  commConfigs?: CommissionConfig[]
): number {
  // 1. Per-order override
  if (record.commission_rate !== undefined && record.commission_rate !== null) {
    return record.commission_rate;
  }
  if (!users || !commConfigs) return 0;

  // 2. Check if staff is CTV
  const staff = users.find(u => u.id === record.staff_id);
  if (!staff || staff.role !== 'CTV') return 0;
  
  // 3. Find config for CTV + provider + date
  const now = record.issue_date || new Date().toISOString().split('T')[0];
  const configs = commConfigs
    .filter(c => c.ctv_id === staff.id)
    .filter(c => c.effective_from <= now && (!c.effective_to || c.effective_to >= now))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from)); // newest first
  
  // Exact provider match
  const exact = configs.find(c => c.provider_id === record.provider);
  if (exact) return exact.rate;
  
  // Wildcard match
  const wildcard = configs.find(c => c.provider_id === '*');
  if (wildcard) return wildcard.rate;
  
  return 0;
}

/**
 * Compute all derived fields for an insurance record.
 * This is the SINGLE SOURCE OF TRUTH for all calculated values.
 * Called on every CREATE, UPDATE, and IMPORT operation.
 */
function computeDerivedFields(record: InsuranceOrder, users?: User[], commConfigs?: CommissionConfig[]): InsuranceOrder {
  const r = { ...record };

  // 1. Handle CANCELLED status — zero out all fees
  if (r.status === 'CANCELLED') {
    r.tnds_fee = 0;
    r.nn_fee = 0;
    r.total_fee = 0;
    r.cod_amount = 0;
    r.shipping_fee = 0;
    r.base_fee = 0;
    r.nop_ve = 0;
    r.commission_amount = 0;
    r.debt_amount = 0;
    r.du = 0;
    if (r.insurance_type === 'VCX_OTO') {
      r.vcx_nop_ve = 0;
      r.vcx_payment = 0;
    }
    return r;
  }

  // 2. Base Fee (Doanh thu Hãng) = (Phí TNDS / 1.1) + LP NNTX
  r.base_fee = Math.round((r.tnds_fee / 1.1) + r.nn_fee);

  // 3. Resolve commission rate and compute commission amount
  const commRate = resolveCommissionRate(r, users, commConfigs);
  r.commission_rate = commRate; // Store resolved rate if not overridden
  r.commission_amount = Math.round(r.base_fee * commRate / 100);

  // 4. Nộp về (for TNDS/non-VCX)
  // Formula: Nộp về = ((Tổng phí - (((Phí TNDS / 1.1) + Phí NNTX) * Hoa hồng)) - COD) + Vận chuyển
  // Since (((Phí TNDS / 1.1) + Phí NNTX) * Hoa hồng) is commission_amount:
  // Nộp về = ((Tổng phí - commission_amount) - COD) + Vận chuyển
  if (r.insurance_type !== 'VCX_OTO') {
    r.nop_ve = Math.round(((r.total_fee - (r.commission_amount || 0)) - (r.cod_amount || 0)) + (r.shipping_fee || 0));
  }

  // 5. Dư (VCX only) = Thanh toán - Nộp về
  if (r.insurance_type === 'VCX_OTO') {
    r.du = (r.vcx_payment || 0) - (r.vcx_nop_ve || 0);
    // For VCX, nop_ve is the vcx_nop_ve field
    r.nop_ve = r.vcx_nop_ve || 0;
  }

  // 6. Debt tracking
  if (r.payment_status === 'UNPAID') {
    r.debt_amount = r.total_fee;
  } else if (r.payment_status === 'PARTIAL') {
    r.debt_amount = Math.max(0, r.total_fee - (r.cod_amount || 0));
  } else {
    r.debt_amount = 0;
  }

  // 7. Auto-set statement_month if missing
  if (!r.statement_month && r.issue_date) {
    const d = new Date(r.issue_date);
    if (!isNaN(d.getTime())) {
      r.statement_month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  // 8. Auto-set expiration_date if missing
  if (!r.expiration_date && r.effective_date) {
    const d = new Date(r.effective_date);
    if (!isNaN(d.getTime())) {
      d.setFullYear(d.getFullYear() + 1);
      r.expiration_date = d.toISOString().split('T')[0];
    }
  }

  return r;
}

/**
 * Recalculate expiration date when effective_date changes.
 */
function recalcExpiration(record: InsuranceOrder, updates: Partial<InsuranceOrder>): InsuranceOrder {
  const r = { ...record };
  if (updates.effective_date && updates.effective_date !== record.effective_date) {
    const d = new Date(updates.effective_date);
    d.setFullYear(d.getFullYear() + 1);
    r.expiration_date = d.toISOString().split('T')[0];
  }
  return r;
}

// ═══════════════════════════════════════════════════════════
// DATABASE READ/WRITE HELPERS
// ═══════════════════════════════════════════════════════════

function readOrders(): InsuranceOrder[] {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeOrders(orders: InsuranceOrder[]) {
  writeJsonAtomic(ORDERS_FILE, orders);
}

function readUsers(): User[] {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeUsers(users: User[]) {
  writeJsonAtomic(USERS_FILE, users);
}

function readLogs(): ChangeLog[] {
  try {
    return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeLogs(logs: ChangeLog[]) {
  writeJsonAtomic(LOGS_FILE, logs);
}

function readConfig(): SystemConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (e) {
    return {
      insurance_types: ['TNDS_OTO', 'VCX_OTO', 'TNDS_XEMAY', 'Y_TE', 'ETC', 'KHAC']
    };
  }
}

function writeConfig(config: SystemConfig) {
  writeJsonAtomic(CONFIG_FILE, config);
}

function readBatches(): ImportBatch[] {
  try {
    return JSON.parse(fs.readFileSync(BATCHES_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeBatches(batches: ImportBatch[]) {
  writeJsonAtomic(BATCHES_FILE, batches);
}

function readCommissionConfigs(): CommissionConfig[] {
  try {
    return JSON.parse(fs.readFileSync(COMMISSION_CONFIGS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeCommissionConfigs(configs: CommissionConfig[]) {
  writeJsonAtomic(COMMISSION_CONFIGS_FILE, configs);
}

function readBonusConfigs(): BonusConfig[] {
  try {
    return JSON.parse(fs.readFileSync(BONUS_CONFIGS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeBonusConfigs(configs: BonusConfig[]) {
  writeJsonAtomic(BONUS_CONFIGS_FILE, configs);
}

function readProviders(): Provider[] {
  try {
    return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeProviders(providers: Provider[]) {
  writeJsonAtomic(PROVIDERS_FILE, providers);
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION & MIGRATIONS
// ═══════════════════════════════════════════════════════════

// Initialize database files with seed data if they do not exist
if (!fs.existsSync(USERS_FILE)) {
  writeJsonAtomic(USERS_FILE, mockUsers);
}
if (!fs.existsSync(ORDERS_FILE)) {
  const seededOrders = mockOrders.map(o => {
    const updated = { ...o };
    if (!updated.expiration_date) {
      const d = new Date(updated.effective_date);
      d.setFullYear(d.getFullYear() + 1);
      updated.expiration_date = d.toISOString().split('T')[0];
    }
    if (!updated.statement_month) {
      const d = new Date(updated.issue_date);
      updated.statement_month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return updated;
  });
  writeJsonAtomic(ORDERS_FILE, seededOrders);
}
if (!fs.existsSync(LOGS_FILE)) {
  writeJsonAtomic(LOGS_FILE, []);
}

// Run migrations
try {
  if (fs.existsSync(USERS_FILE)) {
    const existingUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    const needsUserMigration = existingUsers.some((u: any) => ['diem', 'duythuong', 'linh', 'nhi', 'yen', 'diemak', 'nhivty', 'thuongld', 'yenlt', 'linhltt', 'phuoclq'].includes(u.username) && u.role !== 'MASTER');
    if (needsUserMigration) {
      const migratedUsers = [
        { id: '1', username: 'master', fullname: 'MASTER', phone: '', role: 'MASTER' },
        { id: '2', username: '0981740680', fullname: 'Kiều Diễm', phone: '0981740680', role: 'ACCOUNTANT', parent_id: '1' },
        { id: '3', username: '0931183389', fullname: 'Yến Nhi', phone: '0931183389', role: 'STAFF', parent_id: '1' },
        { id: '4', username: '0912349681', fullname: 'Duy Thương', phone: '0912349681', role: 'CTV', parent_id: '1' },
        { id: '5', username: '0942542249', fullname: 'Thị Yên', phone: '0942542249', role: 'STAFF', parent_id: '1' },
        { id: '6', username: '0962731468', fullname: 'Thuỳ Linh', phone: '0962731468', role: 'STAFF', parent_id: '1' },
        { id: '7', username: '0906643381', fullname: 'Quang Phước', phone: '0906643381', role: 'STAFF', parent_id: '1' },
        ...existingUsers.filter((u: any) => u.role === 'AGENCY').map((u: any) => {
          let parent_id = u.parent_id;
          if (parent_id === '2') parent_id = '2';
          else if (parent_id === '4') parent_id = '6';
          else if (parent_id === '5') parent_id = '3';
          else if (parent_id === '3') parent_id = '4';
          else if (parent_id === '8') parent_id = '5';
          return { ...u, parent_id };
        })
      ];
      writeJsonAtomic(USERS_FILE, migratedUsers);
      console.log('Migration 1: Restructured user accounts.');

      if (fs.existsSync(ORDERS_FILE)) {
        const existingOrders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
        const migratedOrders = existingOrders.map((o: any) => {
          let staff_id = o.staff_id;
          if (staff_id === '2') staff_id = '2';
          else if (staff_id === '3') staff_id = '4';
          else if (staff_id === '4') staff_id = '6';
          else if (staff_id === '5') staff_id = '3';
          else if (staff_id === '8') staff_id = '5';
          return { ...o, staff_id };
        });
        writeJsonAtomic(ORDERS_FILE, migratedOrders);
      }
    }

    // Migration 2: Duy Thương role to CTV
    const hasThuongAsStaff = existingUsers.some((u: any) => (u.username === 'thuongld' || u.username === '0912349681') && u.role === 'STAFF');
    if (hasThuongAsStaff) {
      const updatedUsers = existingUsers.map((u: any) => {
        if (u.username === 'thuongld' || u.username === '0912349681') {
          return { ...u, role: 'CTV' };
        }
        return u;
      });
      writeJsonAtomic(USERS_FILE, updatedUsers);
      console.log('Migration 2: Duy Thương → CTV.');
    }

    // Migration 3: Add password, created_at, edit_history
    let needsMigration3 = false;
    const freshUsers3 = readUsers();
    const migratedUsers3 = freshUsers3.map((u: any) => {
      let changed = false;
      const updated = { ...u };
      if (!updated.password) {
        updated.password = updated.phone ? `${updated.phone}@` : `${updated.username}@`;
        changed = true;
      }
      if (!updated.created_at) {
        updated.created_at = new Date('2026-06-25T00:00:00Z').toISOString();
        changed = true;
      }
      if (!updated.edit_history) {
        updated.edit_history = [];
        changed = true;
      }
      if (changed) needsMigration3 = true;
      return updated;
    });
    if (needsMigration3) {
      writeJsonAtomic(USERS_FILE, migratedUsers3);
      console.log('Migration 3: Added passwords and created_at.');
    }

    // Migration 4: Force usernames = phone numbers
    let needsMigration4 = false;
    const freshUsers4 = readUsers();
    const migratedUsers4 = freshUsers4.map((u: any) => {
      let changed = false;
      const updated = { ...u };
      if (updated.role !== 'MASTER' && updated.phone && updated.phone.trim() !== '') {
        const cleanPhone = updated.phone.trim();
        if (updated.username !== cleanPhone) {
          updated.username = cleanPhone;
          changed = true;
        }
        const defaultOldPass = `${u.username}@`;
        const defaultNewPass = `${cleanPhone}@`;
        if (!updated.password || updated.password === defaultOldPass) {
          updated.password = defaultNewPass;
          changed = true;
        }
      }
      if (changed) needsMigration4 = true;
      return updated;
    });
    if (needsMigration4) {
      writeJsonAtomic(USERS_FILE, migratedUsers4);
      console.log('Migration 4: username = phone.');
    }

    // ═══════════════════════════════════════════════════════
    // MIGRATION 5: Compute derived fields for ALL records
    // This is the key migration for the Insurance-Centric architecture
    // ═══════════════════════════════════════════════════════
    const currentOrders = readOrders();
    const currentUsersForMigration = readUsers();
    let needsMigration5 = false;

    const migratedOrders5 = currentOrders.map(o => {
      // Check if derived fields are already computed
      if (o.base_fee !== undefined && o.base_fee !== null) return o;
      needsMigration5 = true;

      const computed = computeDerivedFields(o, currentUsersForMigration);
      if (!computed.source) {
        computed.source = 'EXCEL_IMPORT'; // Legacy data came from Excel
      }
      return computed;
    });

    if (needsMigration5) {
      writeOrders(migratedOrders5);
      console.log(`Migration 5: Computed derived fields for ${migratedOrders5.length} records.`);
    }

    // ═══════════════════════════════════════════════════════
    // MIGRATION 6: Batch, Provider, Config & Commission transition
    // ═══════════════════════════════════════════════════════
    if (!fs.existsSync(BATCHES_FILE)) writeJsonAtomic(BATCHES_FILE, []);
    if (!fs.existsSync(COMMISSION_CONFIGS_FILE)) writeJsonAtomic(COMMISSION_CONFIGS_FILE, []);
    if (!fs.existsSync(BONUS_CONFIGS_FILE)) writeJsonAtomic(BONUS_CONFIGS_FILE, []);
    if (!fs.existsSync(PROVIDERS_FILE)) writeJsonAtomic(PROVIDERS_FILE, []);

    // Provider auto-collect
    let providers = readProviders();
    if (providers.length === 0) {
      const orders = readOrders();
      const providerSet = new Set<string>();
      orders.forEach(o => {
        if (o.provider && o.provider.trim()) providerSet.add(o.provider.trim());
      });
      ['VIỄN ĐÔNG', 'TASCO', 'PJICO', 'BẢO MINH', 'BẢO VIỆT', 'PTI', 'BSH', 'MIC'].forEach(p => providerSet.add(p));
      providers = Array.from(providerSet).map((name, i) => ({
        id: `p-${i + 1}`,
        name: name,
        is_hidden: false,
        is_locked: false,
        auto_collected: true,
        created_at: new Date().toISOString()
      }));
      writeProviders(providers);
      console.log(`Migration 6: Auto-collected ${providers.length} providers.`);
    }

    // Clean old config.json
    const oldConfig = readConfig() as any;
    if (oldConfig.providers !== undefined || oldConfig.default_commission_rate !== undefined) {
      const newConfig: SystemConfig = {
        insurance_types: oldConfig.insurance_types || ['TNDS_OTO', 'VCX_OTO', 'TNDS_XEMAY', 'Y_TE', 'ETC', 'KHAC'],
        batch_auto_lock_days: oldConfig.batch_auto_lock_days
      };
      writeConfig(newConfig);
      console.log('Migration 6: Cleaned old config.json fields.');
    }

    // Convert statement_months to Batches and set batch_id on orders
    const allOrders = readOrders();
    const allBatches = readBatches();
    let ordersUpdated = false;

    if (allBatches.length === 0 && allOrders.length > 0) {
      const months = Array.from(new Set(allOrders.map(o => o.statement_month).filter(Boolean))) as string[];
      const generatedBatches: ImportBatch[] = months.map((month, i) => {
        const batchOrders = allOrders.filter(o => o.statement_month === month);
        const [year, m] = month.split('-');
        return {
          id: `batch-${month}`,
          name: `Bảng kê Tháng ${m}/${year}`,
          month: month,
          imported_at: new Date().toISOString(),
          imported_by: '1', // Admin/Master
          record_count: batchOrders.length,
          status: 'LOCKED', // Legacy is locked
          locked_at: new Date().toISOString(),
          locked_by: '1',
          notes: 'Tạo tự động từ dữ liệu lịch sử'
        };
      });

      const updatedOrders = allOrders.map(o => {
        if (o.statement_month && !o.batch_id) {
          ordersUpdated = true;
          return { ...o, batch_id: `batch-${o.statement_month}` };
        }
        return o;
      });

      // Update quality metrics for the generated batches
      const usersForQual = readUsers();
      generatedBatches.forEach(b => {
        const bOrders = updatedOrders.filter(o => o.batch_id === b.id);
        b.quality = computeBatchQuality(bOrders, usersForQual);
      });

      writeBatches(generatedBatches);
      if (ordersUpdated) {
        writeOrders(updatedOrders);
      }
      console.log(`Migration 6: Generated ${generatedBatches.length} batches from statement_months.`);
    }
  }
} catch (err) {
  console.error('Failed to run database migration:', err);
}

// Initialize config.json with defaults if it does not exist
if (!fs.existsSync(CONFIG_FILE)) {
  const config: SystemConfig = {
    insurance_types: ['TNDS_OTO', 'VCX_OTO', 'TNDS_XEMAY', 'Y_TE', 'ETC', 'KHAC']
  };
  writeConfig(config);
  console.log('Initialized config.json.');
}

// ═══════════════════════════════════════════════════════════
// SSE (Server-Sent Events) for real-time updates
// ═══════════════════════════════════════════════════════════
let clients: any[] = [];

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
});

function broadcastUpdate() {
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify({ type: 'update' })}\n\n`);
  });
}

// ═══════════════════════════════════════════════════════════
// API: INSURANCE RECORDS (Orders)
// ═══════════════════════════════════════════════════════════

// GET /api/orders — Fetch records with optional query filters
app.get('/api/orders', (req, res) => {
  let result = readOrders();
  const { staff_id, agency_id, month, insurance_type, status } = req.query;

  if (staff_id) result = result.filter(o => o.staff_id === staff_id);
  if (agency_id) result = result.filter(o => o.agency_id === agency_id);
  if (month) result = result.filter(o => o.statement_month === month);
  if (insurance_type) result = result.filter(o => o.insurance_type === insurance_type);
  if (status) result = result.filter(o => o.status === status);

  res.json(result);
});

function isBatchLocked(batchId?: string): boolean {
  if (!batchId) return false;
  const batches = readBatches();
  const batch = batches.find(b => b.id === batchId);
  return batch ? (batch.status === 'LOCKED' || batch.status === 'SENT_TO_INSURER' || batch.status === 'SETTLED') : false;
}

// POST /api/orders — Create a new record (server computes derived fields)
app.post('/api/orders', (req, res) => {
  const newOrder: InsuranceOrder = req.body;
  const users = readUsers();
  const orders = readOrders();
  const commConfigs = readCommissionConfigs();

  if (isBatchLocked(newOrder.batch_id)) {
    return res.status(403).json({ error: 'Bảng kê này đã khóa. Không thể tạo hồ sơ mới.' });
  }

  // Server computes all derived fields
  const computed = computeDerivedFields(newOrder, users, commConfigs);
  if (!computed.source) computed.source = 'MANUAL_INPUT';

  orders.unshift(computed);
  writeOrders(orders);

  // Update batch quality if order belongs to a batch
  if (computed.batch_id) {
    const batches = readBatches();
    const batchIndex = batches.findIndex(b => b.id === computed.batch_id);
    if (batchIndex !== -1) {
      const batchOrders = orders.filter(o => o.batch_id === computed.batch_id);
      batches[batchIndex].record_count = batchOrders.length;
      batches[batchIndex].quality = computeBatchQuality(batchOrders, users);
      writeBatches(batches);
    }
  }

  broadcastUpdate();
  res.status(201).json(computed);
});

// PUT /api/orders/:id — Update a record (server recomputes derived fields)
app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const updates: Partial<InsuranceOrder> = req.body;
  const users = readUsers();
  const orders = readOrders();
  const commConfigs = readCommissionConfigs();

  const orderToEdit = orders.find(o => o.id === id);
  if (!orderToEdit) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (isBatchLocked(orderToEdit.batch_id) || isBatchLocked(updates.batch_id)) {
    return res.status(403).json({ error: 'Bảng kê này đã khóa. Không thể chỉnh sửa dữ liệu.' });
  }

  const updatedOrders = orders.map(o => {
    if (o.id === id) {
      let merged = { ...o, ...updates, updated_at: new Date().toISOString() };
      merged = recalcExpiration(o, updates);
      merged = { ...o, ...updates, ...merged, updated_at: new Date().toISOString() };
      // Recompute all derived fields
      return computeDerivedFields(merged, users, commConfigs);
    }
    return o;
  });

  writeOrders(updatedOrders);

  // Recalculate batch quality for the old (and potentially new) batch
  const batches = readBatches();
  let batchesChanged = false;
  const affectedBatchIds = new Set<string>();
  if (orderToEdit.batch_id) affectedBatchIds.add(orderToEdit.batch_id);
  if (updates.batch_id) affectedBatchIds.add(updates.batch_id);

  affectedBatchIds.forEach(bId => {
    const batchIndex = batches.findIndex(b => b.id === bId);
    if (batchIndex !== -1) {
      const batchOrders = updatedOrders.filter(o => o.batch_id === bId);
      batches[batchIndex].record_count = batchOrders.length;
      batches[batchIndex].quality = computeBatchQuality(batchOrders, users);
      batchesChanged = true;
    }
  });
  if (batchesChanged) {
    writeBatches(batches);
  }

  broadcastUpdate();
  res.json({ success: true });
});

// POST /api/orders/bulk — Bulk import (server computes derived fields for all)
app.post('/api/orders/bulk', (req, res) => {
  const { newOrders, logs, batchName, batchMonth } = req.body;
  const users = readUsers();
  const orders = readOrders();
  const currentLogs = readLogs();
  const commConfigs = readCommissionConfigs();
  const batches = readBatches();

  const dateStr = new Date().toISOString();
  const currentMonth = dateStr.split('-').slice(0, 2).join('-');
  const determinedMonth = batchMonth || (newOrders[0]?.statement_month || currentMonth);
  const bName = batchName || `Bảng kê Import ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}`;
  const batchId = `batch-${Date.now()}`;

  const newBatch: ImportBatch = {
    id: batchId,
    name: bName,
    month: determinedMonth,
    imported_at: dateStr,
    imported_by: newOrders[0]?.created_by || '1',
    record_count: newOrders.length,
    status: 'PROCESSING',
    quality: {
      missing_staff: 0,
      missing_agency: 0,
      missing_phone: 0,
      missing_cod: 0,
      unpaid: 0,
      incomplete: 0,
      total: newOrders.length,
      completion_rate: 0
    }
  };

  const updated = [...orders];
  const processedNewOrders = newOrders.map((no: InsuranceOrder) => {
    const existing = updated.find(o => o.id === no.id || (o.serial_number && o.serial_number === no.serial_number));
    
    // Check lock on existing order if it belongs to a locked batch
    if (existing && isBatchLocked(existing.batch_id)) {
      return existing; // Keep locked ones unchanged
    }

    let processed = existing ? {
      ...existing,
      ...no,
      id: existing.id,
      batch_id: existing.batch_id || batchId,
      created_at: existing.created_at,
      updated_at: dateStr
    } : {
      ...no,
      batch_id: batchId,
      created_at: dateStr,
      updated_at: dateStr
    };

    // Auto-collect providers to providers.json
    if (processed.provider && processed.provider.trim()) {
      let provs = readProviders();
      const cleanProv = processed.provider.trim();
      const exists = provs.some(p => p.name.toUpperCase() === cleanProv.toUpperCase() || p.display_name?.toUpperCase() === cleanProv.toUpperCase());
      if (!exists) {
        provs.push({
          id: `p-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: cleanProv,
          is_hidden: false,
          is_locked: false,
          auto_collected: true,
          created_at: dateStr
        });
        writeProviders(provs);
      }
    }

    processed = computeDerivedFields(processed, users, commConfigs);
    if (!processed.source) processed.source = 'EXCEL_IMPORT';
    return processed;
  });

  const processedIds = new Set(processedNewOrders.map((o: any) => o.id));
  const processedSerials = new Set(processedNewOrders.map((o: any) => o.serial_number).filter(Boolean));
  
  const cleanExisting = updated.filter(o => {
    const willBeOverwritten = processedIds.has(o.id) || (o.serial_number && processedSerials.has(o.serial_number));
    if (willBeOverwritten && isBatchLocked(o.batch_id)) {
      return true; // Keep locked version
    }
    return !willBeOverwritten;
  });

  const finalOrders = [...processedNewOrders, ...cleanExisting];
  const mergedLogs = [...logs, ...currentLogs];

  // Calculate Batch quality for this new batch
  const batchOrders = processedNewOrders.filter(o => o.batch_id === batchId);
  newBatch.record_count = batchOrders.length;
  newBatch.quality = computeBatchQuality(batchOrders, users);

  batches.unshift(newBatch);
  writeBatches(batches);

  writeOrders(finalOrders);
  writeLogs(mergedLogs);

  broadcastUpdate();
  res.json({ success: true, count: batchOrders.length, batchId });
});

// DELETE /api/orders/:id
app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const orders = readOrders();
  const users = readUsers();

  const orderToDelete = orders.find(o => o.id === id);
  if (!orderToDelete) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (isBatchLocked(orderToDelete.batch_id)) {
    return res.status(403).json({ error: 'Bảng kê này đã khóa. Không thể xóa dữ liệu.' });
  }

  const filtered = orders.filter(o => o.id !== id);
  writeOrders(filtered);

  // Recalculate batch quality
  if (orderToDelete.batch_id) {
    const batches = readBatches();
    const batchIndex = batches.findIndex(b => b.id === orderToDelete.batch_id);
    if (batchIndex !== -1) {
      const batchOrders = filtered.filter(o => o.batch_id === orderToDelete.batch_id);
      batches[batchIndex].record_count = batchOrders.length;
      batches[batchIndex].quality = computeBatchQuality(batchOrders, users);
      writeBatches(batches);
    }
  }

  broadcastUpdate();
  res.json({ success: true });
});

// POST /api/orders/bulk-delete
app.post('/api/orders/bulk-delete', (req, res) => {
  const { ids, logs } = req.body;
  const orders = readOrders();
  const users = readUsers();
  const currentLogs = readLogs();

  const idSet = new Set(ids);
  const lockedOrders = orders.filter(o => idSet.has(o.id) && isBatchLocked(o.batch_id));
  if (lockedOrders.length > 0) {
    return res.status(403).json({ error: 'Có một số hồ sơ thuộc bảng kê đã khóa. Không thể xóa.' });
  }

  const filtered = orders.filter(o => !idSet.has(o.id));
  const mergedLogs = [...logs, ...currentLogs];

  writeOrders(filtered);
  writeLogs(mergedLogs);

  // Recompute affected batches quality
  const batches = readBatches();
  let batchesChanged = false;
  const affectedBatchIds = new Set<string>();
  orders.filter(o => idSet.has(o.id) && o.batch_id).forEach(o => affectedBatchIds.add(o.batch_id!));

  affectedBatchIds.forEach(bId => {
    const batchIndex = batches.findIndex(b => b.id === bId);
    if (batchIndex !== -1) {
      const batchOrders = filtered.filter(o => o.batch_id === bId);
      batches[batchIndex].record_count = batchOrders.length;
      batches[batchIndex].quality = computeBatchQuality(batchOrders, users);
      batchesChanged = true;
    }
  });
  if (batchesChanged) {
    writeBatches(batches);
  }

  broadcastUpdate();
  res.json({ success: true, count: ids.length });
});

// POST /api/orders/bulk-update — Bulk update with recomputation
app.post('/api/orders/bulk-update', (req, res) => {
  const { ids, updates, logs } = req.body;
  const users = readUsers();
  const orders = readOrders();
  const currentLogs = readLogs();
  const commConfigs = readCommissionConfigs();

  const idSet = new Set(ids);
  const lockedOrders = orders.filter(o => idSet.has(o.id) && isBatchLocked(o.batch_id));
  if (lockedOrders.length > 0) {
    return res.status(403).json({ error: 'Có một số hồ sơ thuộc bảng kê đã khóa. Không thể cập nhật.' });
  }

  const updatedOrders = orders.map(o => {
    if (idSet.has(o.id)) {
      let merged = { ...o, ...updates, updated_at: new Date().toISOString() };
      if (updates.effective_date && updates.effective_date !== o.effective_date) {
        const d = new Date(updates.effective_date);
        d.setFullYear(d.getFullYear() + 1);
        merged.expiration_date = d.toISOString().split('T')[0];
      }
      if (updates.tnds_fee !== undefined || updates.nn_fee !== undefined) {
        merged.total_fee = Number(updates.tnds_fee !== undefined ? updates.tnds_fee : o.tnds_fee) + Number(updates.nn_fee !== undefined ? updates.nn_fee : o.nn_fee);
      }
      if (updates.total_fee !== undefined) {
        merged.total_fee = Number(updates.total_fee);
      }
      if (merged.cod_amount > 0 && merged.insurance_type !== 'VCX_OTO') {
        merged.payment_status = 'PAID';
      }
      return computeDerivedFields(merged, users, commConfigs);
    }
    return o;
  });

  const mergedLogs = [...logs, ...currentLogs];

  writeOrders(updatedOrders);
  writeLogs(mergedLogs);

  // Recompute affected batches quality
  const batches = readBatches();
  let batchesChanged = false;
  const affectedBatchIds = new Set<string>();
  orders.filter(o => idSet.has(o.id) && o.batch_id).forEach(o => affectedBatchIds.add(o.batch_id!));
  if (updates.batch_id) affectedBatchIds.add(updates.batch_id);

  affectedBatchIds.forEach(bId => {
    const batchIndex = batches.findIndex(b => b.id === bId);
    if (batchIndex !== -1) {
      const batchOrders = updatedOrders.filter(o => o.batch_id === bId);
      batches[batchIndex].record_count = batchOrders.length;
      batches[batchIndex].quality = computeBatchQuality(batchOrders, users);
      batchesChanged = true;
    }
  });
  if (batchesChanged) {
    writeBatches(batches);
  }

  broadcastUpdate();
  res.json({ success: true, count: ids.length });
});

// ═══════════════════════════════════════════════════════════
// API: STATISTICS ENGINE — Server-computed stats
// ═══════════════════════════════════════════════════════════

// GET /api/stats/dashboard — Dashboard overview stats
app.get('/api/stats/dashboard', (req, res) => {
  const { user_id, role } = req.query;
  const orders = readOrders();
  const users = readUsers();

  let filteredOrders = orders;

  // Role-based data access
  if (role === 'STAFF' || role === 'CTV') {
    const myAgencies = users.filter(u => u.parent_id === user_id).map(u => u.id);
    filteredOrders = orders.filter(o => o.staff_id === user_id || (o.agency_id && myAgencies.includes(o.agency_id)));
  } else if (role === 'AGENCY') {
    filteredOrders = orders.filter(o => o.agency_id === user_id);
  }

  const activeOrders = filteredOrders.filter(o => o.status === 'ACTIVE');

  const totalRevenue = activeOrders.reduce((sum, o) => sum + (o.base_fee || Math.round((o.tnds_fee / 1.1) + o.nn_fee)), 0);
  const totalDebt = activeOrders
    .filter(o => o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL')
    .reduce((sum, o) => sum + o.total_fee, 0);
  const cancelledCount = filteredOrders.filter(o => o.status === 'CANCELLED').length;

  const now = new Date();
  const renewalCount = activeOrders.filter(o => {
    if (!o.expiration_date) return false;
    const diffDays = Math.ceil((new Date(o.expiration_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  }).length;

  const unpaidOrdersCount = activeOrders.filter(o => o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL').length;

  const needsProcessingCount = filteredOrders.filter(o => {
    if (o.status === 'CANCELLED') return false;
    if (o.insurance_type === 'VCX_OTO') {
      return !o.vehicle_owner || !o.license_plate || !o.issue_date || !o.effective_date || !o.provider || !o.hinh_xe || !o.total_fee || o.vcx_nop_ve === undefined || o.vcx_nop_ve === null || o.vcx_payment === undefined || o.vcx_payment === null || o.vcx_payment === 0;
    }
    const oStaff = users.find(u => u.id === o.staff_id);
    const isCTV = oStaff?.role === 'CTV';
    const hasMissingStaff = !o.staff_id;
    const hasMissingPhoneOrAgency = !isCTV && !o.customer_phone && !o.agency_id;
    const hasMissingFee = o.tnds_fee === 0 || o.total_fee === 0;
    return hasMissingStaff || hasMissingPhoneOrAgency || hasMissingFee;
  }).length;

  // Provider chart data
  const providerMap = new Map<string, number>();
  activeOrders.forEach(o => {
    const providerName = o.provider || 'Khác';
    const rev = o.base_fee || Math.round((o.tnds_fee / 1.1) + o.nn_fee);
    providerMap.set(providerName, (providerMap.get(providerName) || 0) + rev);
  });
  const providerChartData = Array.from(providerMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Batch overview & Data Quality (Master/Accountant only)
  let batchOverview: any = undefined;
  let dataQuality: any = undefined;
  if (role === 'MASTER' || role === 'ACCOUNTANT') {
    const batches = readBatches();
    batchOverview = {
      processing: batches.filter(b => b.status === 'PROCESSING').length,
      complete: batches.filter(b => b.status === 'COMPLETE').length,
      locked: batches.filter(b => b.status === 'LOCKED').length,
      settled: batches.filter(b => b.status === 'SETTLED' || b.status === 'SENT_TO_INSURER').length
    };

    // Database quality over all active records
    const allActiveOrders = orders.filter(o => o.status === 'ACTIVE');
    dataQuality = computeBatchQuality(allActiveOrders, users);
  }

  res.json({
    totalRevenue,
    totalDebt,
    cancelledCount,
    renewalCount,
    unpaidOrdersCount,
    needsProcessingCount,
    providerChartData,
    batchOverview,
    dataQuality
  });
});

// GET /api/stats/staff-report — Staff performance report (Master/Accountant)
app.get('/api/stats/staff-report', (req, res) => {
  const orders = readOrders();
  const users = readUsers();
  const bonusConfigs = readBonusConfigs();

  const staffs = users.filter(u => u.role === 'STAFF' || u.role === 'ACCOUNTANT' || u.role === 'CTV');
  const report = staffs.map(staff => {
    const sOrders = orders.filter(o => o.staff_id === staff.id);
    const activeOrders = sOrders.filter(o => o.status === 'ACTIVE');
    const cancelledOrders = sOrders.filter(o => o.status === 'CANCELLED');
    const revenue = activeOrders.reduce((sum, o) => sum + o.total_fee, 0);
    const collected = activeOrders.filter(o => o.payment_status === 'PAID').reduce((sum, o) => sum + o.total_fee, 0);
    const debt = activeOrders.filter(o => o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL').reduce((sum, o) => sum + o.total_fee, 0);
    const unpaidList = activeOrders.filter(o => o.payment_status === 'UNPAID');

    // Calculate current monthly bonus
    const currentMonthStr = new Date().toISOString().split('-').slice(0, 2).join('-');
    const staffOrdersForMonth = activeOrders.filter(o => o.statement_month === currentMonthStr);
    const monthlyRev = staffOrdersForMonth.reduce((sum, o) => sum + o.total_fee, 0);

    const activeConfig = bonusConfigs.find(c => {
      const nowStr = new Date().toISOString().split('T')[0];
      return c.effective_from <= nowStr && (!c.effective_to || c.effective_to >= nowStr);
    });

    let bonusAmount = 0;
    let bonusThreshold = 'Không đạt mốc';
    if (activeConfig && activeConfig.thresholds && (staff.role === 'STAFF' || staff.role === 'ACCOUNTANT')) {
      const sorted = [...activeConfig.thresholds].sort((a, b) => b.min_revenue - a.min_revenue);
      const matched = sorted.find(t => monthlyRev >= t.min_revenue);
      if (matched) {
        bonusAmount = matched.bonus_amount;
        bonusThreshold = `Doanh số ≥ ${matched.min_revenue.toLocaleString('vi-VN')} VNĐ`;
      }
    }

    return {
      staff,
      activeCount: activeOrders.length,
      cancelledCount: cancelledOrders.length,
      revenue,
      collected,
      debt,
      unpaidList,
      cancelledList: cancelledOrders,
      allOrders: sOrders,
      bonusAmount,
      bonusThreshold
    };
  });

  res.json(report);
});

// GET /api/stats/agency-report — Agency performance report
app.get('/api/stats/agency-report', (req, res) => {
  const { user_id, role } = req.query;
  const orders = readOrders();
  const users = readUsers();

  let agencies = users.filter(u => u.role === 'AGENCY');
  if (role === 'STAFF' || role === 'CTV') {
    agencies = agencies.filter(a => a.parent_id === user_id);
  }

  const report = agencies.map(agency => {
    const aOrders = orders.filter(o => o.agency_id === agency.id);
    const activeOrders = aOrders.filter(o => o.status === 'ACTIVE');
    const cancelledOrders = aOrders.filter(o => o.status === 'CANCELLED');
    const revenue = activeOrders.reduce((sum, o) => sum + o.total_fee, 0);
    const collected = activeOrders.filter(o => o.payment_status === 'PAID').reduce((sum, o) => sum + o.total_fee, 0);
    const debt = activeOrders.filter(o => o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL').reduce((sum, o) => sum + o.total_fee, 0);
    const parentStaff = users.find(u => u.id === agency.parent_id)?.fullname || 'Không có';

    return {
      agency,
      parentStaff,
      activeCount: activeOrders.length,
      cancelledCount: cancelledOrders.length,
      revenue,
      collected,
      debt
    };
  });

  res.json(report);
});

// GET /api/stats/personal — Personal stats for Staff/CTV
app.get('/api/stats/personal', (req, res) => {
  const { user_id, role } = req.query;
  const orders = readOrders();
  const users = readUsers();

  const selfOrders = orders.filter(o => o.staff_id === user_id);
  const isCTV = role === 'CTV';

  const insuranceTypes = [
    { id: 'TNDS_OTO', label: 'TNDS Ô tô' },
    { id: 'VCX_OTO', label: 'VCX Ô tô' },
    { id: 'TNDS_XEMAY', label: 'TNDS Xe máy' },
    { id: 'Y_TE', label: 'BH Y tế' },
    { id: 'ETC', label: 'Thẻ ETC' },
    { id: 'KHAC', label: 'Khác' }
  ];

  const now = new Date();

  const statsByType = insuranceTypes.map(type => {
    const typeOrders = selfOrders.filter(o => o.insurance_type === type.id);
    const activeOfType = typeOrders.filter(o => o.status === 'ACTIVE');

    const revenue = activeOfType.reduce((sum, o) => sum + (o.base_fee || Math.round((o.tnds_fee / 1.1) + o.nn_fee)), 0);
    const unpaid = activeOfType
      .filter(o => o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL')
      .reduce((sum, o) => sum + o.total_fee, 0);
    const cancelledCount = typeOrders.filter(o => o.status === 'CANCELLED').length;
    const successCount = activeOfType.filter(o => o.payment_status === 'PAID').length;
    const expiringCount = activeOfType.filter(o => {
      if (!o.expiration_date) return false;
      const diffDays = Math.ceil((new Date(o.expiration_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }).length;

    // Provider chart data
    const providerMap = new Map<string, number>();
    activeOfType.forEach(o => {
      const providerName = o.provider || 'Khác';
      const rev = o.base_fee || Math.round((o.tnds_fee / 1.1) + o.nn_fee);
      providerMap.set(providerName, (providerMap.get(providerName) || 0) + rev);
    });
    const providerChartData = Array.from(providerMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Ratio chart
    const unpaidCount = activeOfType.filter(o => o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL').length;
    const ratioChartData = [
      { name: 'Công nợ chưa thu', value: unpaidCount },
      { name: 'Số đơn hủy', value: cancelledCount },
      { name: 'Số đơn thành công', value: successCount }
    ].filter(item => item.value > 0);

    return {
      id: type.id,
      label: type.label,
      revenue,
      unpaid,
      successCount,
      cancelledCount,
      expiringCount,
      providerChartData,
      ratioChartData
    };
  });

  const allActive = selfOrders.filter(o => o.status === 'ACTIVE');
  const totalRevenue = allActive.reduce((sum, o) => sum + (o.base_fee || Math.round((o.tnds_fee / 1.1) + o.nn_fee)), 0);
  const totalUnpaid = allActive
    .filter(o => o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL')
    .reduce((sum, o) => sum + o.total_fee, 0);
  const totalSuccess = allActive.filter(o => o.payment_status === 'PAID').length;
  const totalCancelled = selfOrders.filter(o => o.status === 'CANCELLED').length;
  const totalExpiring = allActive.filter(o => {
    if (!o.expiration_date) return false;
    const diffDays = Math.ceil((new Date(o.expiration_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  }).length;
  const totalUnpaidOrdersCount = allActive.filter(o => o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL').length;
  const totalNeedsProcessing = selfOrders.filter(o => {
    if (o.status === 'CANCELLED') return false;
    if (o.insurance_type === 'VCX_OTO') {
      return !o.vehicle_owner || !o.license_plate || !o.issue_date || !o.effective_date || !o.provider || !o.hinh_xe || !o.total_fee || o.vcx_nop_ve === undefined || o.vcx_nop_ve === null || o.vcx_payment === undefined || o.vcx_payment === null || o.vcx_payment === 0;
    }
    const hasMissingStaff = !o.staff_id;
    const hasMissingPhoneOrAgency = !isCTV && !o.customer_phone && !o.agency_id;
    const hasMissingFee = o.tnds_fee === 0 || o.total_fee === 0;
    return hasMissingStaff || hasMissingPhoneOrAgency || hasMissingFee;
  }).length;

  res.json({
    statsByType,
    totalRevenue,
    totalUnpaid,
    totalSuccess,
    totalCancelled,
    totalExpiring,
    totalUnpaidOrdersCount,
    totalNeedsProcessing
  });
});

// GET /api/stats/report-data — Get report list data (cancelled, unpaid, expiring)
app.get('/api/stats/report-data', (req, res) => {
  const { user_id, role, report_type } = req.query;
  const orders = readOrders();
  const users = readUsers();

  let filteredOrders = orders;
  if (role === 'STAFF' || role === 'CTV') {
    const myAgencies = users.filter(u => u.parent_id === user_id).map(u => u.id);
    filteredOrders = orders.filter(o => o.staff_id === user_id || (o.agency_id && myAgencies.includes(o.agency_id)));
  } else if (role === 'AGENCY') {
    filteredOrders = orders.filter(o => o.agency_id === user_id);
  }

  const now = new Date();

  if (report_type === 'CANCELLED') {
    res.json(filteredOrders.filter(o => o.status === 'CANCELLED'));
  } else if (report_type === 'UNPAID') {
    res.json(filteredOrders.filter(o => o.status === 'ACTIVE' && (o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL')));
  } else if (report_type === 'EXPIRING') {
    const expiring = filteredOrders.filter(o => {
      if (o.status !== 'ACTIVE' || !o.expiration_date) return false;
      const diffDays = Math.ceil((new Date(o.expiration_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }).map(o => {
      const daysLeft = Math.ceil((new Date(o.expiration_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { ...o, daysLeft };
    }).sort((a: any, b: any) => a.daysLeft - b.daysLeft);
    res.json(expiring);
  } else {
    res.json([]);
  }
});

// ═══════════════════════════════════════════════════════════
// API: USERS
// ═══════════════════════════════════════════════════════════

app.get('/api/users', (req, res) => {
  res.json(readUsers());
});

app.post('/api/users', (req, res) => {
  const newUser: User = req.body;
  const users = readUsers();
  users.push(newUser);
  writeUsers(users);

  broadcastUpdate();
  res.status(201).json(newUser);
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const updates: Partial<User> = req.body;
  const users = readUsers();

  const updatedUsers = users.map(u => u.id === id ? { ...u, ...updates } : u);
  writeUsers(updatedUsers);

  broadcastUpdate();
  res.json({ success: true });
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const users = readUsers();

  const filteredUsers = users.filter(u => u.id !== id);
  writeUsers(filteredUsers);

  broadcastUpdate();
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// API: CHANGE LOGS
// ═══════════════════════════════════════════════════════════

app.get('/api/logs', (req, res) => {
  res.json(readLogs());
});

app.post('/api/logs', (req, res) => {
  const newLog: ChangeLog = req.body;
  const logs = readLogs();
  logs.unshift(newLog);
  writeLogs(logs);

  broadcastUpdate();
  res.status(201).json(newLog);
});

function recomputeAllAffectedOrders() {
  const orders = readOrders();
  const users = readUsers();
  const commConfigs = readCommissionConfigs();
  const batches = readBatches();

  let changed = false;
  const updated = orders.map(o => {
    if (isBatchLocked(o.batch_id)) return o;
    const resolved = computeDerivedFields(o, users, commConfigs);
    if (resolved.commission_rate !== o.commission_rate || 
        resolved.commission_amount !== o.commission_amount || 
        resolved.nop_ve !== o.nop_ve || 
        resolved.du !== o.du || 
        resolved.debt_amount !== o.debt_amount) {
      changed = true;
      return resolved;
    }
    return o;
  });

  if (changed) {
    writeOrders(updated);
    let batchesChanged = false;
    const updatedBatches = batches.map(b => {
      const batchOrders = updated.filter(o => o.batch_id === b.id);
      const qual = computeBatchQuality(batchOrders, users);
      if (JSON.stringify(qual) !== JSON.stringify(b.quality)) {
        batchesChanged = true;
        return { ...b, record_count: batchOrders.length, quality: qual };
      }
      return b;
    });
    if (batchesChanged) {
      writeBatches(updatedBatches);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// API: BATCHES
// ═══════════════════════════════════════════════════════════

app.get('/api/batches', (req, res) => {
  res.json(readBatches());
});

app.get('/api/batches/:id/orders', (req, res) => {
  const { id } = req.params;
  const orders = readOrders().filter(o => o.batch_id === id);
  res.json(orders);
});

app.put('/api/batches/:id', (req, res) => {
  const { id } = req.params;
  const { status, notes, name, month } = req.body;
  const batches = readBatches();
  const users = readUsers();
  const orders = readOrders();

  const index = batches.findIndex(b => b.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  const oldBatch = batches[index];
  const updatedBatch = { ...oldBatch };
  
  if (status) updatedBatch.status = status;
  if (notes !== undefined) updatedBatch.notes = notes;
  if (name) updatedBatch.name = name;
  if (month) updatedBatch.month = month;

  if (status === 'LOCKED' && oldBatch.status !== 'LOCKED') {
    updatedBatch.locked_at = new Date().toISOString();
    updatedBatch.locked_by = req.body.user_id || '1';
  }

  // Recalculate record count and quality
  const batchOrders = orders.filter(o => o.batch_id === id);
  updatedBatch.record_count = batchOrders.length;
  updatedBatch.quality = computeBatchQuality(batchOrders, users);

  batches[index] = updatedBatch;
  writeBatches(batches);

  broadcastUpdate();
  res.json(updatedBatch);
});

app.delete('/api/batches/:id', (req, res) => {
  const { id } = req.params;
  const batches = readBatches();
  const batch = batches.find(b => b.id === id);
  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  if (batch.status === 'LOCKED' || batch.status === 'SENT_TO_INSURER' || batch.status === 'SETTLED') {
    return res.status(403).json({ error: 'Bảng kê đã khóa, không thể xóa.' });
  }

  const updatedBatches = batches.filter(b => b.id !== id);
  const orders = readOrders();
  const updatedOrders = orders.filter(o => o.batch_id !== id);

  writeBatches(updatedBatches);
  writeOrders(updatedOrders);

  broadcastUpdate();
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// API: PROVIDERS
// ═══════════════════════════════════════════════════════════

app.get('/api/providers', (req, res) => {
  const providers = readProviders().filter(p => !p.merged_into);
  res.json(providers);
});

app.post('/api/providers', (req, res) => {
  const { name, display_name } = req.body;
  const providers = readProviders();
  
  const cleanName = name.trim();
  if (providers.some(p => p.name.toUpperCase() === cleanName.toUpperCase() && !p.merged_into)) {
    return res.status(400).json({ error: 'Hãng bảo hiểm này đã tồn tại.' });
  }

  const newProvider: Provider = {
    id: `p-${Date.now()}`,
    name: cleanName,
    display_name: display_name ? display_name.trim() : undefined,
    is_hidden: false,
    is_locked: false,
    auto_collected: false,
    created_at: new Date().toISOString()
  };

  providers.push(newProvider);
  writeProviders(providers);

  broadcastUpdate();
  res.status(201).json(newProvider);
});

app.put('/api/providers/:id', (req, res) => {
  const { id } = req.params;
  const updates: Partial<Provider> = req.body;
  const providers = readProviders();

  const index = providers.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  providers[index] = { ...providers[index], ...updates };
  writeProviders(providers);

  recomputeAllAffectedOrders();

  broadcastUpdate();
  res.json(providers[index]);
});

app.post('/api/providers/merge', (req, res) => {
  const { sourceId, targetId } = req.body;
  const providers = readProviders();
  const orders = readOrders();

  const source = providers.find(p => p.id === sourceId);
  const target = providers.find(p => p.id === targetId);

  if (!source || !target) {
    return res.status(404).json({ error: 'Source or target provider not found' });
  }

  source.merged_into = target.id;
  source.is_hidden = true;

  const targetName = target.display_name || target.name;
  const sourceName = source.display_name || source.name;

  const updatedOrders = orders.map(o => {
    if (o.provider === sourceName || o.provider === source.name) {
      const mergedOrder = { ...o, provider: targetName };
      const users = readUsers();
      const commConfigs = readCommissionConfigs();
      return computeDerivedFields(mergedOrder, users, commConfigs);
    }
    return o;
  });

  writeProviders(providers);
  writeOrders(updatedOrders);

  // Recalculate all batch qualities
  const batches = readBatches();
  const users = readUsers();
  const updatedBatches = batches.map(b => {
    const batchOrders = updatedOrders.filter(o => o.batch_id === b.id);
    return {
      ...b,
      record_count: batchOrders.length,
      quality: computeBatchQuality(batchOrders, users)
    };
  });
  writeBatches(updatedBatches);

  broadcastUpdate();
  res.json({ success: true, message: `Merged ${sourceName} into ${targetName}` });
});

// ═══════════════════════════════════════════════════════════
// API: COMMISSION CONFIGS
// ═══════════════════════════════════════════════════════════

app.get('/api/commission-configs', (req, res) => {
  res.json(readCommissionConfigs());
});

app.post('/api/commission-configs', (req, res) => {
  const config: CommissionConfig = req.body;
  const configs = readCommissionConfigs();

  const newConfig: CommissionConfig = {
    ...config,
    id: `cc-${Date.now()}`,
    created_at: new Date().toISOString()
  };

  configs.push(newConfig);
  writeCommissionConfigs(configs);

  recomputeAllAffectedOrders();

  broadcastUpdate();
  res.status(201).json(newConfig);
});

app.put('/api/commission-configs/:id', (req, res) => {
  const { id } = req.params;
  const updates: Partial<CommissionConfig> = req.body;
  const configs = readCommissionConfigs();

  const index = configs.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Config not found' });
  }

  configs[index] = { ...configs[index], ...updates };
  writeCommissionConfigs(configs);

  recomputeAllAffectedOrders();

  broadcastUpdate();
  res.json(configs[index]);
});

app.delete('/api/commission-configs/:id', (req, res) => {
  const { id } = req.params;
  const configs = readCommissionConfigs();

  const filtered = configs.filter(c => c.id !== id);
  if (filtered.length === configs.length) {
    return res.status(404).json({ error: 'Config not found' });
  }

  writeCommissionConfigs(filtered);

  recomputeAllAffectedOrders();

  broadcastUpdate();
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// API: BONUS CONFIGS
// ═══════════════════════════════════════════════════════════

app.get('/api/bonus-configs', (req, res) => {
  res.json(readBonusConfigs());
});

app.post('/api/bonus-configs', (req, res) => {
  const config: BonusConfig = req.body;
  const configs = readBonusConfigs();

  const newConfig: BonusConfig = {
    ...config,
    id: `bc-${Date.now()}`,
    created_at: new Date().toISOString()
  };

  configs.push(newConfig);
  writeBonusConfigs(configs);

  broadcastUpdate();
  res.status(201).json(newConfig);
});

app.put('/api/bonus-configs/:id', (req, res) => {
  const { id } = req.params;
  const updates: Partial<BonusConfig> = req.body;
  const configs = readBonusConfigs();

  const index = configs.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Config not found' });
  }

  configs[index] = { ...configs[index], ...updates };
  writeBonusConfigs(configs);

  broadcastUpdate();
  res.json(configs[index]);
});

app.delete('/api/bonus-configs/:id', (req, res) => {
  const { id } = req.params;
  const configs = readBonusConfigs();

  const filtered = configs.filter(c => c.id !== id);
  writeBonusConfigs(filtered);

  broadcastUpdate();
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// API: BONUS REPORT
// ═══════════════════════════════════════════════════════════

app.get('/api/stats/bonus-report', (req, res) => {
  const { month } = req.query; // YYYY-MM
  if (!month) {
    return res.status(400).json({ error: 'Month parameter (YYYY-MM) is required' });
  }

  const orders = readOrders();
  const users = readUsers();
  const bonusConfigs = readBonusConfigs();

  const targetDate = `${month}-15`;
  const activeConfig = bonusConfigs.find(c => {
    return c.effective_from <= targetDate && (!c.effective_to || c.effective_to >= targetDate);
  });

  const staffs = users.filter(u => u.role === 'STAFF' || u.role === 'ACCOUNTANT');

  const report = staffs.map(staff => {
    const staffOrders = orders.filter(o => {
      return o.staff_id === staff.id && 
             o.status === 'ACTIVE' && 
             o.statement_month === month;
    });

    const revenue = staffOrders.reduce((sum, o) => sum + o.total_fee, 0);
    const successCount = staffOrders.filter(o => o.payment_status === 'PAID').length;

    let bonusAmount = 0;
    let bonusThreshold = 'Không đạt mốc';

    if (activeConfig && activeConfig.thresholds && activeConfig.thresholds.length > 0) {
      const sorted = [...activeConfig.thresholds].sort((a, b) => b.min_revenue - a.min_revenue);
      const matched = sorted.find(t => revenue >= t.min_revenue);
      if (matched) {
        bonusAmount = matched.bonus_amount;
        bonusThreshold = `Doanh số ≥ ${matched.min_revenue.toLocaleString('vi-VN')} VNĐ`;
      }
    }

    return {
      staff,
      revenue,
      successCount,
      bonusAmount,
      bonusThreshold,
      activeOrdersCount: staffOrders.length
    };
  });

  res.json({
    month,
    configName: activeConfig ? activeConfig.name : 'Chưa cấu hình thưởng',
    report
  });
});

// ═══════════════════════════════════════════════════════════
// API: SYSTEM CONFIGURATION
// ═══════════════════════════════════════════════════════════

app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

app.put('/api/config', (req, res) => {
  const updates: Partial<SystemConfig> = req.body;
  const config = readConfig();
  const updatedConfig = { ...config, ...updates };
  writeConfig(updatedConfig);
  broadcastUpdate();
  res.json(updatedConfig);
});

// ═══════════════════════════════════════════════════════════
// STATIC FRONTEND SERVING
// ═══════════════════════════════════════════════════════════
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Backend Server is running! Frontend builds dist folder is missing. Run "npm run build" to compile frontend.');
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
