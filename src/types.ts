export type Role = 'MASTER' | 'ACCOUNTANT' | 'STAFF' | 'CTV' | 'AGENCY';

export const ROLE_LABELS: Record<Role, string> = {
  MASTER: 'Master',
  ACCOUNTANT: 'Quản lý',
  STAFF: 'Nhân viên',
  CTV: 'CTV',
  AGENCY: 'Đại lý'
};

export interface User {
  id: string;
  username: string;
  fullname: string;
  phone: string;
  role: Role;
  parent_id?: string;
  address?: string;
  cccd_image?: string;
  password?: string;
  created_at?: string;
  updated_at?: string;
  edit_history?: string[];
  // DEPRECATED: default_commission_rate removed — use CommissionConfig instead
}

export type InsuranceType = 'TNDS_OTO' | 'VCX_OTO' | 'TNDS_XEMAY' | 'Y_TE' | 'ETC' | 'KHAC';

export type PaymentStatus = 'UNPAID' | 'PAID' | 'PARTIAL';
export type OrderStatus = 'ACTIVE' | 'CANCELLED' | 'NEEDS_PROCESSING';

export interface InsuranceOrder {
  id: string;
  insurance_type: InsuranceType;
  serial_number: string;
  vehicle_owner: string;
  license_plate: string;
  issue_date: string;
  effective_date: string;
  tnds_fee: number;
  nn_fee: number;
  total_fee: number;
  provider: string; // HÃNG
  staff_id: string;
  agency_id?: string;
  customer_phone: string;
  cod_amount: number;
  shipping_fee: number; // VẬN CHUYỂN
  payment_status: PaymentStatus;
  status: OrderStatus;
  commission_rate?: number; // Hoa hồng (%) — per-order override by Master
  notes?: string;
  expiration_date?: string; // Ngày hết hạn
  statement_month?: string; // Bảng kê theo Tháng (YYYY-MM)
  cancelled_by?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;

  // --- Server-computed derived fields (readonly on client) ---
  base_fee?: number;           // = (tnds_fee / 1.1) + nn_fee  (Doanh thu hãng)
  nop_ve?: number;             // Server tính: ((total_fee - commission_amount) - COD) + shipping
  commission_amount?: number;  // = base_fee * resolved_commission_rate / 100
  du?: number;                 // VCX only: vcx_payment - vcx_nop_ve
  debt_amount?: number;        // Công nợ = total_fee khi chưa TT

  // --- Traceability ---
  batch_id?: string;           // Link tới ImportBatch.id
  import_batch_id?: string;    // Legacy field (kept for backward compatibility)
  source?: 'EXCEL_IMPORT' | 'MANUAL_INPUT';

  // VCX specific fields
  gtx_dkbs?: string;
  hieu_xe_nam_sx?: string;
  mdsd?: string;
  vay_bank?: string;
  hinh_xe?: string;
  vcx_nop_ve?: number;
  vcx_payment?: number;
  vcx_payment_recipient?: string;
}

export interface ChangeLog {
  id: string;
  order_id: string;
  serial_number: string;
  action: 'CREATE' | 'UPDATE_STATUS' | 'UPDATE_PAYMENT' | 'UPDATE_ASSIGNMENT' | 'CANCEL' | 'IMPORT' | 'EDIT';
  user_fullname: string;
  timestamp: string;
  details: string;
}

// ═══════════════════════════════════════════════════════════
// BATCH MANAGEMENT
// ═══════════════════════════════════════════════════════════

export type BatchStatus = 'PROCESSING' | 'COMPLETE' | 'LOCKED' | 'SENT_TO_INSURER' | 'SETTLED';

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  PROCESSING: 'Đang xử lý',
  COMPLETE: 'Hoàn thành',
  LOCKED: 'Đã chốt',
  SENT_TO_INSURER: 'Đã gửi CTBH',
  SETTLED: 'Đã quyết toán'
};

export interface BatchQuality {
  missing_staff: number;
  missing_agency: number;
  missing_phone: number;
  missing_cod: number;
  unpaid: number;
  incomplete: number;
  total: number;
  completion_rate: number; // 0-100%
}

export interface ImportBatch {
  id: string;
  name: string;           // VD: "Bảng kê Tháng 06/2026"
  month: string;          // YYYY-MM
  imported_at: string;
  imported_by: string;    // user ID
  record_count: number;
  status: BatchStatus;
  locked_at?: string;
  locked_by?: string;
  notes?: string;
  quality?: BatchQuality;
}

// ═══════════════════════════════════════════════════════════
// PROVIDER MANAGEMENT
// ═══════════════════════════════════════════════════════════

export interface Provider {
  id: string;
  name: string;              // Tên gốc từ import
  display_name?: string;     // Tên hiển thị (khi đổi tên)
  is_hidden: boolean;
  is_locked: boolean;
  merged_into?: string;      // ID hãng gộp vào
  auto_collected: boolean;   // Tự thu thập từ import?
  created_at: string;
}

// ═══════════════════════════════════════════════════════════
// COMMISSION CONFIGURATION (CTV)
// ═══════════════════════════════════════════════════════════

export interface CommissionConfig {
  id: string;
  ctv_id: string;            // CTV user ID
  provider_id: string;       // Provider name hoặc "*" = tất cả hãng
  rate: number;              // % hoa hồng
  effective_from: string;    // ISO date (YYYY-MM-DD)
  effective_to?: string;     // ISO date, undefined = vô thời hạn
  created_at: string;
  created_by: string;
}

// ═══════════════════════════════════════════════════════════
// BONUS MODULE (Nhân viên)
// ═══════════════════════════════════════════════════════════

export interface BonusThreshold {
  min_revenue: number;   // Mốc doanh thu tối thiểu (VNĐ)
  bonus_amount: number;  // Số tiền thưởng (VNĐ)
}

export interface BonusConfig {
  id: string;
  name: string;             // VD: "Thưởng doanh số T6/2026"
  thresholds: BonusThreshold[];  // Sắp xếp min_revenue tăng dần
  period_type: 'MONTHLY' | 'QUARTERLY';
  effective_from: string;   // YYYY-MM-DD
  effective_to?: string;    // YYYY-MM-DD, undefined = vô thời hạn
  applies_to_roles: Role[];
  created_at: string;
  created_by: string;
}

// ═══════════════════════════════════════════════════════════
// SYSTEM CONFIGURATION
// ═══════════════════════════════════════════════════════════

export interface SystemConfig {
  insurance_types: InsuranceType[];
  batch_auto_lock_days?: number;  // Tự khóa batch sau N ngày (optional)
}

// ═══════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════

export interface DashboardStats {
  totalRevenue: number;
  totalDebt: number;
  cancelledCount: number;
  renewalCount: number;
  unpaidOrdersCount: number;
  needsProcessingCount: number;
  providerChartData: { name: string; value: number }[];
  // Batch overview (Master only)
  batchOverview?: {
    processing: number;
    complete: number;
    locked: number;
    settled: number;
  };
  // Data quality (Master only)
  dataQuality?: BatchQuality;
}

export interface StaffReportItem {
  staff: User;
  activeCount: number;
  cancelledCount: number;
  revenue: number;
  collected: number;
  debt: number;
  unpaidList: InsuranceOrder[];
  cancelledList: InsuranceOrder[];
  allOrders: InsuranceOrder[];
  // Bonus info
  bonusAmount?: number;
  bonusThreshold?: string; // mốc đạt được
}

export interface AgencyReportItem {
  agency: User;
  parentStaff: string;
  activeCount: number;
  cancelledCount: number;
  revenue: number;
  collected: number;
  debt: number;
}

export interface PersonalStats {
  statsByType: {
    id: string;
    label: string;
    revenue: number;
    unpaid: number;
    successCount: number;
    cancelledCount: number;
    expiringCount: number;
    providerChartData: { name: string; value: number }[];
    ratioChartData: { name: string; value: number }[];
  }[];
  totalRevenue: number;
  totalUnpaid: number;
  totalSuccess: number;
  totalCancelled: number;
  totalExpiring: number;
  totalUnpaidOrdersCount: number;
  totalNeedsProcessing: number;
}
