import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  Package, 
  Lock, 
  Unlock, 
  AlertCircle, 
  Calendar, 
  User, 
  Trash2, 
  ArrowRight, 
  Search, 
  CheckCircle,
  FileText,
  DollarSign,
  HelpCircle,
  Eye
} from 'lucide-react';
import { ImportBatch, BatchStatus } from '../types';
import { format } from 'date-fns';

export default function Batches() {
  const { batches, users, updateBatch, deleteBatch, refreshStats } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const getImporterName = (userId: string) => {
    return users.find(u => u.id === userId)?.fullname || 'Hệ thống';
  };

  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      const matchesSearch = b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            b.month.includes(searchTerm);
      const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [batches, searchTerm, statusFilter]);

  const handleStatusChange = async (batchId: string, newStatus: BatchStatus) => {
    if (!user) return;
    const ok = await updateBatch(batchId, { 
      status: newStatus,
      user_id: user.id
    } as any);
    if (ok) {
      refreshStats();
    }
  };

  const handleDelete = async (batchId: string) => {
    if (window.confirm('CẢNH BÁO: Xóa bảng kê sẽ XÓA TẤT CẢ thẻ bảo hiểm thuộc bảng kê này. Bạn có chắc chắn muốn xóa?')) {
      const ok = await deleteBatch(batchId);
      if (ok) {
        refreshStats();
      }
    }
  };

  const getStatusBadge = (status: BatchStatus) => {
    switch (status) {
      case 'PROCESSING':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">Đang xử lý</span>;
      case 'COMPLETE':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">Hoàn thành</span>;
      case 'LOCKED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-500/15 text-purple-500 border border-purple-500/30">Đã chốt</span>;
      case 'SENT_TO_INSURER':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/30">Đã gửi CTBH</span>;
      case 'SETTLED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">Đã quyết toán</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Package className="w-8 h-8 text-blue-500" />
            Quản lý Bảng kê & Batch
          </h1>
          <p className="text-slate-400 mt-2">
            Theo dõi vòng đời nhập liệu bảo hiểm, kiểm tra chất lượng hồ sơ (KPI Quality) và khóa bảng kê.
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-slate-900/20 p-4 rounded-xl border border-slate-800/50">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên bảng kê, tháng (YYYY-MM)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 text-white rounded-lg border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 text-sm placeholder-slate-500 transition-all"
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-950 text-white rounded-lg border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 text-sm transition-all"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PROCESSING">Đang xử lý</option>
            <option value="COMPLETE">Hoàn thành</option>
            <option value="LOCKED">Đã chốt</option>
            <option value="SENT_TO_INSURER">Đã gửi CTBH</option>
            <option value="SETTLED">Đã quyết toán</option>
          </select>
        </div>
      </div>

      {/* Grid List */}
      {filteredBatches.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/10 rounded-2xl border border-slate-800/45">
          <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-300">Không tìm thấy bảng kê nào</h3>
          <p className="text-slate-500 mt-1">Vui lòng kiểm tra lại bộ lọc tìm kiếm hoặc import một bảng kê mới.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredBatches.map((batch) => {
            const isLocked = batch.status === 'LOCKED' || batch.status === 'SENT_TO_INSURER' || batch.status === 'SETTLED';
            const quality = batch.quality || {
              missing_staff: 0,
              missing_agency: 0,
              missing_phone: 0,
              missing_cod: 0,
              unpaid: 0,
              incomplete: 0,
              total: 0,
              completion_rate: 100
            };

            return (
              <div 
                key={batch.id} 
                className="bg-slate-900/45 rounded-2xl border border-slate-800/80 p-6 flex flex-col hover:border-slate-700/80 transition-all duration-300 group"
              >
                {/* Batch Top Header */}
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors flex items-center gap-2">
                      {batch.name}
                      {isLocked && <Lock className="w-3.5 h-3.5 text-purple-400" />}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        Tháng: {batch.month}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        Người nhập: {getImporterName(batch.imported_by)}
                      </span>
                    </div>
                  </div>
                  {getStatusBadge(batch.status)}
                </div>

                <div className="h-px bg-slate-800/60 my-4" />

                {/* Quality Indicator Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-400 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
                      Tỷ lệ hoàn thiện chất lượng dữ liệu
                    </span>
                    <span className={`font-bold ${
                      quality.completion_rate >= 90 ? 'text-emerald-400' :
                      quality.completion_rate >= 60 ? 'text-amber-400' : 'text-rose-400'
                    }`}>{quality.completion_rate}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/60">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        quality.completion_rate >= 90 ? 'bg-emerald-500' :
                        quality.completion_rate >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${quality.completion_rate}%` }}
                    />
                  </div>
                </div>

                {/* Interactive Data Quality KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mt-5">
                  <button
                    onClick={() => navigate(`/orders?batch_id=${batch.id}&q_filter=missing_staff`)}
                    className="p-3 bg-slate-950/65 rounded-xl border border-slate-800/80 hover:border-slate-700/60 text-left transition-all relative group/btn"
                    title="Click để xem danh sách hồ sơ"
                  >
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Thiếu Người Cấp</span>
                    <span className={`text-lg font-bold block mt-0.5 ${quality.missing_staff > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {quality.missing_staff}
                    </span>
                    <Eye className="w-3.5 h-3.5 absolute right-3 bottom-3 text-slate-600 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                  </button>

                  <button
                    onClick={() => navigate(`/orders?batch_id=${batch.id}&q_filter=missing_agency`)}
                    className="p-3 bg-slate-950/65 rounded-xl border border-slate-800/80 hover:border-slate-700/60 text-left transition-all relative group/btn"
                    title="Click để xem danh sách hồ sơ"
                  >
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Thiếu Đại Lý</span>
                    <span className={`text-lg font-bold block mt-0.5 ${quality.missing_agency > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {quality.missing_agency}
                    </span>
                    <Eye className="w-3.5 h-3.5 absolute right-3 bottom-3 text-slate-600 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                  </button>

                  <button
                    onClick={() => navigate(`/orders?batch_id=${batch.id}&q_filter=missing_phone`)}
                    className="p-3 bg-slate-950/65 rounded-xl border border-slate-800/80 hover:border-slate-700/60 text-left transition-all relative group/btn"
                    title="Click để xem danh sách hồ sơ"
                  >
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Thiếu SĐT</span>
                    <span className={`text-lg font-bold block mt-0.5 ${quality.missing_phone > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {quality.missing_phone}
                    </span>
                    <Eye className="w-3.5 h-3.5 absolute right-3 bottom-3 text-slate-600 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                  </button>

                  <button
                    onClick={() => navigate(`/orders?batch_id=${batch.id}&q_filter=missing_cod`)}
                    className="p-3 bg-slate-950/65 rounded-xl border border-slate-800/80 hover:border-slate-700/60 text-left transition-all relative group/btn"
                    title="Click để xem danh sách hồ sơ"
                  >
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Thiếu COD</span>
                    <span className={`text-lg font-bold block mt-0.5 ${quality.missing_cod > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {quality.missing_cod}
                    </span>
                    <Eye className="w-3.5 h-3.5 absolute right-3 bottom-3 text-slate-600 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                  </button>

                  <button
                    onClick={() => navigate(`/orders?batch_id=${batch.id}&q_filter=unpaid`)}
                    className="p-3 bg-slate-950/65 rounded-xl border border-slate-800/80 hover:border-slate-700/60 text-left transition-all relative group/btn"
                    title="Click để xem danh sách hồ sơ"
                  >
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Chưa thu tiền</span>
                    <span className={`text-lg font-bold block mt-0.5 ${quality.unpaid > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {quality.unpaid}
                    </span>
                    <Eye className="w-3.5 h-3.5 absolute right-3 bottom-3 text-slate-600 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                  </button>

                  <button
                    onClick={() => navigate(`/orders?batch_id=${batch.id}&q_filter=incomplete`)}
                    className="p-3 bg-slate-950/65 rounded-xl border border-slate-800/80 hover:border-slate-700/60 text-left transition-all relative group/btn"
                    title="Click để xem danh sách hồ sơ"
                  >
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Chưa hoàn thiện</span>
                    <span className={`text-lg font-bold block mt-0.5 ${quality.incomplete > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {quality.incomplete}
                    </span>
                    <Eye className="w-3.5 h-3.5 absolute right-3 bottom-3 text-slate-600 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                  </button>
                </div>

                <div className="h-px bg-slate-800/60 my-4 mt-5" />

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 mt-auto pt-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => navigate(`/orders?batch_id=${batch.id}`)}
                      className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Xem đơn
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* State Transitions */}
                    {batch.status === 'PROCESSING' && (
                      <button
                        onClick={() => handleStatusChange(batch.id, 'COMPLETE')}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1"
                      >
                        Chuyển Complete
                      </button>
                    )}
                    
                    {batch.status === 'COMPLETE' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(batch.id, 'PROCESSING')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors flex items-center gap-1"
                        >
                          Mở lại xử lý
                        </button>
                        <button
                          onClick={() => handleStatusChange(batch.id, 'LOCKED')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors flex items-center gap-1"
                          title="Khóa bảng kê, chặn tất cả hoạt động chỉnh sửa dữ liệu đơn"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Chốt & Khóa
                        </button>
                      </>
                    )}

                    {batch.status === 'LOCKED' && (
                      <>
                        {user.role === 'MASTER' && (
                          <button
                            onClick={() => handleStatusChange(batch.id, 'COMPLETE')}
                            className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 transition-colors flex items-center gap-1"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            Mở khóa
                          </button>
                        )}
                        <button
                          onClick={() => handleStatusChange(batch.id, 'SENT_TO_INSURER')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1"
                        >
                          Gửi hãng BH
                        </button>
                      </>
                    )}

                    {batch.status === 'SENT_TO_INSURER' && (
                      <>
                        {user.role === 'MASTER' && (
                          <button
                            onClick={() => handleStatusChange(batch.id, 'LOCKED')}
                            className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 transition-colors flex items-center gap-1"
                          >
                            Quay lại Khóa
                          </button>
                        )}
                        <button
                          onClick={() => handleStatusChange(batch.id, 'SETTLED')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-600 hover:bg-slate-700 text-white transition-colors flex items-center gap-1"
                        >
                          Quyết toán
                        </button>
                      </>
                    )}

                    {batch.status === 'SETTLED' && user.role === 'MASTER' && (
                      <button
                        onClick={() => handleStatusChange(batch.id, 'SENT_TO_INSURER')}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 transition-colors flex items-center gap-1"
                      >
                        Quay lại Gửi hãng
                      </button>
                    )}

                    {/* Delete only if not locked */}
                    {!isLocked && (
                      <button
                        onClick={() => handleDelete(batch.id)}
                        className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/20 transition-all"
                        title="Xóa vĩnh viễn bảng kê và đơn liên quan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
