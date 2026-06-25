import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Shield } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('master');
  const { user, login } = useAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(username);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-slate-900 p-8 text-center text-white">
          <Shield className="w-12 h-12 mx-auto text-blue-400 mb-4" />
          <h1 className="text-2xl font-bold tracking-wider">INSURE<span className="text-blue-400">PRO</span></h1>
          <p className="text-slate-400 mt-2 text-sm">Hệ thống quản lý phân cấp</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Tên đăng nhập (Mock)</label>
              <select 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="master">MASTER - Ban Giám đốc</option>
                <option value="diemak">QUẢN LÝ - Kiều Diễm</option>
                <option value="nhivty">NHÂN VIÊN - Yến Nhi</option>
                <option value="thuongld">CTV - Duy Thương</option>
                <option value="yenlt">NHÂN VIÊN - Thị Yên</option>
                <option value="linhltt">NHÂN VIÊN - Thuỳ Linh</option>
                <option value="phuoclq">NHÂN VIÊN - Quang Phước</option>
              </select>
              <p className="text-xs text-slate-500 mt-2">
                * Chọn tài khoản để test phân quyền theo role.
              </p>
            </div>
            
            <button 
              type="submit"
              className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Đăng nhập hệ thống
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
