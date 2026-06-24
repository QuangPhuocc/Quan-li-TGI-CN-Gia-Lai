import { User, InsuranceOrder } from '../types';

export const mockUsers: User[] = [
  { id: '1', username: 'master', fullname: 'Giám đốc', phone: '0901000000', role: 'MASTER' },
  { id: '2', username: 'diem', fullname: 'DIỄM', phone: '0901000001', role: 'ACCOUNTANT', parent_id: '1' },
  { id: '3', username: 'duythuong', fullname: 'THƯƠNG', phone: '0901000002', role: 'STAFF', parent_id: '1' },
  { id: '4', username: 'linh', fullname: 'LINH', phone: '0901000003', role: 'ACCOUNTANT', parent_id: '1' },
  { id: '5', username: 'nhi', fullname: 'NHI', phone: '0901000004', role: 'STAFF', parent_id: '1' },
  { id: '8', username: 'yen', fullname: 'YÊN', phone: '0901000007', role: 'STAFF', parent_id: '1' },
  
  // Agencies
  { id: 'a1', username: 'chihuong', fullname: 'CHỊ HƯƠNG', phone: '0901000008', role: 'AGENCY', parent_id: '2' }, // DIEM
  { id: 'a2', username: 'hdvan', fullname: 'HĐ VÂN', phone: '0901000009', role: 'AGENCY', parent_id: '4' }, // LINH
];

export const mockOrders: InsuranceOrder[] = [
  {
    id: 'D26-80-030101-260337380',
    insurance_type: 'TNDS_OTO',
    serial_number: '15A52773',
    vehicle_owner: 'CTY CP TV VÀ TM THANH SƠN',
    license_plate: '15A52773',
    issue_date: '2026-04-01',
    effective_date: '2026-04-25',
    tnds_fee: 480700,
    nn_fee: 0,
    total_fee: 480700,
    provider: 'VIỄN ĐÔNG',
    staff_id: '2', // DIỄM
    agency_id: undefined,
    customer_phone: '0972712718',
    cod_amount: 270000,
    shipping_fee: 0,
    payment_status: 'UNPAID', // Just for mock
    status: 'ACTIVE',
    notes: '138350618022',
    created_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-01T10:00:00Z',
  },
  {
    id: 'D26-80-030101-260338617',
    insurance_type: 'TNDS_OTO',
    serial_number: '72A62083',
    vehicle_owner: 'ĐINH PHƯƠNG THẢO',
    license_plate: '72A62083',
    issue_date: '2026-04-02',
    effective_date: '2026-04-02',
    tnds_fee: 480700,
    nn_fee: 0,
    total_fee: 480700,
    provider: 'TASCO',
    staff_id: '3', // DUY THƯƠNG
    agency_id: undefined,
    customer_phone: '0356 141 067',
    cod_amount: 270000,
    shipping_fee: 18700,
    payment_status: 'PAID',
    status: 'ACTIVE',
    notes: '138523982876',
    created_at: '2026-04-02T10:00:00Z',
    updated_at: '2026-04-02T10:00:00Z',
  },
  {
    id: 'D26-80-030101-260337094',
    insurance_type: 'TNDS_OTO',
    serial_number: '81A27823',
    vehicle_owner: 'ĐỖ HUY TOÀN',
    license_plate: '81A27823',
    issue_date: '2026-04-01',
    effective_date: '2026-04-08',
    tnds_fee: 873400,
    nn_fee: 70000,
    total_fee: 943400,
    provider: 'VIỄN ĐÔNG',
    staff_id: '4', // LINH
    agency_id: 'a2', // HĐ VÂN
    customer_phone: '0342347766',
    cod_amount: 0,
    shipping_fee: 0,
    payment_status: 'UNPAID',
    status: 'ACTIVE',
    notes: '',
    created_at: '2026-04-01T09:15:00Z',
    updated_at: '2026-04-01T09:15:00Z',
  },
  {
    id: 'D26-80-030101-260338252',
    insurance_type: 'TNDS_OTO',
    serial_number: '98C26993',
    vehicle_owner: 'HÀ THỊ KHẢM - SN 1972',
    license_plate: '98C26993',
    issue_date: '2026-04-02',
    effective_date: '2026-04-02',
    tnds_fee: 0,
    nn_fee: 0,
    total_fee: 0,
    provider: 'TASCO',
    staff_id: '5', // NHI
    agency_id: undefined,
    customer_phone: '0977695732',
    cod_amount: 0,
    shipping_fee: 0,
    payment_status: 'UNPAID',
    status: 'CANCELLED', // HUY 28/05
    notes: 'HỦY 28/05',
    created_at: '2026-04-02T10:00:00Z',
    updated_at: '2026-04-02T10:00:00Z',
  }
];
