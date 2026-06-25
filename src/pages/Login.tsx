import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { User } from '../types';

export default function Login() {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('master');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const { user, login } = useAuth();

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then((data: User[]) => {
        const filtered = data.filter(u => u.role !== 'AGENCY');
        setUsers(filtered);
        const hasMaster = filtered.some(u => u.username === 'master');
        if (hasMaster) {
          setUsername('master');
        } else if (filtered.length > 0) {
          setUsername(filtered[0].username);
        }
        setLoading(false);
      })
      .catch(e => {
        console.error('Failed to load users:', e);
        setLoading(false);
      });
  }, []);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
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
              <label className="block text-sm font-medium text-slate-700 mb-2">Tài khoản</label>
              {loading ? (
                <div className="text-sm text-slate-500 animate-pulse">Đang tải danh sách tài khoản...</div>
              ) : (
                <select 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.username}>
                      {u.role === 'MASTER' ? 'Master' : u.role === 'ACCOUNTANT' ? 'Quản lý' : u.role === 'CTV' ? 'CTV' : 'Nhân viên'} - {u.fullname}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Mật khẩu</label>
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                required
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <p className="text-xs text-slate-500 mt-2">
                * Mật khẩu mặc định là [Số điện thoại]@ hoặc [Tên đăng nhập]@ nếu không có số điện thoại.
              </p>
            </div>
            
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-400"
            >
              Đăng nhập hệ thống
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
