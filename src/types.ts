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
  commission_rate?: number; // Hoa hồng (%)
  notes?: string;
  expiration_date?: string; // Ngày hết hạn
  statement_month?: string; // Bảng kê theo Tháng (YYYY-MM)
  cancelled_by?: string; // Người hủy (ID hoặc tên)
  cancelled_at?: string; // Thời gian hủy
  cancel_reason?: string; // Lý do hủy
  created_by?: string; // Người tạo (ID hoặc tên)
  updated_by?: string; // Người cập nhật cuối (ID hoặc tên)
  created_at: string;
  updated_at: string;
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
