import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Bell, Menu } from 'lucide-react';

export default function Header({ toggleSidebar }: { toggleSidebar?: () => void }) {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 bg-white border-b flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        {toggleSidebar && (
          <button onClick={toggleSidebar} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full md:hidden">
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-lg font-medium text-slate-800">Bảng đổi soát thống kê</h2>
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        <div className="h-8 w-px bg-slate-200 mx-2"></div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium text-slate-700">{user?.fullname}</p>
            <p className="text-xs text-slate-500">
              {user?.role === 'MASTER' ? 'Master' :
               user?.role === 'ACCOUNTANT' ? 'Quản lý' :
               user?.role === 'STAFF' ? 'Nhân viên' :
               user?.role === 'CTV' ? 'CTV' :
               user?.role === 'AGENCY' ? 'Đại lý' : (user?.role || '')}
            </p>
          </div>
          <button 
            onClick={logout}
            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
            title="Đăng xuất"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
