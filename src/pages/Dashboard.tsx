import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { Wallet, FileText, AlertCircle, TrendingUp, X, Download, ShieldAlert, BadgeAlert, FileCheck, HelpCircle } from 'lucide-react';
import { InsuranceOrder, User } from '../types';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

const INSURANCE_TYPES = [
  { id: 'TNDS_OTO', label: 'TNDS Ô tô' },
  { id: 'VCX_OTO', label: 'VCX Ô tô' },
  { id: 'TNDS_XEMAY', label: 'TNDS Xe máy' }, // capital X for consistency
  { id: 'Y_TE', label: 'BH Y tế' },
  { id: 'ETC', label: 'Thẻ ETC' },
  { id: 'KHAC', label: 'Khác' }
];

const getDoanhThu = (o: InsuranceOrder) => {
  return Math.round((o.tnds_fee / 1.1) + o.nn_fee);
};

export default function Dashboard() {
  const { user } = useAuth();
  const { orders, users } = useData();
  const navigate = useNavigate();
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);
  const [selectedType, setSelectedType] = useState('TNDS_OTO');

  // Active report tab based on role permissions
  const [activeReportTab, setActiveReportTab] = useState(() => {
    if (user?.role === 'MASTER' || user?.role === 'ACCOUNTANT') return 'STAFF';
    if (user?.role === 'STAFF' || user?.role === 'CTV') return 'AGENCY';
    return 'UNPAID';
  });

  // Filter orders according to user roles (realtime data rules)
  const filteredOrders = useMemo(() => {
    if (user?.role === 'MASTER' || user?.role === 'ACCOUNTANT') return orders;
    if (user?.role === 'STAFF' || user?.role === 'CTV') {
      const myAgencies = users.filter(u => u.parent_id === user.id).map(u => u.id);
      return orders.filter(o => o.staff_id === user.id || (o.agency_id && myAgencies.includes(o.agency_id)));
    }
    if (user?.role === 'AGENCY') {
      return orders.filter(o => o.agency_id === user.id);
    }
    return [];
  }, [orders, user, users]);

  const stats = useMemo(() => {
    const totalRev = filteredOrders.filter(o => o.status === 'ACTIVE').reduce((acc, curr) => acc + getDoanhThu(curr), 0);
    const unpaid = filteredOrders.filter(o => (o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL') && o.status === 'ACTIVE').reduce((acc, curr) => acc + curr.total_fee, 0);
    const cancelledCount = filteredOrders.filter(o => o.status === 'CANCELLED').length;
    
    // Real expiring soon calculation (within 30 days)
    const renewalCount = filteredOrders.filter(o => {
      if (o.status !== 'ACTIVE' || !o.expiration_date) return false;
      const diffDays = Math.ceil((new Date(o.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }).length;

    return { totalRev, unpaid, cancelledCount, renewalCount };
  }, [filteredOrders]);

  // Chart by Provider (Hãng)
  const chartData = useMemo(() => {
    const providerMap = new Map<string, number>();
    filteredOrders.forEach(o => {
      if (o.status === 'CANCELLED') return;
      const providerName = o.provider || 'Khác';
      const rev = getDoanhThu(o);
      providerMap.set(providerName, (providerMap.get(providerName) || 0) + rev);
    });

    return Array.from(providerMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  // Master/Accountant: Staff report
  const staffReportData = useMemo(() => {
    const staffs = users.filter(u => u.role === 'STAFF' || u.role === 'ACCOUNTANT' || u.role === 'CTV');
    return staffs.map(staff => {
      const sOrders = orders.filter(o => o.staff_id === staff.id);
      const activeOrders = sOrders.filter(o => o.status === 'ACTIVE');
      const cancelledOrders = sOrders.filter(o => o.status === 'CANCELLED');
      const rev = activeOrders.reduce((sum, o) => sum + o.total_fee, 0);
      const collected = activeOrders.filter(o => o.payment_status === 'PAID').reduce((sum, o) => sum + o.total_fee, 0);
      const unpaid = activeOrders.filter(o => o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL').reduce((sum, o) => sum + o.total_fee, 0);
      
      const sUnpaidList = activeOrders.filter(o => o.payment_status === 'UNPAID');
      
      return { 
        staff, 
        count: activeOrders.length, 
        cancelledCount: cancelledOrders.length, 
        rev, 
        collected, 
        unpaid,
        cancelledList: cancelledOrders,
        unpaidList: sUnpaidList,
        orders: sOrders
      };
    });
  }, [orders, users]);

  // Staff performance summary for the side column
  const staffStats = useMemo(() => {
    if (user?.role !== 'MASTER') return [];
    return staffReportData;
  }, [staffReportData, user]);

  // Agency report
  const agencyReportData = useMemo(() => {
    const agencies = users.filter(u => u.role === 'AGENCY');
    let filteredAgencies = agencies;
    if (user?.role === 'STAFF' || user?.role === 'CTV') {
      filteredAgencies = agencies.filter(a => a.parent_id === user.id);
    }
    return filteredAgencies.map(agency => {
      const aOrders = orders.filter(o => o.agency_id === agency.id);
      const activeOrders = aOrders.filter(o => o.status === 'ACTIVE');
      const cancelledOrders = aOrders.filter(o => o.status === 'CANCELLED');
      const rev = activeOrders.reduce((sum, o) => sum + o.total_fee, 0);
      const collected = activeOrders.filter(o => o.payment_status === 'PAID').reduce((sum, o) => sum + o.total_fee, 0);
      const unpaid = activeOrders.filter(o => o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL').reduce((sum, o) => sum + o.total_fee, 0);
      const parentStaff = users.find(u => u.id === agency.parent_id)?.fullname || 'Không có';
      return { agency, parentStaff, count: activeOrders.length, cancelledCount: cancelledOrders.length, rev, collected, unpaid };
    });
  }, [orders, users, user]);

  // Cancelled cards list
  const cancelledReportData = useMemo(() => {
    return filteredOrders.filter(o => o.status === 'CANCELLED');
  }, [filteredOrders]);

  // Unpaid cards list
  const unpaidReportData = useMemo(() => {
    return filteredOrders.filter(o => o.status === 'ACTIVE' && (o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL'));
  }, [filteredOrders]);

  // Expiring soon cards (within 30 days)
  const expiringReportData = useMemo(() => {
    return filteredOrders.filter(o => {
      if (o.status !== 'ACTIVE' || !o.expiration_date) return false;
      const diffDays = Math.ceil((new Date(o.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }).map(o => {
      const diffDays = Math.ceil((new Date(o.expiration_date!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return { ...o, daysLeft: diffDays };
    }).sort((a, b) => a.daysLeft - b.daysLeft);
  }, [filteredOrders]);

  const staffDashboardData = useMemo(() => {
    if (user?.role !== 'STAFF' && user?.role !== 'CTV') return null;
    const selfOrders = orders.filter(o => o.staff_id === user.id);

    const statsByType = INSURANCE_TYPES.map(type => {
      const typeOrders = selfOrders.filter(o => o.insurance_type === type.id);
      
      const revenue = typeOrders.filter(o => o.status === 'ACTIVE').reduce((acc, curr) => acc + getDoanhThu(curr), 0);
      const unpaid = typeOrders.filter(o => (o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL') && o.status === 'ACTIVE').reduce((acc, curr) => acc + curr.total_fee, 0);
      const cancelledCount = typeOrders.filter(o => o.status === 'CANCELLED').length;
      const successCount = typeOrders.filter(o => o.status === 'ACTIVE' && o.payment_status === 'PAID').length;
      const expiringCount = typeOrders.filter(o => {
        if (o.status !== 'ACTIVE' || !o.expiration_date) return false;
        const diffDays = Math.ceil((new Date(o.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 30;
      }).length;

      // Provider Chart
      const providerMap = new Map<string, number>();
      typeOrders.forEach(o => {
        if (o.status === 'CANCELLED') return;
        const providerName = o.provider || 'Khác';
        const rev = getDoanhThu(o);
        providerMap.set(providerName, (providerMap.get(providerName) || 0) + rev);
      });
      const providerChartData = Array.from(providerMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

      // Ratio Chart
      const unpaidCount = typeOrders.filter(o => (o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL') && o.status === 'ACTIVE').length;
      const ratioChartData = [
        { name: 'Công nợ chưa thu', value: unpaidCount },
        { name: 'Số đơn hủy', value: cancelledCount },
        { name: 'Số đơn thành công', value: successCount }
      ].filter(item => item.value > 0);

      return {
        id: type.id,
        label: type.label,
        revenue,
        unpaid,
        successCount,
        cancelledCount,
        expiringCount,
        providerChartData,
        ratioChartData
      };
    });

    // Total stats for quick overview cards
    const totalRevenue = selfOrders.filter(o => o.status === 'ACTIVE').reduce((acc, curr) => acc + getDoanhThu(curr), 0);
    const totalUnpaid = selfOrders.filter(o => (o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL') && o.status === 'ACTIVE').reduce((acc, curr) => acc + curr.total_fee, 0);
    const totalSuccess = selfOrders.filter(o => o.status === 'ACTIVE' && o.payment_status === 'PAID').length;
    const totalCancelled = selfOrders.filter(o => o.status === 'CANCELLED').length;
    const totalExpiring = selfOrders.filter(o => {
      if (o.status !== 'ACTIVE' || !o.expiration_date) return false;
      const diffDays = Math.ceil((new Date(o.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }).length;

    const totalUnpaidOrdersCount = selfOrders.filter(o => o.status === 'ACTIVE' && (o.payment_status === 'UNPAID' || o.payment_status === 'PARTIAL')).length;
    const totalNeedsProcessing = selfOrders.filter(o => {
      if (o.status === 'CANCELLED') return false;
      const isCTV = user?.role === 'CTV';
      const hasMissingStaff = !o.staff_id;
      const hasMissingPhoneOrAgency = !isCTV && !o.customer_phone && !o.agency_id;
      const hasMissingFee = o.tnds_fee === 0 || o.total_fee === 0;
      return hasMissingStaff || hasMissingPhoneOrAgency || hasMissingFee;
    }).length;

    return {
      statsByType,
      totalRevenue,
      totalUnpaid,
      totalSuccess,
      totalCancelled,
      totalExpiring,
      totalUnpaidOrdersCount,
      totalNeedsProcessing
    };
  }, [orders, user]);

  // Excel Export helper for Reports
  const exportReportToExcel = (tab: string) => {
    let dataToExport: any[] = [];
    let filename = '';

    if (tab === 'STAFF') {
      dataToExport = staffReportData.map((s, idx) => ({
        'STT': idx + 1,
        'Họ và tên': s.staff.fullname,
        'Tên đăng nhập': s.staff.username,
        'Số thẻ hoạt động': s.count,
        'Số thẻ đã hủy': s.cancelledCount,
        'Tổng phí doanh thu (đ)': s.rev,
        'Thực thu (đ)': s.collected,
        'Công nợ chưa thu (đ)': s.unpaid
      }));
      filename = 'Bao_Cao_Doanh_Thu_Nhan_Vien';
    } else if (tab === 'AGENCY') {
      dataToExport = agencyReportData.map((a, idx) => ({
        'STT': idx + 1,
        'Họ và tên': a.agency.fullname,
        'Tên đăng nhập': a.agency.username,
        'Nhân viên phụ trách': a.parentStaff,
        'Số thẻ hoạt động': a.count,
        'Số thẻ đã hủy': a.cancelledCount,
        'Tổng phí doanh thu (đ)': a.rev,
        'Thực thu (đ)': a.collected,
        'Công nợ chưa thu (đ)': a.unpaid
      }));
      filename = 'Bao_Cao_Doanh_Thu_Dai_Ly';
    } else if (tab === 'CANCELLED') {
      dataToExport = cancelledReportData.map((o, idx) => {
        const staffName = users.find(u => u.id === o.staff_id)?.fullname || '';
        return {
          'STT': idx + 1,
          'Số Seri/GCN': o.serial_number,
          'Chủ xe': o.vehicle_owner,
          'Biển số': o.license_plate,
          'Tổng phí (đ)': o.total_fee,
          'Người hủy': o.cancelled_by || '',
          'Ngày hủy': o.cancelled_at || '',
          'Lý do hủy': o.cancel_reason || '',
          'Nhân viên phụ trách': staffName
        };
      });
      filename = 'Danh_Sach_The_Bao_Hiem_Huy';
    } else if (tab === 'UNPAID') {
      dataToExport = unpaidReportData.map((o, idx) => {
        const staffName = users.find(u => u.id === o.staff_id)?.fullname || '';
        const agencyName = users.find(u => u.id === o.agency_id)?.fullname || 'Không có';
        return {
          'STT': idx + 1,
          'Số Seri/GCN': o.serial_number,
          'Chủ xe': o.vehicle_owner,
          'Biển số': o.license_plate,
          'SĐT khách': o.customer_phone,
          'Tổng phí (đ)': o.total_fee,
          'Thanh toán': o.payment_status === 'UNPAID' ? 'Chưa thanh toán' : 'Thanh toán 1 phần',
          'Nhân viên phụ trách': staffName,
          'Đại lý phụ trách': agencyName
        };
      });
      filename = 'Danh_Sach_The_Chua_Thanh_Toan';
    } else if (tab === 'EXPIRING') {
      dataToExport = expiringReportData.map((o, idx) => {
        const staffName = users.find(u => u.id === o.staff_id)?.fullname || '';
        const agencyName = users.find(u => u.id === o.agency_id)?.fullname || 'Không có';
        return {
          'STT': idx + 1,
          'Số Seri/GCN': o.serial_number,
          'Chủ xe': o.vehicle_owner,
          'Biển số': o.license_plate,
          'SĐT khách': o.customer_phone,
          'Ngày hết hạn': o.expiration_date || '',
          'Số ngày còn lại': o.daysLeft,
          'Nhân viên phụ trách': staffName,
          'Đại lý phụ trách': agencyName
        };
      });
      filename = 'Danh_Sach_The_Sap_Het_Han';
    }

    if (dataToExport.length === 0) {
      alert('Không có dữ liệu để xuất Excel');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Báo Cáo');
    const dateStr = format(new Date(), 'dd-MM-yyyy');
    XLSX.writeFile(workbook, `${filename}_${dateStr}.xlsx`);
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  if ((user?.role === 'STAFF' || user?.role === 'CTV') && staffDashboardData) {
    const activeTypeStats = staffDashboardData.statsByType.find(t => t.id === selectedType) || staffDashboardData.statsByType[0];

    return (
      <div className="space-y-6 relative">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Thống kê cá nhân</h1>
            <p className="text-sm text-slate-500 mt-1">Báo cáo hiệu quả kinh doanh của bản thân</p>
          </div>
          <div className="text-xs font-semibold px-2.5 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full">
            Cập nhật realtime
          </div>
        </div>

        {/* Tổng quan Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard title="Tổng doanh thu" value={formatCurrency(staffDashboardData.totalRevenue)} icon={<TrendingUp className="text-blue-600" />} bg="bg-blue-50" />
          <StatCard title="Đơn chưa thanh toán" value={`${staffDashboardData.totalUnpaidOrdersCount} đơn`} icon={<AlertCircle className="text-amber-600" />} bg="bg-amber-50" onClick={() => navigate('/orders?filterPayment=UNPAID')} />
          <StatCard title="Đơn cần xử lý" value={`${staffDashboardData.totalNeedsProcessing} đơn`} icon={<ShieldAlert className="text-red-600" />} bg="bg-red-50" onClick={() => navigate('/orders?filterStatus=NEEDS_PROCESSING')} />
          <StatCard title="Tổng đơn thành công" value={`${staffDashboardData.totalSuccess} đơn`} icon={<FileCheck className="text-emerald-600" />} bg="bg-emerald-50" />
          <StatCard title="Tổng đơn hủy" value={`${staffDashboardData.totalCancelled} đơn`} icon={<X className="text-red-600" />} bg="bg-rose-50" />
          <StatCard title="Tổng đơn sắp hết hạn" value={`${staffDashboardData.totalExpiring} đơn`} icon={<BadgeAlert className="text-amber-600" />} bg="bg-orange-50" />
        </div>

        {/* Bảng phân tích chi tiết theo nghiệp vụ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <h3 className="font-semibold text-slate-800">Thống kê chi tiết theo Nghiệp vụ Bảo hiểm</h3>
            <span className="text-xs text-slate-500 font-medium">* Click chọn từng dòng bên dưới để xem biểu đồ chi tiết tương ứng</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  <th className="px-6 py-3">Loại hình bảo hiểm</th>
                  <th className="px-6 py-3 text-right">Doanh thu (Hãng)</th>
                  <th className="px-6 py-3 text-right">Công nợ chưa thu</th>
                  <th className="px-6 py-3 text-center">Đơn thành công</th>
                  <th className="px-6 py-3 text-center">Đơn hủy</th>
                  <th className="px-6 py-3 text-center">Sắp hết hạn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {staffDashboardData.statsByType.map(t => (
                  <tr 
                    key={t.id} 
                    onClick={() => setSelectedType(t.id)}
                    className={`cursor-pointer transition-all ${
                      selectedType === t.id 
                        ? 'bg-blue-50/80 font-semibold text-blue-900 border-l-4 border-blue-600 shadow-sm' 
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <td className="px-6 py-4 pl-6 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${selectedType === t.id ? 'bg-blue-600' : 'bg-transparent'}`}></span>
                      {t.label}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-blue-600">{formatCurrency(t.revenue)}</td>
                    <td className="px-6 py-4 text-right text-amber-600 font-semibold">{formatCurrency(t.unpaid)}</td>
                    <td className="px-6 py-4 text-center text-emerald-600">{t.successCount}</td>
                    <td className="px-6 py-4 text-center text-red-500">{t.cancelledCount}</td>
                    <td className="px-6 py-4 text-center text-orange-500 font-medium">{t.expiringCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Biểu đồ phân tích chi tiết theo loại hình được chọn */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
            <h3 className="text-lg font-bold text-slate-800">
              Phân tích chi tiết: {activeTypeStats.label}
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Hãng Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
              <h4 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Doanh thu theo Hãng</h4>
              <div className="h-72 w-full flex-1 min-h-[280px]">
                {activeTypeStats.providerChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">Không có dữ liệu doanh thu của hãng nào</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={activeTypeStats.providerChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {activeTypeStats.providerChartData.map((entry, index) => {
                          const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];
                          return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                        })}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Tỉ lệ Status Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
              <h4 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Tỉ lệ Đơn hàng</h4>
              <div className="h-72 w-full flex-1 min-h-[280px]">
                {activeTypeStats.ratioChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">Không có dữ liệu đơn hàng nào</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={activeTypeStats.ratioChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {activeTypeStats.ratioChartData.map((entry, index) => {
                          const colors = ['#f59e0b', '#ef4444', '#10b981']; // unpaid, cancelled, success
                          return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                        })}
                      </Pie>
                      <Tooltip formatter={(value: number) => `${value} đơn`} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Hiệu quả tổng quan</h1>
        <div className="text-sm font-medium text-slate-500">
          Cập nhật realtime
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Tổng thực thu (Hãng)" value={formatCurrency(stats.totalRev)} icon={<Wallet className="text-blue-600" />} bg="bg-blue-50" />
        <StatCard title="Công nợ chưa thu (Phí)" value={formatCurrency(stats.unpaid)} icon={<AlertCircle className="text-amber-600" />} bg="bg-amber-50" />
        <StatCard title="Số đơn hủy" value={stats.cancelledCount} icon={<FileText className="text-red-600" />} bg="bg-red-50" />
        <StatCard title="Đơn sắp hết hạn (<30 ngày)" value={stats.renewalCount} icon={<TrendingUp className="text-emerald-600" />} bg="bg-emerald-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-medium text-slate-800 mb-4">Doanh thu theo Hãng</h2>
          <div className="h-72 w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">Không có dữ liệu hoạt động</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {chartData.map((entry, index) => {
                      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                    })}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Master only: Staff performance */}
        {user?.role === 'MASTER' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden flex flex-col h-full max-h-[400px]">
            <h2 className="text-lg font-medium text-slate-800 mb-4">Hiệu suất Nhân viên</h2>
            <div className="flex-1 overflow-y-auto pr-2 -mr-2">
              <div className="space-y-4">
                {staffStats.map(s => (
                  <div 
                    key={s.staff.id} 
                    onClick={() => setSelectedStaff(s.staff)}
                    className="p-4 rounded-lg bg-slate-50 border border-slate-100 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-slate-800">{s.staff.fullname}</span>
                      <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{s.count} đơn</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Doanh thu phí:</span>
                      <span className="font-medium text-slate-900">{formatCurrency(s.rev)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-slate-500">Công nợ:</span>
                      <span className="font-medium text-amber-600">{formatCurrency(s.unpaid)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trung tâm Báo cáo Hệ thống */}
      {user?.role === 'MASTER' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Trung tâm Báo cáo Hệ thống</h2>
            <p className="text-sm text-slate-500 mt-0.5 font-medium">Báo cáo tổng hợp số liệu tự động theo thời gian thực</p>
          </div>
          <button
            onClick={() => exportReportToExcel(activeReportTab)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" /> Xuất Excel báo cáo này
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex overflow-x-auto pb-2 -mb-2 gap-2 hide-scrollbar border-b border-slate-100 mb-6">
          {(user?.role === 'MASTER' || user?.role === 'ACCOUNTANT') && (
            <button
              onClick={() => setActiveReportTab('STAFF')}
              className={`whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeReportTab === 'STAFF' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              Doanh thu Nhân viên
            </button>
          )}
          {(user?.role === 'MASTER' || user?.role === 'ACCOUNTANT' || user?.role === 'STAFF' || user?.role === 'CTV') && (
            <button
              onClick={() => setActiveReportTab('AGENCY')}
              className={`whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeReportTab === 'AGENCY' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              Doanh thu Đại lý
            </button>
          )}
          <button
            onClick={() => setActiveReportTab('CANCELLED')}
            className={`whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeReportTab === 'CANCELLED' 
                ? 'bg-red-600 text-white shadow-sm' 
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            Thẻ Bảo Hiểm Hủy
          </button>
          <button
            onClick={() => setActiveReportTab('UNPAID')}
            className={`whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeReportTab === 'UNPAID' 
                ? 'bg-amber-600 text-white shadow-sm' 
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            Chưa Thanh Toán
          </button>
          <button
            onClick={() => setActiveReportTab('EXPIRING')}
            className={`whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeReportTab === 'EXPIRING' 
                ? 'bg-emerald-600 text-white shadow-sm' 
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            Thẻ Sắp Hết Hạn
          </button>
        </div>

        {/* Tab Contents */}
        <div className="overflow-x-auto mt-4 rounded-lg border border-slate-200 bg-white">
          {activeReportTab === 'STAFF' && (user?.role === 'MASTER' || user?.role === 'ACCOUNTANT') && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-slate-600 font-semibold whitespace-nowrap">
                  <th className="px-4 py-3">STT</th>
                  <th className="px-4 py-3">Nhân viên</th>
                  <th className="px-4 py-3 text-center">Đơn Hoạt động</th>
                  <th className="px-4 py-3 text-center">Đơn Hủy</th>
                  <th className="px-4 py-3 text-right">Tổng Phí Doanh thu</th>
                  <th className="px-4 py-3 text-right">Thực thu (Đã thanh toán)</th>
                  <th className="px-4 py-3 text-right">Công nợ (Chưa thanh toán)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {staffReportData.map((s, idx) => (
                  <tr key={s.staff.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500 font-medium">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{s.staff.fullname} ({s.staff.username})</td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-600">{s.count}</td>
                    <td className="px-4 py-3 text-center font-medium text-red-500">{s.cancelledCount}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-950">{formatCurrency(s.rev)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatCurrency(s.collected)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-600">{formatCurrency(s.unpaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReportTab === 'AGENCY' && (user?.role === 'MASTER' || user?.role === 'ACCOUNTANT' || user?.role === 'STAFF' || user?.role === 'CTV') && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-slate-600 font-semibold whitespace-nowrap">
                  <th className="px-4 py-3">STT</th>
                  <th className="px-4 py-3">Đại lý</th>
                  <th className="px-4 py-3">Nhân viên quản lý</th>
                  <th className="px-4 py-3 text-center">Đơn Hoạt động</th>
                  <th className="px-4 py-3 text-center">Đơn Hủy</th>
                  <th className="px-4 py-3 text-right">Tổng Phí Doanh thu</th>
                  <th className="px-4 py-3 text-right">Thực thu (Đã thanh toán)</th>
                  <th className="px-4 py-3 text-right">Công nợ (Chưa thanh toán)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {agencyReportData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500 bg-slate-50">Không có dữ liệu đại lý</td>
                  </tr>
                ) : agencyReportData.map((a, idx) => (
                  <tr key={a.agency.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500 font-medium">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{a.agency.fullname} ({a.agency.username})</td>
                    <td className="px-4 py-3 text-slate-600">{a.parentStaff}</td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-600">{a.count}</td>
                    <td className="px-4 py-3 text-center font-medium text-red-500">{a.cancelledCount}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-950">{formatCurrency(a.rev)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatCurrency(a.collected)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-600">{formatCurrency(a.unpaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReportTab === 'CANCELLED' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-slate-600 font-semibold whitespace-nowrap">
                  <th className="px-4 py-3">STT</th>
                  <th className="px-4 py-3">Seri/GCN</th>
                  <th className="px-4 py-3">Chủ xe</th>
                  <th className="px-4 py-3">Biển số</th>
                  <th className="px-4 py-3 text-right">Phí thẻ</th>
                  <th className="px-4 py-3">Người hủy</th>
                  <th className="px-4 py-3">Thời gian hủy</th>
                  <th className="px-4 py-3">Lý do hủy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {cancelledReportData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500 bg-slate-50">Không có thẻ bảo hiểm nào bị hủy</td>
                  </tr>
                ) : cancelledReportData.map((o, idx) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500 font-medium">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-red-700">{o.serial_number}</td>
                    <td className="px-4 py-3 text-slate-800">{o.vehicle_owner}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{o.license_plate}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(o.total_fee)}</td>
                    <td className="px-4 py-3 text-slate-600 font-medium">{o.cancelled_by || 'Hệ thống'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {o.cancelled_at ? format(new Date(o.cancelled_at), 'dd/MM/yyyy HH:mm') : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium max-w-xs truncate" title={o.cancel_reason}>{o.cancel_reason || 'Không rõ lý do'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReportTab === 'UNPAID' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-slate-600 font-semibold whitespace-nowrap">
                  <th className="px-4 py-3">STT</th>
                  <th className="px-4 py-3">Seri/GCN</th>
                  <th className="px-4 py-3">Chủ xe</th>
                  <th className="px-4 py-3">Biển số</th>
                  <th className="px-4 py-3 text-right">Tổng Phí</th>
                  <th className="px-4 py-3">Thanh toán</th>
                  <th className="px-4 py-3">Nhân viên</th>
                  <th className="px-4 py-3">Đại lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {unpaidReportData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500 bg-slate-50">Hoàn thành đối soát! Không có công nợ tồn đọng.</td>
                  </tr>
                ) : unpaidReportData.map((o, idx) => {
                  const staffName = users.find(u => u.id === o.staff_id)?.fullname || '';
                  const agencyName = users.find(u => u.id === o.agency_id)?.fullname || '-';
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{o.serial_number}</td>
                      <td className="px-4 py-3 text-slate-800">{o.vehicle_owner}</td>
                      <td className="px-4 py-3 text-slate-700">{o.license_plate}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-600">{formatCurrency(o.total_fee)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
                          {o.payment_status === 'UNPAID' ? 'Chưa TT' : 'TT 1 phần'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{staffName}</td>
                      <td className="px-4 py-3 text-slate-600">{agencyName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {activeReportTab === 'EXPIRING' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-slate-600 font-semibold whitespace-nowrap">
                  <th className="px-4 py-3">STT</th>
                  <th className="px-4 py-3">Seri/GCN</th>
                  <th className="px-4 py-3">Chủ xe</th>
                  <th className="px-4 py-3">Biển số</th>
                  <th className="px-4 py-3">Điện thoại</th>
                  <th className="px-4 py-3">Ngày hết hạn</th>
                  <th className="px-4 py-3 text-center">Còn lại</th>
                  <th className="px-4 py-3">Hãng</th>
                  <th className="px-4 py-3">Nhân viên</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {expiringReportData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500 bg-slate-50">Không có thẻ bảo hiểm nào sắp hết hạn trong 30 ngày tới.</td>
                  </tr>
                ) : expiringReportData.map((o, idx) => {
                  const staffName = users.find(u => u.id === o.staff_id)?.fullname || '';
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{o.serial_number}</td>
                      <td className="px-4 py-3 text-slate-800">{o.vehicle_owner}</td>
                      <td className="px-4 py-3 text-slate-700">{o.license_plate}</td>
                      <td className="px-4 py-3 text-slate-600">{o.customer_phone}</td>
                      <td className="px-4 py-3 text-red-600 font-medium">
                        {o.expiration_date ? format(new Date(o.expiration_date), 'dd/MM/yyyy') : ''}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-red-600 whitespace-nowrap bg-red-50">
                        {o.daysLeft} ngày
                      </td>
                      <td className="px-4 py-3 text-slate-600">{o.provider}</td>
                      <td className="px-4 py-3 text-slate-600">{staffName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        </div>
      )}

      {/* Staff Detail Modal */}
      {selectedStaff && (
        <StaffDetailModal 
          staff={selectedStaff}
          stats={staffStats.find(s => s.staff.id === selectedStaff.id)!}
          onClose={() => setSelectedStaff(null)} 
        />
      )}
    </div>
  );
}

function StatCard({ title, value, icon, bg, onClick }: { title: string, value: string | number, icon: React.ReactNode, bg: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-start gap-4 transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300 hover:scale-[1.02]' : ''
      }`}
    >
      <div className={`p-3 rounded-lg ${bg}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
      </div>
    </div>
  );
}

function StaffDetailModal({ staff, stats, onClose }: { staff: User, stats: any, onClose: () => void }) {
  const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-white z-10">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Chi tiết nhân viên: {staff.fullname}</h2>
            <p className="text-sm text-slate-500 mt-1">
              Đã thu: <span className="font-medium text-emerald-600 mr-4">{formatCurrency(stats.collected)}</span>
              Chưa thu: <span className="font-medium text-amber-600">{formatCurrency(stats.unpaid)}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50">
          {/* Unpaid List */}
          <div>
            <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Danh sách đơn chưa thanh toán ({stats.unpaidList.length})
            </h3>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <OrderMiniTable orders={stats.unpaidList} />
            </div>
          </div>

          {/* Cancelled List */}
          <div>
            <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              Danh sách thẻ hủy ({stats.cancelledList.length})
            </h3>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <OrderMiniTable orders={stats.cancelledList} />
            </div>
          </div>

          {/* All Orders List */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Toàn bộ đơn bảo hiểm ({stats.orders.length})
            </h3>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <OrderMiniTable orders={stats.orders} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderMiniTable({ orders }: { orders: InsuranceOrder[] }) {
  if (orders.length === 0) {
    return <div className="p-4 text-center text-sm text-slate-500 bg-slate-50">Không có dữ liệu</div>;
  }
  return (
    <table className="w-full text-left border-collapse text-sm">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
          <th className="px-4 py-3">Mã GCN</th>
          <th className="px-4 py-3">Khách hàng</th>
          <th className="px-4 py-3">Hãng</th>
          <th className="px-4 py-3 text-right">Tổng phí</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {orders.map(o => (
          <tr key={o.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-blue-600">{o.serial_number || o.id}</td>
            <td className="px-4 py-3 text-slate-700">{o.vehicle_owner}</td>
            <td className="px-4 py-3 text-slate-600">{o.provider || '-'}</td>
            <td className="px-4 py-3 text-right font-medium text-slate-900">
              {new Intl.NumberFormat('vi-VN').format(o.total_fee)} ₫
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
