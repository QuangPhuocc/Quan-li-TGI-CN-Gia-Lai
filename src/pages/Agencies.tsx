import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { User } from '../types';
import { Edit, Trash, Plus, X, Upload, Eye, Image as ImageIcon, Search } from 'lucide-react';

export default function Agencies() {
  const { user } = useAuth();
  const { users, addUser, updateUser, deleteUser } = useData();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<User | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Access control
  if (!user || (user.role !== 'MASTER' && user.role !== 'ACCOUNTANT' && user.role !== 'STAFF')) {
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

  const handleSave = (agencyData: Partial<User>) => {
    if (editingAgency) {
      updateUser(editingAgency.id, agencyData);
    } else {
      const newAgency: User = {
        ...agencyData,
        id: `AG-${Date.now()}`,
        role: 'AGENCY',
        parent_id: user.id, // Assigned to current user
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
                <th className="px-6 py-4">Tên đăng nhập</th>
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
                  <td colSpan={user.role === 'MASTER' ? 7 : 6} className="px-6 py-8 text-center text-slate-500">
                    Không tìm thấy đại lý nào.
                  </td>
                </tr>
              ) : myAgencies.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">{a.fullname}</td>
                  <td className="px-6 py-4 text-slate-600 font-mono">{a.username}</td>
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
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Tên đăng nhập <span className="text-red-500">*</span></label>
            <input 
              required 
              type="text" 
              name="username" 
              value={formData.username} 
              onChange={handleChange} 
              placeholder="VD: dailyhuong"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" 
            />
          </div>
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
