import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { 
  Percent, 
  Award, 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Save, 
  Settings as SettingsIcon, 
  Search, 
  ArrowRight,
  Sparkles,
  GitMerge,
  EyeOff,
  Eye,
  Lock,
  Unlock,
  AlertTriangle
} from 'lucide-react';
import { CommissionConfig, BonusConfig, Provider, User } from '../types';

export default function Settings() {
  const { user } = useAuth();
  const { 
    users, 
    providers, 
    commissionConfigs, 
    bonusConfigs, 
    addCommissionConfig,
    deleteCommissionConfig,
    addBonusConfig,
    deleteBonusConfig,
    updateProvider,
    mergeProviders,
    addProvider
  } = useData();

  const [activeTab, setActiveTab] = useState<'commission' | 'bonus' | 'providers'>('commission');

  // CTV selection for configs
  const ctvs = users.filter(u => u.role === 'CTV');
  const employees = users.filter(u => u.role === 'STAFF' || u.role === 'ACCOUNTANT');

  // ═══════════════════════════════════════════════════════════
  // Tab 1: Commission Configurations
  // ═══════════════════════════════════════════════════════════
  const [newComm, setNewComm] = useState({
    ctv_id: '',
    provider_id: '*',
    rate: 0,
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: ''
  });

  const handleAddComm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComm.ctv_id) {
      alert('Vui lòng chọn CTV');
      return;
    }
    const ok = await addCommissionConfig({
      ctv_id: newComm.ctv_id,
      provider_id: newComm.provider_id,
      rate: Number(newComm.rate),
      effective_from: newComm.effective_from,
      effective_to: newComm.effective_to ? newComm.effective_to : undefined,
      created_by: user?.fullname || '1'
    });
    if (ok) {
      setNewComm({
        ctv_id: '',
        provider_id: '*',
        rate: 0,
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: ''
      });
    }
  };

  const getCTVName = (id: string) => {
    return users.find(u => u.id === id)?.fullname || 'CTV đã xóa';
  };

  // ═══════════════════════════════════════════════════════════
  // Tab 2: Bonus Configs
  // ═══════════════════════════════════════════════════════════
  const [newBonus, setNewBonus] = useState({
    name: '',
    period_type: 'MONTHLY' as 'MONTHLY' | 'QUARTERLY',
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: ''
  });
  const [bonusTiers, setBonusTiers] = useState<{ min_revenue: number; bonus_amount: number }[]>([
    { min_revenue: 50000000, bonus_amount: 500000 },
    { min_revenue: 100000000, bonus_amount: 1000000 }
  ]);

  const handleAddBonusTier = () => {
    setBonusTiers([...bonusTiers, { min_revenue: 0, bonus_amount: 0 }]);
  };

  const handleRemoveBonusTier = (index: number) => {
    setBonusTiers(bonusTiers.filter((_, i) => i !== index));
  };

  const handleTierChange = (index: number, field: 'min_revenue' | 'bonus_amount', value: number) => {
    const updated = [...bonusTiers];
    updated[index][field] = value;
    setBonusTiers(updated);
  };

  const handleAddBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBonus.name.trim()) {
      alert('Vui lòng nhập tên chương trình');
      return;
    }
    const cleanTiers = bonusTiers
      .filter(t => t.min_revenue > 0)
      .sort((a, b) => a.min_revenue - b.min_revenue);

    const ok = await addBonusConfig({
      name: newBonus.name.trim(),
      period_type: newBonus.period_type,
      effective_from: newBonus.effective_from,
      effective_to: newBonus.effective_to ? newBonus.effective_to : undefined,
      thresholds: cleanTiers,
      applies_to_roles: ['STAFF', 'ACCOUNTANT'],
      created_by: user?.fullname || '1'
    });

    if (ok) {
      setNewBonus({
        name: '',
        period_type: 'MONTHLY',
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: ''
      });
      setBonusTiers([{ min_revenue: 50000000, bonus_amount: 500000 }]);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // Tab 3: Providers Management
  // ═══════════════════════════════════════════════════════════
  const [providerEdits, setProviderEdits] = useState<Record<string, { display_name: string }>>({});
  const [newProvName, setNewProvName] = useState('');
  const [mergeState, setMergeState] = useState({ sourceId: '', targetId: '' });

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProvName.trim()) return;
    const ok = await addProvider(newProvName.trim());
    if (ok) {
      setNewProvName('');
    }
  };

  const handleSaveProvider = async (id: string, name: string) => {
    const edit = providerEdits[id];
    if (!edit) return;
    await updateProvider(id, { display_name: edit.display_name.trim() || undefined });
    // Clear edit state
    const copy = { ...providerEdits };
    delete copy[id];
    setProviderEdits(copy);
  };

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    const { sourceId, targetId } = mergeState;
    if (!sourceId || !targetId) {
      alert('Vui lòng chọn đầy đủ hãng nguồn và hãng đích');
      return;
    }
    if (sourceId === targetId) {
      alert('Không thể gộp một hãng vào chính nó');
      return;
    }

    const source = providers.find(p => p.id === sourceId);
    const target = providers.find(p => p.id === targetId);
    const sourceName = source?.display_name || source?.name;
    const targetName = target?.display_name || target?.name;

    if (window.confirm(`XÁC NHẬN GỘP HÃNG: Tất cả đơn bảo hiểm thuộc hãng "${sourceName}" sẽ chuyển sang hãng "${targetName}". Hành động này sẽ tính toán lại hoa hồng & nộp về cho toàn bộ đơn liên quan. Bạn có đồng ý?`)) {
      const ok = await mergeProviders(sourceId, targetId);
      if (ok) {
        setMergeState({ sourceId: '', targetId: '' });
      }
    }
  };

  if (user?.role !== 'MASTER') {
    return (
      <div className="p-8 text-center text-rose-400 font-bold max-w-md mx-auto bg-rose-500/10 border border-rose-500/20 rounded-xl mt-12">
        Quyền truy cập bị từ chối. Chỉ tài khoản Master mới có quyền truy cập cấu hình hệ thống.
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md">
        <div className="p-3 bg-blue-600/10 rounded-xl border border-blue-500/20 text-blue-500">
          <SettingsIcon className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            Cấu hình Hệ thống
          </h1>
          <p className="text-slate-400 mt-1">Quản lý tỷ lệ hoa hồng CTV, mốc thưởng doanh số nhân viên và danh sách hãng bảo hiểm.</p>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-800 gap-1.5 p-1 bg-slate-950/65 rounded-xl border border-slate-900 w-fit">
        <button
          onClick={() => setActiveTab('commission')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'commission' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
          }`}
        >
          <Percent className="w-4 h-4" />
          Hoa hồng CTV
        </button>
        <button
          onClick={() => setActiveTab('bonus')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'bonus' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
          }`}
        >
          <Award className="w-4 h-4" />
          Thưởng Doanh Số
        </button>
        <button
          onClick={() => setActiveTab('providers')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'providers' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Quản lý Hãng BH
        </button>
      </div>

      {/* Tabs Content */}
      <div className="bg-slate-900/25 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm">
        
        {/* Tab 1: Commission */}
        {activeTab === 'commission' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Form Column */}
            <div className="bg-slate-950/60 p-6 rounded-xl border border-slate-800/80 h-fit space-y-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                Thiết lập tỷ lệ hoa hồng mới
              </h3>
              <form onSubmit={handleAddComm} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1.5">Chọn CTV</label>
                  <select
                    value={newComm.ctv_id}
                    onChange={(e) => setNewComm({ ...newComm, ctv_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Chọn CTV --</option>
                    {ctvs.map(c => (
                      <option key={c.id} value={c.id}>{c.fullname} ({c.phone})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1.5">Hãng bảo hiểm</label>
                  <select
                    value={newComm.provider_id}
                    onChange={(e) => setNewComm({ ...newComm, provider_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="*">Tất cả các Hãng (*)</option>
                    {providers.map(p => (
                      <option key={p.id} value={p.name}>{p.display_name || p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1.5">Tỷ lệ hoa hồng (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="Nhập số % hoa hồng"
                    value={newComm.rate || ''}
                    onChange={(e) => setNewComm({ ...newComm, rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">Hiệu lực từ</label>
                    <input
                      type="date"
                      value={newComm.effective_from}
                      onChange={(e) => setNewComm({ ...newComm, effective_from: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">Hiệu lực đến (Không bắt buộc)</label>
                    <input
                      type="date"
                      value={newComm.effective_to}
                      onChange={(e) => setNewComm({ ...newComm, effective_to: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 mt-4 shadow-lg shadow-blue-500/10"
                >
                  <Plus className="w-4 h-4" />
                  Thêm Cấu hình
                </button>
              </form>
            </div>

            {/* List Column */}
            <div className="xl:col-span-2 space-y-4">
              <h3 className="text-lg font-bold text-white">Danh sách cấu hình hiện hành</h3>
              {commissionConfigs.length === 0 ? (
                <div className="text-center py-12 bg-slate-950/20 border border-slate-800 rounded-xl text-slate-500">
                  Chưa có cấu hình hoa hồng nào. Tất cả CTV sẽ có hoa hồng mặc định là 0%.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950/30">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/65 text-slate-400 font-semibold">
                        <th className="p-4">CTV</th>
                        <th className="p-4">Hãng</th>
                        <th className="p-4 text-center">Tỷ lệ</th>
                        <th className="p-4">Thời gian hiệu lực</th>
                        <th className="p-4 text-center">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                      {commissionConfigs.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="p-4 font-semibold text-white">{getCTVName(c.ctv_id)}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${c.provider_id === '*' ? 'bg-amber-500/15 text-amber-500 border border-amber-500/20' : 'bg-slate-800 text-slate-300'}`}>
                              {c.provider_id}
                            </span>
                          </td>
                          <td className="p-4 text-center font-bold text-emerald-400">{c.rate}%</td>
                          <td className="p-4 text-xs text-slate-400">
                            {c.effective_from} ➔ {c.effective_to || 'Vô thời hạn'}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={async () => {
                                if (window.confirm('Xóa cấu hình này?')) {
                                  await deleteCommissionConfig(c.id);
                                }
                              }}
                              className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded border border-transparent hover:border-rose-500/20 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Bonus Config */}
        {activeTab === 'bonus' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Form Column */}
            <div className="bg-slate-950/60 p-6 rounded-xl border border-slate-800/80 h-fit space-y-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-500" />
                Thêm Chương trình Thưởng
              </h3>
              <form onSubmit={handleAddBonus} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1.5">Tên chương trình thưởng</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Thưởng doanh số T6/2026"
                    value={newBonus.name}
                    onChange={(e) => setNewBonus({ ...newBonus, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">Hiệu lực từ</label>
                    <input
                      type="date"
                      value={newBonus.effective_from}
                      onChange={(e) => setNewBonus({ ...newBonus, effective_from: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">Hiệu lực đến</label>
                    <input
                      type="date"
                      value={newBonus.effective_to}
                      onChange={(e) => setNewBonus({ ...newBonus, effective_to: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Milestones / Tiers section */}
                <div className="space-y-3 pt-3 border-t border-slate-800/80">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-400">Cấu hình mốc thưởng</label>
                    <button
                      type="button"
                      onClick={handleAddBonusTier}
                      className="text-xs text-blue-400 hover:text-white flex items-center gap-1 font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm mốc
                    </button>
                  </div>

                  {bonusTiers.map((tier, i) => (
                    <div key={i} className="flex gap-2 items-center bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/40">
                      <div className="flex-1">
                        <input
                          type="number"
                          placeholder="Mốc doanh thu (VNĐ)"
                          value={tier.min_revenue || ''}
                          onChange={(e) => handleTierChange(i, 'min_revenue', Number(e.target.value))}
                          className="w-full px-2 py-1 bg-slate-950 text-white border border-slate-800 rounded text-xs focus:outline-none"
                        />
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                      <div className="flex-1">
                        <input
                          type="number"
                          placeholder="Tiền thưởng (VNĐ)"
                          value={tier.bonus_amount || ''}
                          onChange={(e) => handleTierChange(i, 'bonus_amount', Number(e.target.value))}
                          className="w-full px-2 py-1 bg-slate-950 text-white border border-slate-800 rounded text-xs focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveBonusTier(i)}
                        className="text-slate-500 hover:text-rose-500 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 mt-4 shadow-lg shadow-blue-500/10"
                >
                  <Save className="w-4 h-4" />
                  Kích hoạt cấu hình thưởng
                </button>
              </form>
            </div>

            {/* List Column */}
            <div className="xl:col-span-2 space-y-4">
              <h3 className="text-lg font-bold text-white">Chương trình thưởng đã kích hoạt</h3>
              {bonusConfigs.length === 0 ? (
                <div className="text-center py-12 bg-slate-950/20 border border-slate-800 rounded-xl text-slate-500">
                  Chưa thiết lập chương trình thưởng nhân viên nào.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {bonusConfigs.map((b) => (
                    <div key={b.id} className="bg-slate-950/40 p-5 rounded-xl border border-slate-800/80 space-y-4">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h4 className="font-bold text-white text-base">{b.name}</h4>
                          <p className="text-xs text-slate-400 mt-1">
                            Hiệu lực từ: {b.effective_from} ➔ {b.effective_to || 'Vô thời hạn'}
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            if (window.confirm('Xóa cấu hình thưởng này?')) {
                              await deleteBonusConfig(b.id);
                            }
                          }}
                          className="px-2.5 py-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg text-xs font-semibold border border-transparent hover:border-rose-500/25 transition-all flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Xóa
                        </button>
                      </div>

                      {/* Threshold Tiers Display */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {b.thresholds.map((tier, idx) => (
                          <div key={idx} className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/40 flex justify-between items-center text-xs">
                            <div>
                              <span className="text-slate-500 block uppercase tracking-wider text-[9px] font-bold">Mức đạt</span>
                              <span className="font-bold text-white mt-0.5 block">{tier.min_revenue.toLocaleString('vi-VN')} VNĐ</span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-500 block uppercase tracking-wider text-[9px] font-bold">Tiền thưởng</span>
                              <span className="font-bold text-emerald-400 mt-0.5 block">+{tier.bonus_amount.toLocaleString('vi-VN')} VNĐ</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Providers Management */}
        {activeTab === 'providers' && (
          <div className="space-y-8">
            {/* Top row: manual provider add and merge */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Add provider */}
              <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-4.5 h-4.5 text-blue-500" />
                  Khai báo hãng bảo hiểm mới
                </h3>
                <form onSubmit={handleAddProvider} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nhập tên Hãng bảo hiểm viết hoa..."
                    value={newProvName}
                    onChange={(e) => setNewProvName(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-blue-500 placeholder-slate-600"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Thêm
                  </button>
                </form>
              </div>

              {/* Merge providers */}
              <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <GitMerge className="w-4.5 h-4.5 text-purple-400" />
                  Gộp hãng bảo hiểm (Dọn dẹp DB)
                </h3>
                <form onSubmit={handleMerge} className="flex flex-col sm:flex-row gap-3 items-center">
                  <div className="w-full">
                    <select
                      value={mergeState.sourceId}
                      onChange={(e) => setMergeState({ ...mergeState, sourceId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Chọn Hãng nguồn cần gộp --</option>
                      {providers.map(p => (
                        <option key={p.id} value={p.id}>{p.display_name || p.name}</option>
                      ))}
                    </select>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 flex-shrink-0 rotate-90 sm:rotate-0" />
                  <div className="w-full">
                    <select
                      value={mergeState.targetId}
                      onChange={(e) => setMergeState({ ...mergeState, targetId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 text-white border border-slate-800 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Chọn Hãng đích chuyển vào --</option>
                      {providers.map(p => (
                        <option key={p.id} value={p.id}>{p.display_name || p.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 flex-shrink-0"
                  >
                    <GitMerge className="w-4 h-4" /> Gộp
                  </button>
                </form>
              </div>
            </div>

            {/* Providers List Grid */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">Danh sách Hãng bảo hiểm hiện có</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {providers.map((p) => {
                  const isEditing = providerEdits[p.id] !== undefined;
                  const currentEditValue = isEditing ? providerEdits[p.id].display_name : (p.display_name || '');

                  return (
                    <div 
                      key={p.id} 
                      className={`bg-slate-950/40 p-4 rounded-xl border flex flex-col justify-between gap-4 transition-all duration-300 ${
                        p.is_locked ? 'border-slate-900 bg-slate-950/15' : 'border-slate-800/80 hover:border-slate-700/60'
                      }`}
                    >
                      <div className="space-y-2">
                        {isEditing ? (
                          <div className="flex gap-1.5 items-center">
                            <input
                              type="text"
                              value={currentEditValue}
                              onChange={(e) => setProviderEdits({
                                ...providerEdits,
                                [p.id]: { display_name: e.target.value }
                              })}
                              className="flex-1 px-2.5 py-1.5 bg-slate-900 text-white border border-slate-800 rounded-lg text-sm focus:outline-none"
                              placeholder="Tên hãng bảo hiểm"
                            />
                            <button
                              onClick={() => handleSaveProvider(p.id, p.name)}
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white transition-colors"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-base">{p.display_name || p.name}</span>
                              {p.display_name && (
                                <span className="text-[10px] text-slate-500 font-semibold px-1.5 py-0.5 rounded border border-slate-800">
                                  Gốc: {p.name}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 block mt-1">
                              Tạo ngày: {format(new Date(p.created_at), 'dd/MM/yyyy HH:mm')}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center gap-3 pt-2 border-t border-slate-900/60">
                        {/* Edit button */}
                        {!isEditing && (
                          <button
                            onClick={() => setProviderEdits({
                              ...providerEdits,
                              [p.id]: { display_name: p.display_name || '' }
                            })}
                            className="text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                          >
                            Đổi tên hiển thị
                          </button>
                        )}
                        {isEditing && (
                          <button
                            onClick={() => {
                              const copy = { ...providerEdits };
                              delete copy[p.id];
                              setProviderEdits(copy);
                            }}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-400 transition-colors"
                          >
                            Hủy chỉnh sửa
                          </button>
                        )}

                        {/* Controls */}
                        <div className="flex gap-2">
                          {/* Hide toggle */}
                          <button
                            onClick={() => updateProvider(p.id, { is_hidden: !p.is_hidden })}
                            className={`p-1.5 rounded-lg border transition-all ${
                              p.is_hidden 
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/25' 
                                : 'text-slate-400 hover:text-white border-transparent hover:border-slate-800'
                            }`}
                            title={p.is_hidden ? "Hiện hãng trên biểu đồ" : "Ẩn hãng khỏi biểu đồ"}
                          >
                            {p.is_hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>

                          {/* Lock toggle */}
                          <button
                            onClick={() => updateProvider(p.id, { is_locked: !p.is_locked })}
                            className={`p-1.5 rounded-lg border transition-all ${
                              p.is_locked 
                                ? 'bg-rose-500/10 text-rose-500 border-rose-500/25' 
                                : 'text-slate-400 hover:text-white border-transparent hover:border-slate-800'
                            }`}
                            title={p.is_locked ? "Mở khóa hãng" : "Khóa hãng bảo hiểm"}
                          >
                            {p.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
