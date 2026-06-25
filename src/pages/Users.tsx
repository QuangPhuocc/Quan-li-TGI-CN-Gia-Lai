import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { User, Role } from '../types';
import { Edit, Trash, Plus, X, History, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

export default function Users() {
  const { user } = useAuth();
  const { users, addUser, updateUser, deleteUser } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // Sort states
  const [sortField, setSortField] = useState<'created_at' | 'fullname' | 'role'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<User | null>(null);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);

  const toggleExpandUser = (id: string) => {
    setExpandedUserIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

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
    const cleanUsername = userData.role === 'MASTER' ? (userData.username || 'master') : userData.phone;
    const finalUserData = { ...userData, username: cleanUsername };

    if (finalUserData.role === 'AGENCY') {
      const targetName = finalUserData.fullname?.trim() || "";
      if (!targetName) {
        alert("Tên đại lý không được để trống!");
        return;
      }
      const parentId = finalUserData.parent_id || "";
      const isDup = users.some(u => 
        u.role === 'AGENCY' && 
        u.fullname.trim().toLowerCase() === targetName.toLowerCase() &&
        u.parent_id === parentId &&
        (!editingUser || u.id !== editingUser.id)
      );
      if (isDup) {
        alert(`Đại lý với tên "${targetName}" đã tồn tại dưới quyền quản lý của nhân viên được chọn. Vui lòng chọn một tên khác!`);
        return;
      }
    }

    if (editingUser) {
      const changes: string[] = [];
      const timestamp = new Date().toISOString();
      const formattedTime = format(new Date(timestamp), 'dd/MM/yyyy HH:mm:ss');
      
      if (finalUserData.username !== editingUser.username) changes.push(`Tên đăng nhập: ${editingUser.username} -> ${finalUserData.username}`);
      if (finalUserData.fullname !== editingUser.fullname) changes.push(`Họ tên: ${editingUser.fullname} -> ${finalUserData.fullname}`);
      if (finalUserData.phone !== editingUser.phone) changes.push(`SĐT: ${editingUser.phone || 'Không có'} -> ${finalUserData.phone || 'Không có'}`);
      if (finalUserData.role !== editingUser.role) changes.push(`Quyền: ${editingUser.role} -> ${finalUserData.role}`);
      if (finalUserData.parent_id !== editingUser.parent_id) {
        const oldParent = users.find(u => u.id === editingUser.parent_id)?.fullname || 'Không có';
        const newParent = users.find(u => u.id === finalUserData.parent_id)?.fullname || 'Không có';
        changes.push(`Người quản lý: ${oldParent} -> ${newParent}`);
      }
      if (finalUserData.password && finalUserData.password !== editingUser.password) {
        changes.push(`Cập nhật mật khẩu mới`);
      }

      const newHistory = [
        `${formattedTime} - Cập nhật bởi MASTER: ${changes.length > 0 ? changes.join(', ') : 'Không thay đổi'}`,
        ...(editingUser.edit_history || [])
      ];

      updateUser(editingUser.id, {
        ...finalUserData,
        updated_at: timestamp,
        edit_history: newHistory
      });
    } else {
      const timestamp = new Date().toISOString();
      const defaultPassword = finalUserData.phone ? `${finalUserData.phone}@` : `${finalUserData.username}@`;
      const newUser: User = {
        ...finalUserData,
        id: `U-${Date.now()}`,
        password: finalUserData.password || defaultPassword,
        created_at: timestamp,
        updated_at: timestamp,
        edit_history: [`${format(new Date(timestamp), 'dd/MM/yyyy HH:mm:ss')} - Tạo tài khoản bởi MASTER`]
      } as User;
      addUser(newUser);
    }
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleSort = (field: 'created_at' | 'fullname' | 'role') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedUsers = useMemo(() => {
    const nonAgencyUsers = users.filter(u => u.role !== 'AGENCY');
    return [...nonAgencyUsers].sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'created_at') {
        valA = a.created_at || '';
        valB = b.created_at || '';
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortField === 'fullname') {
        valA = a.fullname || '';
        valB = b.fullname || '';
        return sortOrder === 'asc'
          ? valA.localeCompare(valB, 'vi', { sensitivity: 'base' })
          : valB.localeCompare(valA, 'vi', { sensitivity: 'base' });
      } else if (sortField === 'role') {
        valA = a.role || '';
        valB = b.role || '';
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return 0;
    });
  }, [users, sortField, sortOrder]);

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
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-500 whitespace-nowrap">
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => handleSort('fullname')}>
                  Họ và tên {sortField === 'fullname' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th className="px-6 py-4">Tên đăng nhập</th>
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => handleSort('role')}>
                  Phân quyền {sortField === 'role' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th className="px-6 py-4">Số điện thoại</th>
                <th className="px-6 py-4">Quản lý trực tiếp</th>
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => handleSort('created_at')}>
                  Ngày tạo {sortField === 'created_at' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th className="px-6 py-4 text-center">Nhật ký</th>
                <th className="px-6 py-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedUsers.map(u => {
                const userAgencies = users.filter(x => x.role === 'AGENCY' && x.parent_id === u.id);
                const isExpanded = expandedUserIds.includes(u.id);

                return (
                  <React.Fragment key={u.id}>
                    <tr className="hover:bg-slate-50 transition-colors text-sm">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          {userAgencies.length > 0 && (
                            <button 
                              onClick={() => toggleExpandUser(u.id)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer transition-colors"
                              title={isExpanded ? "Thu gọn danh sách đại lý" : "Xem danh sách đại lý"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          <span className={userAgencies.length > 0 ? "pl-0" : "pl-6"}>{u.fullname}</span>
                          {userAgencies.length > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                              {userAgencies.length} đại lý
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{u.username}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          u.role === 'MASTER' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                          u.role === 'ACCOUNTANT' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' :
                          u.role === 'STAFF' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                          u.role === 'CTV' ? 'bg-teal-100 text-teal-700 border border-teal-200' :
                          'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {u.role === 'MASTER' ? 'Master' :
                           u.role === 'ACCOUNTANT' ? 'Quản lý' :
                           u.role === 'STAFF' ? 'Nhân viên' :
                           u.role === 'CTV' ? 'CTV' :
                           u.role === 'AGENCY' ? 'Đại lý' : u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{u.phone || '-'}</td>
                      <td className="px-6 py-4 text-slate-500 font-medium">
                        {u.parent_id ? users.find(x => x.id === u.parent_id)?.fullname : '-'}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {u.created_at ? format(new Date(u.created_at), 'dd/MM/yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => setSelectedUserForHistory(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                          title="Xem lịch sử chỉnh sửa tài khoản"
                        >
                          <History className="w-3.5 h-3.5 text-slate-500" />
                          Xem lịch sử
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleEdit(u)} className="p-1.5 text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 rounded-lg transition-colors cursor-pointer" title="Sửa">
                            <Edit className="w-4 h-4" />
                          </button>
                          {u.role !== 'MASTER' && (
                            <button onClick={() => handleDelete(u.id)} className="p-1.5 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg transition-colors cursor-pointer" title="Xóa">
                              <Trash className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && userAgencies.length > 0 && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={8} className="px-12 py-3 border-t border-b border-slate-100">
                          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden max-w-4xl">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase">
                                  <th className="px-4 py-2">Tên đại lý</th>
                                  <th className="px-4 py-2">Số điện thoại</th>
                                  <th className="px-4 py-2">Mã Đại lý (Username)</th>
                                  <th className="px-4 py-2">Ngày tạo</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-600">
                                {userAgencies.map(agency => (
                                  <tr key={agency.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 font-medium text-slate-900">{agency.fullname}</td>
                                    <td className="px-4 py-2">{agency.phone || '-'}</td>
                                    <td className="px-4 py-2">{agency.username}</td>
                                    <td className="px-4 py-2">{agency.created_at ? format(new Date(agency.created_at), 'dd/MM/yyyy') : '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
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

      {selectedUserForHistory && (
        <UserHistoryModal 
          user={selectedUserForHistory}
          onClose={() => setSelectedUserForHistory(null)}
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
    password: user?.password || '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'phone' && prev.role !== 'MASTER') {
        updated.username = value;
      }
      if (name === 'role') {
        if (value === 'MASTER') {
          updated.username = user?.username || 'master';
        } else {
          updated.username = prev.phone || '';
        }
      }
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = formData.role === 'MASTER' ? formData.username : formData.phone;
    onSave({ ...formData, username: cleanUsername });
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
              <input 
                required 
                type="text" 
                name="username" 
                value={formData.role === 'MASTER' ? (formData.username || '') : (formData.phone || '')} 
                onChange={handleChange} 
                disabled={formData.role !== 'MASTER'}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-slate-700 disabled:bg-slate-100 disabled:text-slate-500" 
              />
              {formData.role !== 'MASTER' && (
                <span className="text-[10px] text-slate-500 mt-1 block">Tên đăng nhập tự động sử dụng Số điện thoại.</span>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Họ và tên <span className="text-red-500">*</span></label>
              <input required type="text" name="fullname" value={formData.fullname} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-slate-700 text-slate-800" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-slate-700 text-slate-800" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
              <input 
                type="text" 
                name="password" 
                value={formData.password} 
                onChange={handleChange} 
                placeholder={user ? "Nhập mật khẩu mới hoặc để trống" : "Mặc định: [SĐT]@ hoặc [Tên đăng nhập]@"} 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-slate-700 text-slate-800" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phân quyền <span className="text-red-500">*</span></label>
              <select name="role" value={formData.role} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-slate-700">
                <option value="ACCOUNTANT">Quản lý</option>
                <option value="STAFF">Nhân viên</option>
                <option value="CTV">CTV</option>
                <option value="AGENCY">Đại lý</option>
                <option value="MASTER">Master</option>
              </select>
            </div>
            {formData.role === 'AGENCY' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Người quản lý (Nhân viên/Quản lý/CTV)</label>
                <select name="parent_id" value={formData.parent_id} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-slate-700">
                  <option value="">Không có</option>
                  {users.filter((u: User) => u.role === 'STAFF' || u.role === 'ACCOUNTANT' || u.role === 'CTV').map((u: User) => (
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
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm cursor-pointer">
              {user ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserHistoryModal({ user, onClose }: { user: User; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Lịch sử chỉnh sửa tài khoản</h2>
            <p className="text-xs text-slate-500 mt-1">Họ tên: <span className="font-semibold text-slate-700">{user.fullname}</span> | Username: <span className="font-semibold text-slate-700">{user.username}</span></p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          {!user.edit_history || user.edit_history.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs font-medium">Không có nhật ký chỉnh sửa nào cho tài khoản này.</div>
          ) : (
            <div className="relative border-l border-slate-200 ml-2.5 pl-5 space-y-4">
              {user.edit_history.map((log, idx) => {
                const parts = log.split(' - ');
                const time = parts[0];
                const detail = parts.slice(1).join(' - ');
                return (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[25px] top-1.5 w-2.5 h-2.5 rounded-full border border-white bg-blue-500 shadow-sm" />
                    <div className="text-[10px] text-slate-400 mb-0.5">{time}</div>
                    <div className="text-xs text-slate-700 font-medium leading-relaxed">
                      {detail}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-200 flex justify-end bg-slate-50">
          <button onClick={onClose} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm cursor-pointer">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
