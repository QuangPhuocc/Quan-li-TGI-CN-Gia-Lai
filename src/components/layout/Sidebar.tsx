import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BarChart3, FileText, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (val: boolean) => void }) {
  const { user } = useAuth();

  return (
    <div className={cn("bg-slate-900 text-white min-h-screen p-4 flex flex-col transition-all duration-300 relative", isOpen ? "w-64" : "w-20")}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -right-3 top-6 bg-slate-800 text-slate-300 p-1.5 rounded-full border border-slate-700 hover:text-white z-20"
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      <div className="mb-8 px-2 flex flex-col items-center justify-center">
        <h1 className={cn("font-bold tracking-wider text-blue-400 text-center transition-all", isOpen ? "text-xl" : "text-sm")}>
          {isOpen ? <>TGI <span className="text-white">CN Gia Lai</span></> : 'TGI'}
        </h1>
        {isOpen && <p className="text-xs text-slate-400 mt-1 text-center">Quản lý doanh thu</p>}
      </div>

      <nav className="flex-1 space-y-1">
        <NavLink
          to="/"
          className={({ isActive }) =>
            cn(
              "flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors",
              isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white",
              isOpen ? "justify-start gap-3" : "justify-center"
            )
          }
          title="Thống kê"
        >
          <BarChart3 className="w-5 h-5 flex-shrink-0" />
          {isOpen && <span>Thống kê</span>}
        </NavLink>
        <NavLink
          to="/orders"
          className={({ isActive }) =>
            cn(
              "flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors",
              isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white",
              isOpen ? "justify-start gap-3" : "justify-center"
            )
          }
          title="Đơn Bảo Hiểm"
        >
          <FileText className="w-5 h-5 flex-shrink-0" />
          {isOpen && <span>Đơn Bảo Hiểm</span>}
        </NavLink>
        {(user?.role === 'MASTER' || user?.role === 'ACCOUNTANT') && (
          <NavLink
            to="/staffs"
            className={({ isActive }) =>
              cn(
                "flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white",
                isOpen ? "justify-start gap-3" : "justify-center"
              )
            }
            title="Nhân viên"
          >
            <Users className="w-5 h-5 flex-shrink-0" />
            {isOpen && <span>Nhân viên</span>}
          </NavLink>
        )}
        {user?.role === 'MASTER' && (
          <NavLink
            to="/users"
            className={({ isActive }) =>
              cn(
                "flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white",
                isOpen ? "justify-start gap-3" : "justify-center"
              )
            }
            title="Tài Khoản"
          >
            <Users className="w-5 h-5 flex-shrink-0" />
            {isOpen && <span>Tài Khoản</span>}
          </NavLink>
        )}
      </nav>

      <div className="mt-auto pt-4 border-t border-slate-800 overflow-hidden">
        <div className={cn("px-2", isOpen ? "text-left" : "text-center")}>
          <p className="text-sm font-medium truncate" title={user?.fullname}>{isOpen ? user?.fullname : user?.fullname.charAt(0)}</p>
          {isOpen && <p className="text-xs font-semibold text-blue-400 mt-1">{user?.role}</p>}
        </div>
      </div>
    </div>
  );
}
