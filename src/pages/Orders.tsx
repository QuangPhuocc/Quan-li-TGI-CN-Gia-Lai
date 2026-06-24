import React, { useState, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { InsuranceOrder, InsuranceType, User, ChangeLog } from '../types';
import { Plus, Search, Filter, Download, Upload, Edit, Trash, X, Clock } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

// Date parser helper for Excel
function parseExcelDate(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    try {
      return val.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  }
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    try {
      return d.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const ddmmyyyy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (ddmmyyyy) {
      const day = ddmmyyyy[1].padStart(2, '0');
      const month = ddmmyyyy[2].padStart(2, '0');
      const year = ddmmyyyy[3];
      return `${year}-${month}-${day}`;
    }
  }
  return String(val);
}

// Clean and parse numbers from Excel sheet safely (supporting Vietnamese format 660.000)
function parseExcelNumber(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  let s = String(val).trim().replace(/[đ₫\sVNDvnd]/g, '');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && !hasComma) {
    const parts = s.split('.');
    if (parts[parts.length - 1].length === 3 || parts.length > 2) {
      s = s.replace(/\./g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(',');
    if (parts[parts.length - 1].length === 3 || parts.length > 2) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(/,/g, '.');
    }
  } else if (hasDot && hasComma) {
    const firstDot = s.indexOf('.');
    const firstComma = s.indexOf(',');
    if (firstDot < firstComma) {
      s = s.replace(/\./g, '').replace(/,/g, '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }
  const num = Number(s);
  return isNaN(num) ? 0 : num;
}

// Format serial number (D26-80-030101-260337049 -> D26...-260337049) to optimize width
function formatSerialNumber(val: string): string {
  if (!val) return '';
  const trimmed = val.trim();
  if (/^D\d{2}-/i.test(trimmed)) {
    const parts = trimmed.split('-');
    if (parts.length >= 2) {
      const prefix = parts[0];
      const suffix = parts[parts.length - 1];
      return `${prefix}...-${suffix}`;
    }
  }
  return val;
}

export default function Orders() {
  const { user } = useAuth();
  const { orders, users, changeLogs, addOrder, updateOrder, importOrders } = useData();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPayment, setFilterPayment] = useState('ALL');
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [filterProvider, setFilterProvider] = useState('ALL');
  const [filterInsurance, setFilterInsurance] = useState<InsuranceType | 'ALL'>('ALL');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<InsuranceOrder | null>(null);

  // New Upgrade states
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  const [isSystemHistoryOpen, setIsSystemHistoryOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ newOrders: InsuranceOrder[], warnings: any[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredOrders = useMemo(() => {
    let result = orders;

    if (filterInsurance !== 'ALL') {
      result = result.filter(o => o.insurance_type === filterInsurance);
    }

    if (filterMonth !== 'ALL') {
      result = result.filter(o => {
        const d = new Date(o.issue_date);
        const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return monthYear === filterMonth;
      });
    }

    if (filterProvider !== 'ALL') {
      result = result.filter(o => o.provider === filterProvider);
    }

    // Role-based data access (realtime sync logic applies here)
    if (user?.role === 'STAFF') {
      const myAgencies = users.filter(u => u.parent_id === user.id).map(u => u.id);
      result = result.filter(o => o.staff_id === user.id || (o.agency_id && myAgencies.includes(o.agency_id)));
    } else if (user?.role === 'AGENCY') {
      result = result.filter(o => o.agency_id === user.id);
    }

    // Advanced search covering Seri, Biển số, Chủ xe, SDT, Nhân viên, Đại lý
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(o => {
        const staffName = users.find(u => u.id === o.staff_id)?.fullname.toLowerCase() || '';
        const foundAgency = users.find(u => u.id === o.agency_id);
        const agencyName = foundAgency ? foundAgency.fullname.toLowerCase() : (o.agency_id?.toLowerCase() || '');
        return o.vehicle_owner.toLowerCase().includes(s) || 
               o.license_plate.toLowerCase().includes(s) ||
               (o.serial_number && o.serial_number.toLowerCase().includes(s)) ||
               (o.customer_phone && o.customer_phone.includes(s)) ||
               staffName.includes(s) ||
               agencyName.includes(s);
      });
    }
    
    if (filterStatus !== 'ALL') {
      if (filterStatus === 'NEEDS_PROCESSING') {
        result = result.filter(o => !o.staff_id || !o.cod_amount || (!o.customer_phone && !o.agency_id));
      } else {
        result = result.filter(o => o.status === filterStatus);
      }
    }

    if (filterPayment !== 'ALL') {
      result = result.filter(o => o.payment_status === filterPayment);
    }

    return result;
  }, [orders, user, users, searchTerm, filterStatus, filterPayment, filterInsurance, filterMonth, filterProvider]);

  const uniqueProviders = useMemo(() => {
    const providers = new Set(orders.map(o => o.provider).filter(Boolean));
    return Array.from(providers).sort();
  }, [orders]);

  const uniqueMonths = useMemo(() => {
    const months = new Set(orders.map(o => {
      const d = new Date(o.issue_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }));
    return Array.from(months).sort().reverse();
  }, [orders]);

  const INSURANCE_TABS = [
    { id: 'ALL', label: 'Tất cả' },
    { id: 'TNDS_OTO', label: 'TNDS Ô tô' },
    { id: 'VCX_OTO', label: 'VCX Ô tô' },
    { id: 'TNDS_XEMAY', label: 'TNDS Xe máy' },
    { id: 'Y_TE', label: 'BH Y tế' },
    { id: 'ETC', label: 'Thẻ ETC' },
    { id: 'KHAC', label: 'Khác' },
  ];

  const handleOpenModal = (order?: InsuranceOrder) => {
    if (order) setEditingOrder(order);
    else setEditingOrder(null);
    setIsModalOpen(true);
  };

  const handleSave = (formData: any) => {
    if (editingOrder) {
      updateOrder(editingOrder.id, formData, user!.fullname);
    } else {
      const newId = `ORD-${Date.now()}`;
      addOrder({
        ...formData,
        id: newId,
        created_by: user!.fullname,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, user!.fullname);
    }
    setIsModalOpen(false);
  };

  const handleStatusChange = (id: string, status: 'ACTIVE' | 'CANCELLED') => {
    if (status === 'CANCELLED') {
      setCancellingOrderId(id);
      setCancelReason('');
    } else {
      if (window.confirm('Bạn có chắc muốn khôi phục đơn này về trạng thái hoạt động?')) {
        updateOrder(id, { 
          status: 'ACTIVE',
          cancelled_by: undefined,
          cancelled_at: undefined,
          cancel_reason: undefined
        }, user!.fullname, 'Khôi phục thẻ bảo hiểm về trạng thái hoạt động');
      }
    }
  };

  const confirmCancel = () => {
    if (!cancelReason.trim()) {
      alert('Vui lòng nhập lý do hủy');
      return;
    }
    updateOrder(cancellingOrderId!, {
      status: 'CANCELLED',
      cancelled_by: user!.fullname,
      cancelled_at: new Date().toISOString(),
      cancel_reason: cancelReason
    }, user!.fullname, `Hủy thẻ bảo hiểm. Lý do: ${cancelReason}`);
    setCancellingOrderId(null);
  };

  // Excel Export
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      alert('Không có dữ liệu để xuất Excel');
      return;
    }

    const dataToExport = filteredOrders.map((o, index) => {
      const staffName = users.find(u => u.id === o.staff_id)?.fullname || '';
      const foundAgency = users.find(u => u.id === o.agency_id);
      const agencyName = foundAgency ? foundAgency.fullname : (o.agency_id || '');
      return {
        'STT': index + 1,
        'Số Seri/GCN': o.serial_number,
        'Chủ xe': o.vehicle_owner,
        'Biển số': o.license_plate,
        'Ngày cấp': o.issue_date,
        'Ngày hiệu lực': o.effective_date,
        'Ngày hết hạn': o.expiration_date || '',
        'Hãng': o.provider,
        'Phí TNDS': o.tnds_fee,
        'LP NNTX': o.nn_fee,
        'Tổng phí': o.total_fee,
        'Người cấp/Nhân viên': staffName,
        'Đại lý': agencyName,
        'SĐT khách': o.customer_phone,
        'COD': o.cod_amount,
        'Vận chuyển': o.shipping_fee,
        'Trạng thái đơn': o.status === 'ACTIVE' ? 'Hiệu lực' : 'Đã hủy',
        'Thanh toán': o.payment_status === 'PAID' ? 'Đã thanh toán' : o.payment_status === 'PARTIAL' ? 'Thanh toán 1 phần' : 'Chưa thanh toán',
        'Người hủy': o.cancelled_by || '',
        'Thời gian hủy': o.cancelled_at || '',
        'Lý do hủy': o.cancel_reason || '',
        'Ghi chú': o.notes || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Thẻ Bảo Hiểm');

    const dateStr = format(new Date(), 'dd-MM-yyyy_HHmm');
    XLSX.writeFile(workbook, `Danh_Sach_The_Bao_Hiem_${dateStr}.xlsx`);
  };

  // Excel Import
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rows.length === 0) {
          alert('File Excel trống');
          return;
        }

        // Auto find header row and columns mapping
        let headerIndex = -1;
        let maxScore = 0;
        const keywords = ['seri', 'chủ xe', 'chuxe', 'biển số', 'bienso', 'bks', 'ngày cấp', 'ngaycap', 'ngày hiệu lực', 'ngayhieuluc', 'phí', 'hãng', 'nhân viên', 'đại lý'];
        
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          let score = 0;
          row.forEach(cell => {
            if (cell) {
              const valStr = String(cell).toLowerCase();
              keywords.forEach(kw => {
                if (valStr.includes(kw)) score++;
              });
            }
          });
          if (score > maxScore) {
            maxScore = score;
            headerIndex = i;
          }
        }

        if (headerIndex === -1 && rows.length > 0) {
          headerIndex = 0;
        }

        const mapping: { [key: string]: number } = {};
        const headers = rows[headerIndex];
        headers.forEach((h, colIdx) => {
          if (!h) return;
          // Standardize spaces and tabs to a single space
          const cleanH = String(h).trim().replace(/\s+/g, ' ').toLowerCase();
          
          if (/seri|gcn|số\s*thẻ|so\s*the|só\s*thẻ|chứng\s*nhận|chung\s*nhan/i.test(cleanH)) {
            mapping['serial_number'] = colIdx;
          } else if (/chủ\s*xe|chu\s*xe|khách\s*hàng|khach\s*hang|ten\s*kh|tên\s*kh/i.test(cleanH)) {
            mapping['vehicle_owner'] = colIdx;
          } else if (/biển\s*số|bien\s*số|bien\s*so|bks|biển\s*kiểm\s*soát|bien\s*kiem\s*soat|bsx|biển\s*xe/i.test(cleanH)) {
            mapping['license_plate'] = colIdx;
          } else if (/ngày\s*cấp|ngay\s*cap/i.test(cleanH)) {
            mapping['issue_date'] = colIdx;
          } else if (/hiệu\s*lực|hieu\s*luc|ngày\s*bđ|ngay\s*bd|bắt\s*đầu|bat\s*dau/i.test(cleanH)) {
            mapping['effective_date'] = colIdx;
          } else if (/hết\s*hạn|het\s*han|kết\s*thúc|ket\s*thuc/i.test(cleanH)) {
            mapping['expiration_date'] = colIdx;
          } else if (/phí\s*tnds|phi\s*tnds|phí\s*bắt\s*buộc|tnds/i.test(cleanH)) {
            mapping['tnds_fee'] = colIdx;
          } else if (/lp\s*nntx|lệ\s*phí\s*nntx|nntx|người\s*ngồi|nguoi\s*ngoi|phí\s*tự\s*nguyện|phi\s*tu\s*nguyen/i.test(cleanH)) {
            mapping['nn_fee'] = colIdx;
          } else if (/tổng\s*phí|tong\s*phi|thành\s*tiền|thanh\s*tien|tổng\s*cộng|tong\s*cong/i.test(cleanH)) {
            mapping['total_fee'] = colIdx;
          } else if (/hãng|hang|provider/i.test(cleanH)) {
            mapping['provider'] = colIdx;
          } else if (/nhân\s*viên|nhan\s*vien|người\s*cấp|nguoi\s*cap|nv/i.test(cleanH)) {
            mapping['staff_id'] = colIdx;
          } else if (/đại\s*lý|dai\s*ly|agency/i.test(cleanH)) {
            mapping['agency_id'] = colIdx;
          } else if (/sđt|sdt|số\s*điện\s*thoại|so\s*dien\s*thoai|phone/i.test(cleanH)) {
            mapping['customer_phone'] = colIdx;
          } else if (/cod|tiền\s*cod|tien\s*cod/i.test(cleanH)) {
            mapping['cod_amount'] = colIdx;
          } else if (/vận\s*chuyển|van\s*chuyen|phí\s*ship|phi\s*ship|ship/i.test(cleanH)) {
            mapping['shipping_fee'] = colIdx;
          } else if (/ghi\s*chú|ghi\s*chu|notes/i.test(cleanH)) {
            mapping['notes'] = colIdx;
          } else if (/trạng\s*thái\s*thanh\s*toán|thanh\s*toán|trang\s*thai\s*thanh\s*toan|thanh\s*toan/i.test(cleanH)) {
            mapping['payment_status'] = colIdx;
          } else if (/trạng\s*thái\s*đơn|trạng\s*thái|trang\s*thai/i.test(cleanH)) {
            mapping['status'] = colIdx;
          }
        });

        // Warn if basic fields are missing
        if (mapping['serial_number'] === undefined) {
          alert('Không tìm thấy cột Số Seri/GCN trong file Excel');
          return;
        }

        const newOrders: any[] = [];
        const warnings: { rowIdx: number; message: string; severity: 'warning' | 'error' }[] = [];

        for (let i = headerIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          
          const nonSpamLength = row.filter(cell => cell !== undefined && cell !== null && cell !== '').length;
          if (nonSpamLength < 2) continue;

          const getVal = (field: string) => {
            const idx = mapping[field];
            return idx !== undefined ? row[idx] : undefined;
          };

          const serial_number = String(getVal('serial_number') || '').trim();
          if (!serial_number) {
            warnings.push({ rowIdx: i + 1, message: `Dòng ${i + 1}: Không có Số Seri (Bỏ qua)`, severity: 'error' });
            continue;
          }

          const vehicle_owner = String(getVal('vehicle_owner') || '').trim();
          const license_plate = String(getVal('license_plate') || '').trim();
          const provider = String(getVal('provider') || '').trim();
          const customer_phone = String(getVal('customer_phone') || '').trim();
          const notes = String(getVal('notes') || '').trim();

          const issue_date = parseExcelDate(getVal('issue_date')) || new Date().toISOString().split('T')[0];
          const effective_date = parseExcelDate(getVal('effective_date')) || new Date().toISOString().split('T')[0];
          let expiration_date = parseExcelDate(getVal('expiration_date'));
          if (!expiration_date) {
            const ed = new Date(effective_date);
            ed.setFullYear(ed.getFullYear() + 1);
            expiration_date = ed.toISOString().split('T')[0];
          }

          const tnds_fee = parseExcelNumber(getVal('tnds_fee'));
          const nn_fee = parseExcelNumber(getVal('nn_fee'));
          let total_fee = parseExcelNumber(getVal('total_fee'));
          if (total_fee === 0) {
            total_fee = tnds_fee + nn_fee;
          }

          const cod_amount = parseExcelNumber(getVal('cod_amount'));
          const shipping_fee = parseExcelNumber(getVal('shipping_fee'));

          // Resolve Staff Name to ID
          const staffNameVal = String(getVal('staff_id') || '').trim();
          let staff_id = user?.role === 'STAFF' ? user.id : '';
          if (staffNameVal) {
            const foundStaff = users.find(u => 
              u.fullname.toLowerCase() === staffNameVal.toLowerCase() || 
              u.username.toLowerCase() === staffNameVal.toLowerCase() ||
              u.fullname.toLowerCase().includes(staffNameVal.toLowerCase())
            );
            if (foundStaff) {
              staff_id = foundStaff.id;
            } else {
              // Keep original name so we can highlight it in red and edit in preview modal
              staff_id = staffNameVal;
              warnings.push({ rowIdx: i + 1, message: `Dòng ${i + 1}: Không tìm thấy nhân viên "${staffNameVal}" trong danh sách hệ thống.`, severity: 'warning' });
            }
          }

          // Resolve Agency Name to ID or keep as unregistered agency name
          const agencyNameVal = String(getVal('agency_id') || '').trim();
          let agency_id = undefined;
          if (agencyNameVal) {
            const foundAgency = users.find(u => 
              u.fullname.toLowerCase() === agencyNameVal.toLowerCase() || 
              u.username.toLowerCase() === agencyNameVal.toLowerCase() ||
              u.fullname.toLowerCase().includes(agencyNameVal.toLowerCase())
            );
            if (foundAgency) {
              agency_id = foundAgency.id;
            } else {
              // Unregistered agency names are kept directly without warning
              agency_id = agencyNameVal;
            }
          }

          // Resolve Insurance Type
          const typeStr = String(getVal('insurance_type') || '').trim().toLowerCase();
          let insurance_type: any = 'TNDS_OTO';
          if (typeStr.includes('tnds') && typeStr.includes('máy')) {
            insurance_type = 'TNDS_XEMAY';
          } else if (typeStr.includes('vật chất') || typeStr.includes('vcx') || typeStr.includes('tự nguyện')) {
            insurance_type = 'VCX_OTO';
          } else if (typeStr.includes('y tế') || typeStr.includes('y_te') || typeStr.includes('sức khỏe')) {
            insurance_type = 'Y_TE';
          } else if (typeStr.includes('etc') || typeStr.includes('vetc') || typeStr.includes('epass')) {
            insurance_type = 'ETC';
          } else if (typeStr.includes('khác') || typeStr.includes('khac')) {
            insurance_type = 'KHAC';
          } else if (typeStr.includes('tnds')) {
            insurance_type = 'TNDS_OTO';
          }

          // Resolve Status
          const statusVal = String(getVal('status') || '').trim().toLowerCase();
          let status: any = 'ACTIVE';
          if (statusVal.includes('hủy') || statusVal.includes('huy') || statusVal.includes('cancel')) {
            status = 'CANCELLED';
          }

          // Resolve Payment Status: COD > 0 means PAID
          let payment_status: any = 'UNPAID';
          if (cod_amount > 0) {
            payment_status = 'PAID';
          } else {
            const payVal = String(getVal('payment_status') || '').trim().toLowerCase();
            if (payVal.includes('đã') || payVal.includes('da') || payVal.includes('paid') || payVal.includes('rồi')) {
              payment_status = 'PAID';
            } else if (payVal.includes('phần') || payVal.includes('phan') || payVal.includes('partial')) {
              payment_status = 'PARTIAL';
            }
          }

          newOrders.push({
            id: `ORD-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
            insurance_type,
            serial_number,
            vehicle_owner,
            license_plate,
            issue_date,
            effective_date,
            expiration_date,
            tnds_fee,
            nn_fee,
            total_fee,
            provider,
            staff_id,
            agency_id,
            customer_phone,
            cod_amount,
            shipping_fee,
            payment_status,
            status,
            notes,
            created_by: user!.fullname,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }

        setImportPreview({ newOrders, warnings });
      } catch (err: any) {
        alert('Lỗi đọc file Excel: ' + err.message);
      }
      
      // Clear input
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmImport = (finalOrders: InsuranceOrder[]) => {
    // Generate change logs for import
    const logs: ChangeLog[] = finalOrders.map(o => ({
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order_id: o.id,
      serial_number: o.serial_number,
      action: 'IMPORT',
      user_fullname: user!.fullname,
      timestamp: new Date().toISOString(),
      details: `Import thẻ bảo hiểm từ file Excel, chủ xe: ${o.vehicle_owner}`
    }));

    importOrders(finalOrders, logs);
    setImportPreview(null);
    alert(`Đã import thành công ${finalOrders.length} đơn vào hệ thống!`);
  };

  return (
    <div className="space-y-6">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImportExcel} 
        accept=".xlsx, .xls" 
        className="hidden" 
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-semibold text-slate-800">Quản lý Đơn Bảo Hiểm</h1>
        <div className="flex flex-wrap items-center gap-3">
          {(user?.role === 'MASTER' || user?.role === 'ACCOUNTANT') && (
            <button 
              onClick={() => setIsSystemHistoryOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 text-slate-700"
            >
              <Clock className="w-4 h-4" /> Nhật ký hệ thống
            </button>
          )}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            <Upload className="w-4 h-4" /> Import
          </button>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Thêm đơn
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4">
        <div className="flex overflow-x-auto pb-2 -mb-2 gap-2 hide-scrollbar">
          {INSURANCE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterInsurance(tab.id as any)}
              className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterInsurance === tab.id 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm chủ xe, biển số, seri, điện thoại, nhân viên, đại lý..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <select 
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="ALL">Tất cả hãng</option>
              {uniqueProviders.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select 
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="ALL">Tất cả tháng</option>
              {uniqueMonths.map(m => (
                <option key={m} value={m}>Tháng {m.split('-')[1]}/{m.split('-')[0]}</option>
              ))}
            </select>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="NEEDS_PROCESSING">Cần xử lý</option>
              <option value="ACTIVE">Đang hiệu lực</option>
              <option value="CANCELLED">Đã hủy (Thẻ hủy)</option>
            </select>
            <select 
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="ALL">Tất cả thanh toán</option>
              <option value="UNPAID">Chưa thanh toán</option>
              <option value="PARTIAL">Thanh toán 1 phần</option>
              <option value="PAID">Đã thanh toán</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto w-full">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead className="sticky top-0 z-20 bg-sky-100 shadow-[0_2px_2px_-1px_rgba(0,0,0,0.1)]">
              <tr className="bg-sky-100 border-b border-slate-300 text-[11px] font-bold text-slate-700">
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">STT</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">GCN</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">TÊN KHÁCH HÀNG</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">BIỂN SỐ</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">NGÀY CẤP</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">NGÀY HIỆU LỰC</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">PHÍ TNDS</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">LP NNTX</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">TỔNG PHÍ</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">TRẠNG THÁI</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">NGƯỜI CẤP</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">ĐẠI LÝ</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">SDT</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">COD</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">VẬN CHUYỂN</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">GHI CHÚ</th>
                <th className="px-1 py-1.5 text-center font-bold border-r border-slate-300 bg-sky-100 sticky top-0 z-20">HÃNG</th>
                <th className="px-1 py-1.5 text-center border-l-2 border-slate-300 sticky top-0 right-0 bg-sky-100 z-30 font-bold shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.1)]">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={18} className="px-6 py-8 text-center text-slate-500">
                    Không tìm thấy đơn bảo hiểm nào
                  </td>
                </tr>
              ) : filteredOrders.map((order, index) => {
                const staffName = users.find(u => u.id === order.staff_id)?.fullname || '';
                const foundAgency = users.find(u => u.id === order.agency_id);
                const agencyName = foundAgency ? foundAgency.fullname : (order.agency_id || '');
                return (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors bg-white">
                    <td className="px-1 py-1 text-center border-r border-slate-200">{index + 1}</td>
                    <td 
                      className="px-1 py-1 border-r border-slate-200 font-medium text-slate-900 whitespace-nowrap cursor-pointer select-all text-center"
                      title={`Mã đầy đủ: ${order.serial_number || order.id}\n(Click 2 lần để copy)`}
                      onDoubleClick={() => {
                        navigator.clipboard.writeText(order.serial_number || order.id);
                        alert(`Đã copy Mã GCN: ${order.serial_number || order.id}`);
                      }}
                    >
                      {formatSerialNumber(order.serial_number || order.id)}
                    </td>
                    <td className="px-1 py-1 border-r border-slate-200 truncate max-w-[100px]" title={order.vehicle_owner}>{order.vehicle_owner}</td>
                    <td className="px-1 py-1 border-r border-slate-200 whitespace-nowrap text-center">{order.license_plate || <span className="text-slate-400">-</span>}</td>
                    <td className="px-1 py-1 border-r border-slate-200 whitespace-nowrap text-center">{format(new Date(order.issue_date), 'dd/MM/yyyy')}</td>
                    <td className="px-1 py-1 border-r border-slate-200 whitespace-nowrap text-center">{format(new Date(order.effective_date), 'dd/MM/yyyy')}</td>
                    <td className="px-1 py-1 border-r border-slate-200 text-right whitespace-nowrap">{new Intl.NumberFormat('vi-VN').format(order.tnds_fee)}</td>
                    <td className="px-1 py-1 border-r border-slate-200 text-right whitespace-nowrap">{new Intl.NumberFormat('vi-VN').format(order.nn_fee)}</td>
                    <td className="px-1 py-1 border-r border-slate-200 text-right whitespace-nowrap font-medium">{new Intl.NumberFormat('vi-VN').format(order.total_fee)}</td>
                    <td className="px-1 py-1 border-r border-slate-200 text-center">
                      <div className="flex flex-col gap-0.5 items-center">
                        <StatusBadge status={order.status} notes={order.notes} order={order} />
                        {order.status !== 'CANCELLED' && (
                          <PaymentBadge status={order.cod_amount > 0 ? 'PAID' : order.payment_status} />
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1 border-r border-slate-200 truncate max-w-[90px]" title={staffName}>{staffName || <span className="text-red-500 font-medium">Chưa phân công</span>}</td>
                    <td className="px-1 py-1 border-r border-slate-200 truncate max-w-[90px]" title={agencyName}>{agencyName || <span className="text-slate-400">Không có</span>}</td>
                    <td className="px-1 py-1 border-r border-slate-200 whitespace-nowrap text-center">{order.customer_phone || <span className="text-slate-400">-</span>}</td>
                    <td className="px-1 py-1 border-r border-slate-200 text-right whitespace-nowrap">{new Intl.NumberFormat('vi-VN').format(order.cod_amount)}</td>
                    <td className="px-1 py-1 border-r border-slate-200 text-right whitespace-nowrap">{new Intl.NumberFormat('vi-VN').format(order.shipping_fee)}</td>
                    <td className="px-1 py-1 border-r border-slate-200 max-w-[120px] truncate" title={order.notes}>{order.notes || <span className="text-slate-400">-</span>}</td>
                    <td className="px-1 py-1 border-r border-slate-200 whitespace-nowrap text-center">{order.provider || <span className="text-slate-400">-</span>}</td>
                    <td className="px-1 py-1 text-center sticky right-0 bg-white border-l-2 border-slate-200 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] z-10">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setHistoryOrderId(order.id)}
                          className="p-1 text-slate-400 hover:text-slate-600 transition-colors" title="Lịch sử thay đổi"
                        >
                          <Clock className="w-4.5 h-4.5" />
                        </button>
                        <button 
                          onClick={() => handleOpenModal(order)}
                          className="p-1 text-slate-400 hover:text-blue-600 transition-colors" title="Sửa"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {order.status === 'ACTIVE' ? (
                          <button 
                            onClick={() => handleStatusChange(order.id, 'CANCELLED')}
                            className="p-1 text-slate-400 hover:text-red-600 transition-colors" title="Hủy đơn"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleStatusChange(order.id, 'ACTIVE')}
                            className="p-1 text-slate-400 hover:text-emerald-600 transition-colors" title="Khôi phục"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <OrderFormModal 
          order={editingOrder} 
          onClose={() => setIsModalOpen(false)} 
          onSave={handleSave} 
          users={users}
          currentUser={user!}
        />
      )}

      {cancellingOrderId && (
        <CancelReasonModal 
          onClose={() => setCancellingOrderId(null)} 
          onConfirm={confirmCancel} 
        />
      )}

      {historyOrderId && (
        <OrderHistoryModal 
          orderId={historyOrderId} 
          onClose={() => setHistoryOrderId(null)} 
          changeLogs={changeLogs} 
          orders={orders} 
        />
      )}

      {isSystemHistoryOpen && (
        <SystemHistoryModal 
          onClose={() => setIsSystemHistoryOpen(false)} 
          changeLogs={changeLogs} 
        />
      )}

      {importPreview && (
        <ImportPreviewModal 
          previewData={importPreview} 
          onClose={() => setImportPreview(null)} 
          onConfirm={confirmImport} 
          users={users} 
        />
      )}
    </div>
  );
}

function PaymentBadge({ status }: { status: string }) {
  if (status === 'PAID') return <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-700">Đã TT</span>;
  if (status === 'PARTIAL') return <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">TT 1 phần</span>;
  return <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">Chưa TT</span>;
}

function StatusBadge({ status, notes, order }: { status: string, notes?: string, order?: any }) {
  const needsProcessing = order && (
    !order.staff_id || 
    !order.cod_amount || 
    (!order.customer_phone && !order.agency_id)
  );
  
  if (status === 'ACTIVE') {
    if (needsProcessing) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-amber-200 bg-amber-50 text-amber-700">Cần xử lý</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-700">Hiệu lực</span>;
  }
  if (status === 'NEEDS_PROCESSING') {
    return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700">Cần xử lý</span>;
  }
  
  // Show detailed cancellation metadata
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span 
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-red-200 bg-red-50 text-red-700 cursor-help"
        title={order?.cancel_reason ? `Người hủy: ${order.cancelled_by}\nThời gian: ${order.cancelled_at ? format(new Date(order.cancelled_at), 'dd/MM/yyyy HH:mm') : ''}\nLý do: ${order.cancel_reason}` : 'Thẻ đã hủy'}
      >
        Đã hủy
      </span>
      {order?.cancel_reason && (
        <span className="text-[10px] text-slate-500 max-w-[120px] truncate" title={order.cancel_reason}>
          {order.cancel_reason}
        </span>
      )}
    </div>
  );
}


function OrderFormModal({ order, onClose, onSave, users, currentUser }: any) {
  const [formData, setFormData] = useState({
    insurance_type: order?.insurance_type || 'TNDS_OTO',
    serial_number: order?.serial_number || '',
    vehicle_owner: order?.vehicle_owner || '',
    license_plate: order?.license_plate || '',
    issue_date: order?.issue_date || new Date().toISOString().split('T')[0],
    effective_date: order?.effective_date || new Date().toISOString().split('T')[0],
    tnds_fee: order?.tnds_fee || 0,
    nn_fee: order?.nn_fee || 0,
    total_fee: order?.total_fee || 0,
    provider: order?.provider || '',
    staff_id: order?.staff_id || (currentUser.role === 'STAFF' ? currentUser.id : ''),
    agency_id: order?.agency_id || (currentUser.role === 'AGENCY' ? currentUser.id : ''),
    customer_phone: order?.customer_phone || '',
    cod_amount: order?.cod_amount || 0,
    shipping_fee: order?.shipping_fee || 0,
    payment_status: order?.payment_status || 'UNPAID',
    status: order?.status || 'ACTIVE',
    notes: order?.notes || '',
  });

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    let newValue: any = value;
    
    if (['tnds_fee', 'nn_fee', 'cod_amount', 'shipping_fee'].includes(name)) {
      newValue = Number(value);
    }
    
    setFormData(prev => {
      const next = { ...prev, [name]: newValue };
      if (name === 'tnds_fee' || name === 'nn_fee') {
        next.total_fee = Number(next.tnds_fee) + Number(next.nn_fee);
      }
      if (name === 'cod_amount' && Number(newValue) > 0) {
        next.payment_status = 'PAID';
      }
      return next;
    });
  };

  const handleSubmit = (e: any) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-xl font-semibold text-slate-800">{order ? 'Sửa Đơn Bảo Hiểm' : 'Thêm Đơn Mới'}</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-medium text-slate-900 border-b pb-2">Thông tin chung</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Loại nghiệp vụ <span className="text-red-500">*</span></label>
                  <select required name="insurance_type" value={formData.insurance_type} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="TNDS_OTO">TNDS Ô tô</option>
                    <option value="VCX_OTO">Vật chất xe Ô tô</option>
                    <option value="TNDS_XEMAY">TNDS Xe máy</option>
                    <option value="Y_TE">Bảo hiểm Y tế</option>
                    <option value="ETC">Thẻ ETC</option>
                    <option value="KHAC">Khác</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hãng (Provider)</label>
                  <input type="text" name="provider" value={formData.provider} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="VD: VIỄN ĐÔNG" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số Seri / Số Thẻ / GCN <span className="text-red-500">*</span></label>
                <input required type="text" name="serial_number" value={formData.serial_number} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ngày cấp <span className="text-red-500">*</span></label>
                  <input required type="date" name="issue_date" value={formData.issue_date} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ngày hiệu lực <span className="text-red-500">*</span></label>
                  <input required type="date" name="effective_date" value={formData.effective_date} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              
              <h3 className="font-medium text-slate-900 border-b pb-2 mt-6">Thông tin khách hàng</h3>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Chủ xe / Tên KH <span className="text-red-500">*</span></label>
                <input required type="text" name="vehicle_owner" value={formData.vehicle_owner} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Biển số xe</label>
                  <input type="text" name="license_plate" value={formData.license_plate} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SĐT Khách hàng</label>
                  <input type="text" name="customer_phone" value={formData.customer_phone} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-slate-900 border-b pb-2">Thông tin phí & Thanh toán</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phí TNDS</label>
                  <input type="number" name="tnds_fee" value={formData.tnds_fee} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phí LP NNTX</label>
                  <input type="number" name="nn_fee" value={formData.nn_fee} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tổng phí</label>
                  <input type="number" readOnly value={formData.total_fee} className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Trạng thái thanh toán <span className="text-red-500">*</span></label>
                  <select name="payment_status" value={formData.payment_status} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="UNPAID">Chưa thanh toán</option>
                    <option value="PARTIAL">Thanh toán 1 phần</option>
                    <option value="PAID">Đã thanh toán</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Số tiền COD</label>
                  <input type="number" name="cod_amount" value={formData.cod_amount} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phí Vận chuyển</label>
                  <input type="number" name="shipping_fee" value={formData.shipping_fee} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <h3 className="font-medium text-slate-900 border-b pb-2 mt-6">Phân công & Ghi chú</h3>
              {(currentUser.role === 'MASTER' || currentUser.role === 'ACCOUNTANT' || currentUser.role === 'STAFF') && (
                <div className="grid grid-cols-2 gap-4">
                  {(currentUser.role === 'MASTER' || currentUser.role === 'ACCOUNTANT') && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nhân viên (Người cấp)</label>
                      <select name="staff_id" value={formData.staff_id} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                        <option value="">Chọn nhân viên...</option>
                        {users.filter(u => u.role === 'STAFF').map(u => (
                          <option key={u.id} value={u.id}>{u.fullname}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Đại lý</label>
                    <select name="agency_id" value={formData.agency_id} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                      <option value="">Không có</option>
                      {users.filter(u => u.role === 'AGENCY' && (currentUser.role === 'MASTER' || currentUser.role === 'ACCOUNTANT' || u.parent_id === currentUser.id)).map(u => (
                        <option key={u.id} value={u.id}>{u.fullname}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú / Mã Giao dịch</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"></textarea>
              </div>
            </div>
          </div>
          
        </form>
      </div>
    </div>
  );
}

function CancelReasonModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert('Vui lòng nhập lý do hủy');
      return;
    }
    onConfirm(reason);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Lý do hủy thẻ bảo hiểm</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nhập lý do hủy thẻ <span className="text-red-500">*</span></label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do chi tiết..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
              Quay lại
            </button>
            <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
              Xác nhận hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrderHistoryModal({ orderId, onClose, changeLogs, orders }: { orderId: string; onClose: () => void; changeLogs: ChangeLog[]; orders: InsuranceOrder[] }) {
  const order = orders.find(o => o.id === orderId);
  const logs = useMemo(() => {
    return changeLogs.filter(l => l.order_id === orderId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [changeLogs, orderId]);

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Lịch sử thay đổi</h2>
            <p className="text-sm text-slate-500 mt-0.5">Số Seri/GCN: <span className="font-semibold text-slate-700">{order?.serial_number || orderId}</span></p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">Không có dữ liệu lịch sử cho thẻ này.</div>
          ) : (
            <div className="relative border-l-2 border-slate-200 ml-3 pl-6 space-y-6">
              {logs.map((log) => (
                <div key={log.id} className="relative">
                  <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-white ${
                    log.action === 'CREATE' ? 'bg-blue-500' :
                    log.action === 'CANCEL' ? 'bg-red-500' :
                    log.action === 'UPDATE_STATUS' || log.action === 'UPDATE_PAYMENT' ? 'bg-amber-500' :
                    'bg-slate-400'
                  }`} />
                  <div className="text-xs text-slate-400 mb-1">
                    {format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss')} - <span className="font-semibold text-slate-600">{log.user_fullname}</span>
                  </div>
                  <div className="text-sm text-slate-800 font-medium">
                    {log.action === 'CREATE' ? 'Tạo mới thẻ' :
                     log.action === 'CANCEL' ? 'Hủy thẻ' :
                     log.action === 'UPDATE_STATUS' ? 'Cập nhật trạng thái' :
                     log.action === 'UPDATE_PAYMENT' ? 'Cập nhật thanh toán' :
                     log.action === 'UPDATE_ASSIGNMENT' ? 'Cập nhật phân công' :
                     log.action === 'IMPORT' ? 'Import từ Excel' : 'Cập nhật thông tin'}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{log.details}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SystemHistoryModal({ onClose, changeLogs }: { onClose: () => void; changeLogs: ChangeLog[] }) {
  const [filterAction, setFilterAction] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = useMemo(() => {
    let result = changeLogs;
    if (filterAction !== 'ALL') {
      result = result.filter(l => l.action === filterAction);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => 
        l.serial_number.toLowerCase().includes(q) ||
        l.user_fullname.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [changeLogs, filterAction, searchQuery]);

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800">Lịch sử hoạt động hệ thống</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm theo Seri, Người thực hiện, nội dung..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm outline-none bg-white text-slate-700"
            />
          </div>
          <select 
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none bg-white text-slate-700 font-medium"
          >
            <option value="ALL">Tất cả hành động</option>
            <option value="CREATE">Tạo mới (CREATE)</option>
            <option value="EDIT">Cập nhật (EDIT)</option>
            <option value="UPDATE_STATUS">Cập nhật Trạng thái</option>
            <option value="UPDATE_PAYMENT">Cập nhật Thanh toán</option>
            <option value="UPDATE_ASSIGNMENT">Cập nhật Phân công</option>
            <option value="CANCEL">Hủy thẻ (CANCEL)</option>
            <option value="IMPORT">Import Excel</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-100 border-b text-slate-600 font-semibold">
                  <th className="px-4 py-2.5">Thời gian</th>
                  <th className="px-4 py-2.5">Số Seri/GCN</th>
                  <th className="px-4 py-2.5">Người thực hiện</th>
                  <th className="px-4 py-2.5">Hành động</th>
                  <th className="px-4 py-2.5">Chi tiết thay đổi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Không tìm thấy hoạt động nào</td>
                  </tr>
                ) : filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 bg-white">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss')}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{log.serial_number}</td>
                    <td className="px-4 py-3 text-slate-700">{log.user_fullname}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                        log.action === 'CREATE' ? 'bg-blue-100 text-blue-700' :
                        log.action === 'CANCEL' ? 'bg-red-100 text-red-700' :
                        log.action === 'UPDATE_STATUS' || log.action === 'UPDATE_PAYMENT' ? 'bg-amber-100 text-amber-700' :
                        log.action === 'IMPORT' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-sm truncate" title={log.details}>{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportPreviewModal({ previewData, onClose, onConfirm, users }: { previewData: { newOrders: any[], warnings: any[] }; onClose: () => void; onConfirm: (finalOrders: any[]) => void; users: User[] }) {
  const [orders, setOrders] = useState<any[]>(previewData.newOrders);
  
  const handleSelectStaff = (index: number, val: string) => {
    setOrders(prev => prev.map((o, idx) => idx === index ? { ...o, staff_id: val } : o));
  };

  const handleSelectAgency = (index: number, val: string) => {
    setOrders(prev => prev.map((o, idx) => idx === index ? { ...o, agency_id: val || undefined } : o));
  };

  const handleConfirm = () => {
    onConfirm(orders);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-white">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Xem trước kết quả Import</h2>
            <p className="text-sm text-slate-500 mt-1">Đã tìm thấy <span className="font-semibold text-blue-600">{orders.length}</span> thẻ hợp lệ để import.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
          {previewData.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-h-[150px] overflow-y-auto space-y-2">
              <h4 className="font-semibold text-amber-800 text-sm flex items-center gap-2">
                Cảnh báo ({previewData.warnings.length})
              </h4>
              <ul className="text-xs text-amber-700 list-disc pl-4 space-y-1">
                {previewData.warnings.map((w, idx) => (
                  <li key={idx}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b text-slate-600 font-bold sticky top-0 bg-slate-50 z-10 text-center">
                    <th className="px-2 py-2">Seri</th>
                    <th className="px-2 py-2">Khách hàng</th>
                    <th className="px-2 py-2">Biển số</th>
                    <th className="px-2 py-2">Hãng</th>
                    <th className="px-2 py-2 text-right">Tổng phí</th>
                    <th className="px-2 py-2">Ngày hiệu lực</th>
                    <th className="px-2 py-2">Nhân viên (Người cấp)</th>
                    <th className="px-2 py-2">Đại lý</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {orders.map((o, index) => {
                    const staffValid = users.some(u => u.id === o.staff_id && (u.role === 'STAFF' || u.role === 'ACCOUNTANT' || u.role === 'MASTER'));
                    return (
                      <tr key={index} className={`hover:bg-slate-50 transition-colors ${!staffValid ? 'bg-red-50 text-red-950 border-red-200' : 'bg-white'}`}>
                        <td className="px-2 py-1.5 font-medium text-slate-900">{o.serial_number}</td>
                        <td className="px-2 py-1.5">{o.vehicle_owner}</td>
                        <td className="px-2 py-1.5">{o.license_plate || '-'}</td>
                        <td className="px-2 py-1.5">{o.provider || '-'}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{new Intl.NumberFormat('vi-VN').format(o.total_fee)} ₫</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{o.effective_date}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-col gap-1">
                            <select 
                              value={users.some(u => u.id === o.staff_id) ? o.staff_id : ''}
                              onChange={(e) => handleSelectStaff(index, e.target.value)}
                              className={`border rounded px-2 py-1 text-xs outline-none bg-white text-slate-700 ${!staffValid ? 'border-red-400 bg-red-100 text-red-700 font-semibold' : 'border-slate-300'}`}
                            >
                              <option value="">Chọn nhân viên...</option>
                              {users.filter(u => u.role === 'STAFF' || u.role === 'ACCOUNTANT' || u.role === 'MASTER').map(u => (
                                <option key={u.id} value={u.id}>{u.fullname}</option>
                              ))}
                            </select>
                            {!staffValid && o.staff_id && (
                              <span className="text-[10px] text-red-600 font-semibold leading-none">Excel: "{o.staff_id}"</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <select 
                            value={users.some(u => u.id === o.agency_id) ? o.agency_id : (o.agency_id || '')}
                            onChange={(e) => handleSelectAgency(index, e.target.value)}
                            className="border border-slate-300 rounded px-2 py-1 text-xs outline-none bg-white text-slate-700"
                          >
                            <option value="">Không có đại lý</option>
                            {users.filter(u => u.role === 'AGENCY').map(u => (
                              <option key={u.id} value={u.id}>{u.fullname}</option>
                            ))}
                            {o.agency_id && !users.some(u => u.id === o.agency_id) && (
                              <option value={o.agency_id}>{o.agency_id} (Mới)</option>
                            )}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            Hủy bỏ
          </button>
          <button 
            type="button" 
            onClick={handleConfirm}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Xác nhận lưu vào hệ thống
          </button>
        </div>
      </div>
    </div>
  );
}
