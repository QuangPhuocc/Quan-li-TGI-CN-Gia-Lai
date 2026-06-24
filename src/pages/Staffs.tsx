import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { InsuranceType, User } from '../types';
import { FileText, DollarSign, AlertCircle, XCircle, CheckCircle } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const INSURANCE_TABS = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'TNDS_OTO', label: 'TNDS Ô tô' },
  { id: 'VCX_OTO', label: 'VCX Ô tô' },
  { id: 'TNDS_XEMAY', label: 'TNDS Xe máy' },
  { id: 'Y_TE', label: 'BH Y tế' },
  { id: 'ETC', label: 'Thẻ ETC' },
  { id: 'KHAC', label: 'Khác' },
];

export default function Staffs() {
  const { user } = useAuth();
  const { orders, users } = useData();
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [filterInsurance, setFilterInsurance] = useState<InsuranceType | 'ALL'>('ALL');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL');

  if (user?.role !== 'MASTER' && user?.role !== 'ACCOUNTANT') {
    return <Navigate to="/" replace />;
  }

  const uniqueMonths = useMemo(() => {
    const months = new Set(orders.map(o => {
      const d = new Date(o.issue_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }));
    return Array.from(months).sort().reverse();
  }, [orders]);

  const staffs = useMemo(() => {
    return users.filter(u => u.role === 'STAFF' || u.role === 'ACCOUNTANT');
  }, [users]);

  // Lọc orders theo tháng và loại bảo hiểm
  const filteredOrders = useMemo(() => {
    let result = orders;

    if (filterInsurance !== 'ALL') {
      result = result.filter(o => o.insurance_type === filterInsurance);
    }

    if (filterMonth !== 'ALL') {
      result = result.filter(o => {
        const d = new Date(o.issue_date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === filterMonth;
      });
    }

    if (selectedStaffId !== 'ALL') {
      result = result.filter(o => o.staff_id === selectedStaffId);
    }

    return result;
  }, [orders, filterInsurance, filterMonth, selectedStaffId]);

  // Tính toán thống kê
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalCollected = 0;
    let totalUncollected = 0;
    
    let totalOrders = 0;
    let paidOrders = 0;
    let unpaidOrders = 0;
    let cancelledOrders = 0;
    let needsProcessingOrders = 0;

    filteredOrders.forEach(o => {
      totalOrders++;
      
      if (o.status === 'CANCELLED') {
        cancelledOrders++;
      } else {
        totalRevenue += o.total_fee;
        
        if (o.payment_status === 'PAID') {
          totalCollected += o.total_fee;
          paidOrders++;
        } else {
          totalUncollected += o.total_fee;
          if (o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL') {
            unpaidOrders++;
          }
        }
        
        // Cần xử lý
        if (!o.agency_id || !o.customer_phone || !o.cod_amount) {
          needsProcessingOrders++;
        }
      }
    });

    return {
      totalRevenue,
      totalCollected,
      totalUncollected,
      totalOrders,
      paidOrders,
      unpaidOrders,
      cancelledOrders,
      needsProcessingOrders
    };
  }, [filteredOrders]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-semibold text-slate-800">Thống kê Nhân viên</h1>
        
        <div className="flex flex-wrap gap-4">
          <select 
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="ALL">Tất cả nhân viên</option>
            {staffs.map(s => (
              <option key={s.id} value={s.id}>{s.fullname} - {s.username}</option>
            ))}
          </select>
          <select 
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="ALL">Tất cả thời gian</option>
            {uniqueMonths.map(m => (
              <option key={m} value={m}>Tháng {m.split('-')[1]}/{m.split('-')[0]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Horizontal Nav */}
      <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 overflow-x-auto hide-scrollbar">
        <div className="flex gap-2 min-w-max px-2">
          {INSURANCE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterInsurance(tab.id as any)}
              className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterInsurance === tab.id 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-transparent text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Tổng doanh thu</p>
            <h3 className="text-xl font-bold text-slate-900">{new Intl.NumberFormat('vi-VN').format(stats.totalRevenue)} ₫</h3>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Đã thu</p>
            <h3 className="text-xl font-bold text-slate-900">{new Intl.NumberFormat('vi-VN').format(stats.totalCollected)} ₫</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Chưa thu</p>
            <h3 className="text-xl font-bold text-slate-900">{new Intl.NumberFormat('vi-VN').format(stats.totalUncollected)} ₫</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Tổng đơn</p>
            <h3 className="text-xl font-bold text-slate-900">{stats.totalOrders}</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
          <div>
            <p className="text-sm font-medium text-slate-500">Đã thanh toán</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{stats.paidOrders} đơn</p>
          </div>
          <CheckCircle className="w-8 h-8 text-emerald-200" />
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
          <div>
            <p className="text-sm font-medium text-slate-500">Chưa thanh toán</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{stats.unpaidOrders} đơn</p>
          </div>
          <AlertCircle className="w-8 h-8 text-amber-200" />
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
          <div>
            <p className="text-sm font-medium text-slate-500">Đã hủy</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{stats.cancelledOrders} đơn</p>
          </div>
          <XCircle className="w-8 h-8 text-red-200" />
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
          <div>
            <p className="text-sm font-medium text-slate-500">Cần xử lý</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{stats.needsProcessingOrders} đơn</p>
          </div>
          <AlertCircle className="w-8 h-8 text-orange-200" />
        </div>
      </div>

      {/* Table Detail */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-800">Chi tiết theo nhân viên</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-sky-50 border-b border-slate-200 text-xs font-medium text-slate-600 uppercase tracking-wider whitespace-nowrap">
                <th className="px-4 py-3">Nhân viên</th>
                <th className="px-4 py-3 text-right">Doanh thu</th>
                <th className="px-4 py-3 text-right">Đã thu</th>
                <th className="px-4 py-3 text-right">Chưa thu</th>
                <th className="px-4 py-3 text-center">Tổng đơn</th>
                <th className="px-4 py-3 text-center">Đã TT</th>
                <th className="px-4 py-3 text-center">Chưa TT</th>
                <th className="px-4 py-3 text-center">Đã hủy</th>
                <th className="px-4 py-3 text-center">Cần xử lý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffs.map(staff => {
                // filter orders specifically for this staff in the current view
                const staffOrders = filteredOrders.filter(o => o.staff_id === staff.id);
                if (selectedStaffId !== 'ALL' && selectedStaffId !== staff.id) return null;
                
                let sRev = 0, sCol = 0, sUncol = 0, sTot = 0, sPaid = 0, sUnpaid = 0, sCanc = 0, sNeeds = 0;
                
                staffOrders.forEach(o => {
                  sTot++;
                  if (o.status === 'CANCELLED') {
                    sCanc++;
                  } else {
                    sRev += o.total_fee;
                    if (o.payment_status === 'PAID') {
                      sCol += o.total_fee;
                      sPaid++;
                    } else {
                      sUncol += o.total_fee;
                      if (o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL') sUnpaid++;
                    }
                    if (!o.agency_id || !o.customer_phone || !o.cod_amount) {
                      sNeeds++;
                    }
                  }
                });

                if (sTot === 0 && selectedStaffId === 'ALL') return null; // hide if 0 orders

                return (
                  <tr key={staff.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{staff.fullname}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-600">{new Intl.NumberFormat('vi-VN').format(sRev)} ₫</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{new Intl.NumberFormat('vi-VN').format(sCol)} ₫</td>
                    <td className="px-4 py-3 text-right text-amber-600">{new Intl.NumberFormat('vi-VN').format(sUncol)} ₫</td>
                    <td className="px-4 py-3 text-center font-medium">{sTot}</td>
                    <td className="px-4 py-3 text-center text-emerald-600">{sPaid}</td>
                    <td className="px-4 py-3 text-center text-amber-600">{sUnpaid}</td>
                    <td className="px-4 py-3 text-center text-red-600">{sCanc}</td>
                    <td className="px-4 py-3 text-center text-orange-600">{sNeeds}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
