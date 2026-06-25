import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { User } from '../types';
import { Edit, Trash, Plus, X, Upload, Eye, Image as ImageIcon, Search, FileText, Download } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

export default function Agencies() {
  const { user } = useAuth();
  const { users, orders, addUser, updateUser, deleteUser } = useData();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<User | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Access control
  if (!user || (user.role !== 'MASTER' && user.role !== 'ACCOUNTANT' && user.role !== 'STAFF' && user.role !== 'CTV')) {
    return (
      <div className="p-8 text-center text-slate-500 font-medium">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  // Filter agencies belonging to the logged-in user (unless master, who sees all)
  const myAgencies = useMemo(() => {
    let result = users.filter(u => u.role === 'AGENCY');
    if (user.role !== 'MASTER') {
      result = result.filter(u => u.parent_id === user.id);
    }
    
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(a => 
        a.fullname.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        (a.phone && a.phone.includes(q)) ||
        (a.address && a.address.toLowerCase().includes(q))
      );
    }
    
    return result;
  }, [users, user, searchTerm]);

  const handleEdit = (agency: User) => {
    setEditingAgency(agency);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa đại lý này khỏi danh sách?')) {
      deleteUser(id);
    }
  };

  const [selectedAgencyForStatement, setSelectedAgencyForStatement] = useState<User | null>(null);

  const handleSave = (agencyData: Partial<User>) => {
    if (editingAgency) {
      updateUser(editingAgency.id, agencyData);
    } else {
      const newAgency: User = {
        ...agencyData,
        id: `AG-${Date.now()}`,
        role: 'AGENCY',
        parent_id: user.id, // Assigned to current user
        username: `dl_${Date.now()}`, // Auto generate username
      } as User;
      addUser(newAgency);
    }
    setIsModalOpen(false);
    setEditingAgency(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quản lý Đại lý</h1>
          <p className="text-sm text-slate-500 mt-1">Danh sách đại lý thuộc quyền quản lý trực tiếp của bạn</p>
        </div>
        <button 
          onClick={() => { setEditingAgency(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Thêm đại lý mới
        </button>
      </div>

      {/* Filter and search bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Tìm kiếm theo tên đại lý, số điện thoại, địa chỉ..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-slate-50 text-slate-700"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-500 whitespace-nowrap">
                <th className="px-6 py-4">Tên đại lý (Họ và tên)</th>
                <th className="px-6 py-4">Số điện thoại</th>
                <th className="px-6 py-4">Địa chỉ</th>
                <th className="px-6 py-4 text-center">Hình CCCD</th>
                {user.role === 'MASTER' && <th className="px-6 py-4">Nhân viên quản lý</th>}
                <th className="px-6 py-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {myAgencies.length === 0 ? (
                <tr>
                  <td colSpan={user.role === 'MASTER' ? 6 : 5} className="px-6 py-8 text-center text-slate-500">
                    Không tìm thấy đại lý nào.
                  </td>
                </tr>
              ) : myAgencies.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">{a.fullname}</td>
                  <td className="px-6 py-4 text-slate-600">{a.phone || '-'}</td>
                  <td className="px-6 py-4 text-slate-600 max-w-xs truncate" title={a.address}>{a.address || '-'}</td>
                  <td className="px-6 py-4 text-center">
                    {a.cccd_image ? (
                      <button 
                        onClick={() => setPreviewImage(a.cccd_image || null)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Xem ảnh
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs">Chưa cập nhật</span>
                    )}
                  </td>
                  {user.role === 'MASTER' && (
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {a.parent_id ? users.find(u => u.id === a.parent_id)?.fullname : 'Không có'}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setSelectedAgencyForStatement(a)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                        title="Xem bảng kê đối soát"
                      >
                        <FileText className="w-3.5 h-3.5" /> Xem bảng kê
                      </button>
                      <button 
                        onClick={() => handleEdit(a)} 
                        className="p-1.5 text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 rounded-lg transition-colors cursor-pointer"
                        title="Sửa thông tin"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(a.id)} 
                        className="p-1.5 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg transition-colors cursor-pointer"
                        title="Xóa đại lý"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <AgencyModal 
          agency={editingAgency}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {/* Agency Statement Modal */}
      {selectedAgencyForStatement && (
        <AgencyStatementModal
          agency={selectedAgencyForStatement}
          onClose={() => setSelectedAgencyForStatement(null)}
          users={users}
          orders={orders}
        />
      )}

      {/* Full screen image preview modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 z-55">
          <div className="bg-white rounded-xl overflow-hidden max-w-4xl w-full shadow-2xl relative">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-slate-800">Hình ảnh CCCD</h3>
              <button 
                onClick={() => setPreviewImage(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex justify-center bg-slate-950 max-h-[75vh] overflow-y-auto">
              <img src={previewImage} alt="Hình CCCD" className="max-w-full max-h-[60vh] object-contain rounded" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AgencyModalProps {
  agency: User | null;
  onClose: () => void;
  onSave: (data: Partial<User>) => void;
}

function AgencyModal({ agency, onClose, onSave }: AgencyModalProps) {
  const [formData, setFormData] = useState<Partial<User>>({
    username: agency?.username || '',
    fullname: agency?.fullname || '',
    phone: agency?.phone || '',
    address: agency?.address || '',
    cccd_image: agency?.cccd_image || '',
  });

  const [imagePreview, setImagePreview] = useState<string | null>(agency?.cccd_image || null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Verify size & type
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chỉ chọn các tệp tin hình ảnh (png, jpg, jpeg).');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setImagePreview(base64String);
      setFormData(prev => ({ ...prev, cccd_image: base64String }));
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    setImagePreview(null);
    setFormData(prev => ({ ...prev, cccd_image: '' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800">
            {agency ? 'Sửa thông tin Đại lý' : 'Thêm Đại lý mới'}
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Tên đăng nhập removed as per requirement */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Tên đại lý (Họ và tên) <span className="text-red-500">*</span></label>
            <input 
              required 
              type="text" 
              name="fullname" 
              value={formData.fullname} 
              onChange={handleChange} 
              placeholder="VD: Đại lý Hương"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Số điện thoại</label>
            <input 
              type="text" 
              name="phone" 
              value={formData.phone} 
              onChange={handleChange} 
              placeholder="VD: 0987654321"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Địa chỉ</label>
            <input 
              type="text" 
              name="address" 
              value={formData.address} 
              onChange={handleChange} 
              placeholder="VD: 123 Lê Lợi, Pleiku, Gia Lai"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Hình ảnh CCCD</label>
            <div className="mt-1 flex items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-6 bg-slate-50 hover:bg-slate-100 transition-colors relative">
              {imagePreview ? (
                <div className="text-center space-y-3 w-full">
                  <div className="flex justify-center">
                    <img src={imagePreview} alt="CCCD Preview" className="max-h-36 max-w-full object-contain rounded border shadow-sm" />
                  </div>
                  <button 
                    type="button" 
                    onClick={handleClearImage}
                    className="px-3 py-1 bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-200 cursor-pointer"
                  >
                    Xóa ảnh
                  </button>
                </div>
              ) : (
                <label className="text-center cursor-pointer block w-full h-full py-4">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <span className="text-sm font-medium text-blue-600 hover:text-blue-700">Tải ảnh lên</span>
                  <p className="text-xs text-slate-500 mt-1">Hỗ trợ định dạng PNG, JPG, JPEG</p>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageChange} 
                    className="hidden" 
                  />
                </label>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button 
              type="submit" 
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer"
            >
              {agency ? 'Lưu thay đổi' : 'Thêm đại lý'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AgencyStatementModal({ agency, onClose, users, orders }: { agency: User; onClose: () => void; users: User[]; orders: any[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPayment, setFilterPayment] = useState('ALL');
  const [filterInsurance, setFilterInsurance] = useState('TNDS_OTO');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const INSURANCE_TABS = [
    { id: 'TNDS_OTO', label: 'TNDS Ô tô' },
    { id: 'VCX_OTO', label: 'VCX Ô tô' },
    { id: 'TNDS_XEMAY', label: 'TNDS Xe máy' },
    { id: 'Y_TE', label: 'BH Y tế' },
    { id: 'ETC', label: 'Thẻ ETC' },
    { id: 'KHAC', label: 'Khác' },
  ];

  // Extract unique months for this agency
  const uniqueMonths = useMemo(() => {
    const months = new Set<string>();
    orders.filter(o => o.agency_id === agency.id).forEach(o => {
      if (o.statement_month) {
        months.add(o.statement_month);
      } else if (o.issue_date) {
        const d = new Date(o.issue_date);
        if (!isNaN(d.getTime())) {
          months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
      }
    });
    return Array.from(months).sort().reverse();
  }, [orders, agency.id]);

  // Filter orders for this agency
  const filteredOrders = useMemo(() => {
    let result = orders.filter(o => o.agency_id === agency.id);

    if (filterInsurance !== 'ALL') {
      result = result.filter(o => o.insurance_type === filterInsurance);
    }

    if (filterMonth !== 'ALL') {
      result = result.filter(o => {
        if (o.statement_month) {
          return o.statement_month === filterMonth;
        }
        const d = new Date(o.issue_date);
        const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return monthYear === filterMonth;
      });
    }

    if (filterStatus !== 'ALL') {
      if (filterStatus === 'NEEDS_PROCESSING') {
        result = result.filter(o => {
          if (o.status === 'CANCELLED') return false;
          const oStaff = users.find(u => u.id === o.staff_id);
          const isCTV = oStaff?.role === 'CTV';
          
          const hasMissingStaff = !o.staff_id;
          const hasMissingPhoneOrAgency = !isCTV && !o.customer_phone && !o.agency_id;
          const hasMissingFee = o.tnds_fee === 0 || o.total_fee === 0;
          
          return hasMissingStaff || hasMissingPhoneOrAgency || hasMissingFee;
        });
      } else {
        result = result.filter(o => o.status === filterStatus);
      }
    }

    if (filterPayment !== 'ALL') {
      result = result.filter(o => o.payment_status === filterPayment);
    }

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(o => 
        o.vehicle_owner.toLowerCase().includes(s) || 
        o.license_plate.toLowerCase().includes(s) ||
        (o.serial_number && o.serial_number.toLowerCase().includes(s)) ||
        (o.customer_phone && o.customer_phone.includes(s))
      );
    }

    return result;
  }, [orders, agency.id, filterInsurance, filterMonth, filterStatus, filterPayment, searchTerm, users]);

  // Calculate totals
  const totals = useMemo(() => {
    let totalFee = 0;
    let totalCod = 0;
    let totalShip = 0;
    let totalComm = 0;
    let totalNop = 0;

    filteredOrders.forEach(o => {
      if (o.status === 'CANCELLED') return;
      totalFee += o.total_fee;
      totalCod += o.cod_amount;
      totalShip += o.shipping_fee;

      const baseFee = (o.tnds_fee / 1.1) + o.nn_fee;
      const commRate = o.commission_rate || 0;
      const commAmount = baseFee * (commRate / 100);
      totalComm += commAmount;
      totalNop += (o.total_fee - commAmount + o.shipping_fee - o.cod_amount);
    });

    return { totalFee, totalCod, totalShip, totalComm, totalNop: Math.round(totalNop) };
  }, [filteredOrders]);

  // Reset checked rows on filters change
  React.useEffect(() => {
    setSelectedIds([]);
  }, [searchTerm, filterStatus, filterPayment, filterInsurance, filterMonth]);

  const handleExportExcel = () => {
    const ordersToExport = selectedIds.length > 0 
      ? orders.filter(o => selectedIds.includes(o.id))
      : filteredOrders;

    if (ordersToExport.length === 0) {
      alert('Không có dữ liệu để xuất Excel');
      return;
    }

    const dataToExport = ordersToExport.map((o, index) => {
      const baseFee = o.status === 'CANCELLED' ? 0 : ((o.tnds_fee / 1.1) + o.nn_fee);
      const commRate = o.commission_rate || 0;
      const commAmount = baseFee * (commRate / 100);
      const nopVe = Math.round((o.status === 'CANCELLED' ? 0 : o.total_fee) - commAmount + (o.status === 'CANCELLED' ? 0 : o.shipping_fee) - (o.status === 'CANCELLED' ? 0 : o.cod_amount));

      return {
        'STT': index + 1,
        'Số Seri/GCN': o.serial_number,
        'Chủ xe': o.vehicle_owner,
        'Biển số': o.license_plate,
        'Ngày cấp': o.issue_date,
        'Ngày hiệu lực': o.effective_date,
        'Hãng': o.provider,
        'Phí TNDS': o.tnds_fee,
        'LP NNTX': o.nn_fee,
        'Tổng phí': o.total_fee,
        'SĐT khách': o.customer_phone,
        'COD': o.cod_amount,
        'Vận chuyển': o.shipping_fee,
        'Hoa hồng (%)': commRate,
        'Nộp về': nopVe,
        'Trạng thái': o.status === 'ACTIVE' ? 'Hiệu lực' : 'Đã hủy',
        'Thanh toán': o.payment_status === 'PAID' ? 'Đã thanh toán' : o.payment_status === 'PARTIAL' ? 'Thanh toán 1 phần' : 'Chưa thanh toán',
        'Ghi chú': o.notes || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bảng Kê Đại Lý');

    const dateStr = format(new Date(), 'dd-MM-yyyy');
    XLSX.writeFile(workbook, `Bang_Ke_Dai_Ly_${agency.fullname.replace(/\s+/g, '_')}_${dateStr}.xlsx`);
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-7xl overflow-hidden flex flex-col h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Bảng đối soát chi tiết: {agency.fullname}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Địa chỉ: {agency.address || 'Chưa cập nhật'} | SĐT: {agency.phone || 'Chưa cập nhật'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white px-5 py-4 border-b border-slate-200 flex flex-col gap-3 flex-shrink-0">
          {/* Tabs */}
          <div className="flex overflow-x-auto pb-1 gap-2 hide-scrollbar">
            <button
              onClick={() => setFilterInsurance('ALL')}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterInsurance === 'ALL' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả nghiệp vụ
            </button>
            {INSURANCE_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterInsurance(tab.id)}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterInsurance === tab.id 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filter options */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Tìm kiếm chủ xe, biển số, seri, điện thoại..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-slate-50 text-slate-700"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select 
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-700 font-medium"
              >
                <option value="ALL">Tất cả tháng</option>
                {uniqueMonths.map(m => (
                  <option key={m} value={m}>Tháng {m.split('-')[1]}/{m.split('-')[0]}</option>
                ))}
              </select>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-700 font-medium"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="NEEDS_PROCESSING">Cần xử lý</option>
                <option value="ACTIVE">Đang hiệu lực</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
              <select 
                value={filterPayment}
                onChange={(e) => setFilterPayment(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-700 font-medium"
              >
                <option value="ALL">Tất cả thanh toán</option>
                <option value="UNPAID">Chưa thanh toán</option>
                <option value="PARTIAL">Thanh toán 1 phần</option>
                <option value="PAID">Đã thanh toán</option>
              </select>
            </div>
          </div>
        </div>

        {/* Selected bar */}
        {selectedIds.length > 0 && (
          <div className="bg-blue-50 border-b border-blue-200 px-5 py-2 flex items-center justify-between flex-shrink-0 transition-all duration-200">
            <div className="text-xs text-blue-800 font-semibold">
              Đã chọn <span className="font-bold text-blue-900">{selectedIds.length}</span> đơn bảo hiểm để xuất Excel
            </div>
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1 bg-white border border-slate-300 text-slate-700 rounded text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Bỏ chọn tất cả
            </button>
          </div>
        )}

        {/* Table Content */}
        <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 bg-white">
          <table className="w-full text-left border-collapse text-[10px]">
            <thead className="sticky top-0 z-20 bg-sky-100 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
              <tr className="bg-sky-100 border-b border-slate-300 text-[10px] font-bold text-slate-700">
                <th className="px-2 py-2 text-center font-bold border-r border-slate-300 bg-sky-100 sticky left-0 z-20 w-8">
                  <input 
                    type="checkbox" 
                    checked={filteredOrders.length > 0 && selectedIds.length === filteredOrders.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(filteredOrders.map(o => o.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-2 py-2 text-center border-r border-slate-300">STT</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">GCN</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">TÊN KHÁCH HÀNG</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">BIỂN SỐ</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">NGÀY CẤP</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">NGÀY HIỆU LỰC</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">PHÍ TNDS</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">LP NNTX</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">TỔNG PHÍ</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">TRẠNG THÁI</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">SDT KHÁCH</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">COD</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">VẬN CHUYỂN</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">HOA HỒNG (%)</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">NỘP VỀ</th>
                <th className="px-2 py-2 text-center border-r border-slate-300">GHI CHÚ</th>
                <th className="px-2 py-2 text-center">HÃNG</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={18} className="px-6 py-8 text-center text-slate-500 font-medium">
                    Không tìm thấy đơn bảo hiểm nào
                  </td>
                </tr>
              ) : filteredOrders.map((order, index) => {
                const baseFee = order.status === 'CANCELLED' ? 0 : ((order.tnds_fee / 1.1) + order.nn_fee);
                const commRate = order.commission_rate || 0;
                const commAmount = baseFee * (commRate / 100);
                const totalFeeVal = order.status === 'CANCELLED' ? 0 : order.total_fee;
                const shippingVal = order.status === 'CANCELLED' ? 0 : order.shipping_fee;
                const codVal = order.status === 'CANCELLED' ? 0 : order.cod_amount;
                const nopVe = Math.round(totalFeeVal - commAmount + shippingVal - codVal);

                return (
                  <tr key={order.id} className="hover:bg-slate-50 bg-white transition-colors">
                    <td className="px-2 py-1.5 text-center border-r border-slate-200 w-8">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(order.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(prev => [...prev, order.id]);
                          } else {
                            setSelectedIds(prev => prev.filter(id => id !== order.id));
                          }
                        }}
                        className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center border-r border-slate-200">{index + 1}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 font-medium text-slate-900 text-center font-mono">{order.serial_number || order.id}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 truncate max-w-[100px]" title={order.vehicle_owner}>{order.vehicle_owner}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-center font-semibold text-slate-800">{order.license_plate || '-'}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-center">{format(new Date(order.issue_date), 'dd/MM/yyyy')}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-center">{format(new Date(order.effective_date), 'dd/MM/yyyy')}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-right font-medium">{new Intl.NumberFormat('vi-VN').format(order.status === 'CANCELLED' ? 0 : order.tnds_fee)}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-right font-medium">{new Intl.NumberFormat('vi-VN').format(order.status === 'CANCELLED' ? 0 : order.nn_fee)}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-right font-semibold text-slate-900">{new Intl.NumberFormat('vi-VN').format(order.status === 'CANCELLED' ? 0 : order.total_fee)}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-center">
                      <div className="flex flex-col gap-0.5 items-center">
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                          order.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {order.status === 'ACTIVE' ? 'Hiệu lực' : 'Đã hủy'}
                        </span>
                        {order.status !== 'CANCELLED' && (
                          <span className={`text-[9px] font-semibold mt-0.5 ${order.cod_amount > 0 || order.payment_status === 'PAID' ? 'text-emerald-600' : order.payment_status === 'PARTIAL' ? 'text-amber-600' : 'text-red-500'}`}>
                            {order.cod_amount > 0 || order.payment_status === 'PAID' ? 'Đã TT' : order.payment_status === 'PARTIAL' ? 'TT 1 phần' : 'Chưa TT'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-center text-slate-600">{order.customer_phone || '-'}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-right">{new Intl.NumberFormat('vi-VN').format(order.cod_amount)}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-right">{new Intl.NumberFormat('vi-VN').format(order.shipping_fee)}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-center font-medium">{order.commission_rate !== undefined ? `${order.commission_rate}%` : '0%'}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-right font-semibold text-emerald-700">{new Intl.NumberFormat('vi-VN').format(nopVe)} ₫</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 max-w-[100px] truncate text-slate-500" title={order.notes}>{order.notes || '-'}</td>
                    <td className="px-2 py-1.5 text-center text-slate-600">{order.provider || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Summary / Actions */}
        <div className="bg-white border-t border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
          {/* Stat summary widgets */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1 max-w-4xl text-center">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <p className="text-[10px] text-slate-500 font-semibold uppercase">Tổng phí doanh thu</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{formatCurrency(totals.totalFee)}</p>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <p className="text-[10px] text-slate-500 font-semibold uppercase">Tổng COD</p>
              <p className="text-sm font-bold text-slate-700 mt-0.5">{formatCurrency(totals.totalCod)}</p>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <p className="text-[10px] text-slate-500 font-semibold uppercase">Tổng Vận chuyển</p>
              <p className="text-sm font-bold text-slate-700 mt-0.5">{formatCurrency(totals.totalShip)}</p>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <p className="text-[10px] text-slate-500 font-semibold uppercase">Tổng hoa hồng chi</p>
              <p className="text-sm font-bold text-amber-700 mt-0.5">{formatCurrency(totals.totalComm)}</p>
            </div>
            <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
              <p className="text-[10px] text-emerald-600 font-semibold uppercase">Tổng thực nộp về</p>
              <p className="text-sm font-bold text-emerald-700 mt-0.5">{formatCurrency(totals.totalNop)}</p>
            </div>
          </div>

          <div className="flex gap-2.5 self-end md:self-center">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-4.5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" />
              Xuất Excel bảng kê
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
