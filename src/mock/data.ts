import { User, InsuranceOrder } from '../types';

export const mockUsers: User[] = [
  { id: '1', username: 'master', fullname: 'MASTER', phone: '', role: 'MASTER' },
  { id: '2', username: '0981740680', fullname: 'Kiều Diễm', phone: '0981740680', role: 'ACCOUNTANT', parent_id: '1' },
  { id: '3', username: '0931183389', fullname: 'Yến Nhi', phone: '0931183389', role: 'STAFF', parent_id: '1' },
  { id: '4', username: '0912349681', fullname: 'Duy Thương', phone: '0912349681', role: 'CTV', parent_id: '1' },
  { id: '5', username: '0942542249', fullname: 'Thị Yên', phone: '0942542249', role: 'STAFF', parent_id: '1' },
  { id: '6', username: '0962731468', fullname: 'Thuỳ Linh', phone: '0962731468', role: 'STAFF', parent_id: '1' },
  { id: '7', username: '0906643381', fullname: 'Quang Phước', phone: '0906643381', role: 'STAFF', parent_id: '1' },
  
  // Agencies
  { id: 'a1', username: '0901000008', fullname: 'CHỊ HƯƠNG', phone: '0901000008', role: 'AGENCY', parent_id: '2' }, // Kiều Diễm
  { id: 'a2', username: '0901000009', fullname: 'HĐ VÂN', phone: '0901000009', role: 'AGENCY', parent_id: '6' }, // Thuỳ Linh
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
    staff_id: '2', // Kiều Diễm
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
    staff_id: '4', // Duy Thương
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
    staff_id: '6', // Thuỳ Linh
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
    staff_id: '3', // Yến Nhi
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
