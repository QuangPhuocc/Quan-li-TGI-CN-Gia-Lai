import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { User, Role } from '../types';
import { Edit, Trash, Plus, X } from 'lucide-react';

export default function Users() {
  const { user } = useAuth();
  const { users, addUser, updateUser, deleteUser } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  if (user?.role !== 'MASTER') {
    return (
      <div className="p-8 text-center text-slate-500">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  const handleEdit = (u: User) => {
    setEditingUser(u);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa tài khoản này?')) {
      deleteUser(id);
    }
  };

  const handleSave = (userData: Partial<User>) => {
    if (editingUser) {
      updateUser(editingUser.id, userData);
    } else {
      const newUser: User = {
        ...userData,
        id: `U${Date.now()}`,
      } as User;
      addUser(newUser);
    }
    setIsModalOpen(false);
    setEditingUser(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-slate-800">Quản lý Tài Khoản</h1>
        <button 
          onClick={() => { setEditingUser(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Thêm tài khoản
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-500 whitespace-nowrap">
                <th className="px-6 py-4">Họ và tên</th>
                <th className="px-6 py-4">Tên đăng nhập</th>
                <th className="px-6 py-4">Phân quyền</th>
                <th className="px-6 py-4">Số điện thoại</th>
                <th className="px-6 py-4">Quản lý trực tiếp</th>
                <th className="px-6 py-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{u.fullname}</td>
                  <td className="px-6 py-4 text-slate-600">{u.username}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                      u.role === 'MASTER' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                      u.role === 'ACCOUNTANT' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' :
                      u.role === 'STAFF' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                      'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}>
                      {u.role === 'MASTER' ? 'Master' :
                       u.role === 'ACCOUNTANT' ? 'Quản lý' :
                       u.role === 'STAFF' ? 'Nhân viên' :
                       u.role === 'AGENCY' ? 'Đại lý' : u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{u.phone}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {u.parent_id ? users.find(x => x.id === u.parent_id)?.fullname : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleEdit(u)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Sửa">
                        <Edit className="w-4 h-4" />
                      </button>
                      {u.role !== 'MASTER' && (
                        <button onClick={() => handleDelete(u.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Xóa">
                          <Trash className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <UserModal 
          user={editingUser} 
          users={users}
          onClose={() => setIsModalOpen(false)} 
          onSave={handleSave} 
        />
      )}
    </div>
  );
}

function UserModal({ user, users, onClose, onSave }: any) {
  const [formData, setFormData] = useState<Partial<User>>({
    username: user?.username || '',
    fullname: user?.fullname || '',
    phone: user?.phone || '',
    role: user?.role || 'STAFF',
    parent_id: user?.parent_id || '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800">{user ? 'Sửa Tài Khoản' : 'Thêm Tài Khoản Mới'}</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tên đăng nhập <span className="text-red-500">*</span></label>
              <input required type="text" name="username" value={formData.username} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Họ và tên <span className="text-red-500">*</span></label>
              <input required type="text" name="fullname" value={formData.fullname} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phân quyền <span className="text-red-500">*</span></label>
              <select name="role" value={formData.role} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="ACCOUNTANT">Quản lý (Quản lý)</option>
                <option value="STAFF">Nhân viên (Nhân viên)</option>
                <option value="AGENCY">Đại lý (Đại lý)</option>
                <option value="MASTER">Master (MASTER)</option>
              </select>
            </div>
            {formData.role === 'AGENCY' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Người quản lý (Staff/Accountant)</label>
                <select name="parent_id" value={formData.parent_id} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">Không có</option>
                  {users.filter((u: User) => u.role === 'STAFF' || u.role === 'ACCOUNTANT').map((u: User) => (
                    <option key={u.id} value={u.id}>{u.fullname}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
              Hủy bỏ
            </button>
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              {user ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
