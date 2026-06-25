import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  InsuranceOrder, 
  User, 
  ChangeLog, 
  DashboardStats, 
  StaffReportItem, 
  AgencyReportItem, 
  PersonalStats,
  ImportBatch,
  Provider,
  CommissionConfig,
  BonusConfig
} from '../types';

interface DataContextType {
  orders: InsuranceOrder[];
  users: User[];
  changeLogs: ChangeLog[];
  batches: ImportBatch[];
  providers: Provider[];
  commissionConfigs: CommissionConfig[];
  bonusConfigs: BonusConfig[];

  // Stats (server-computed)
  dashboardStats: DashboardStats | null;
  staffReport: StaffReportItem[];
  agencyReport: AgencyReportItem[];
  personalStats: PersonalStats | null;
  reportData: { cancelled: InsuranceOrder[]; unpaid: InsuranceOrder[]; expiring: (InsuranceOrder & { daysLeft?: number })[] };
  
  // Data operations
  addOrder: (order: InsuranceOrder, userFullname: string) => Promise<InsuranceOrder | null>;
  updateOrder: (id: string, updates: Partial<InsuranceOrder>, userFullname: string, detailMsg?: string) => Promise<boolean>;
  importOrders: (newOrders: InsuranceOrder[], logs: ChangeLog[], batchName?: string, batchMonth?: string) => Promise<{ success: boolean; batchId?: string }>;
  deleteOrder: (id: string, userFullname: string) => Promise<boolean>;
  deleteOrdersBulk: (ids: string[], userFullname: string) => Promise<boolean>;
  updateOrdersBulk: (ids: string[], updates: Partial<InsuranceOrder>, userFullname: string) => Promise<boolean>;
  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => void;

  // New Operations
  updateBatch: (id: string, updates: Partial<ImportBatch>) => Promise<boolean>;
  deleteBatch: (id: string) => Promise<boolean>;
  addProvider: (name: string, displayName?: string) => Promise<boolean>;
  updateProvider: (id: string, updates: Partial<Provider>) => Promise<boolean>;
  mergeProviders: (sourceId: string, targetId: string) => Promise<boolean>;
  addCommissionConfig: (config: Omit<CommissionConfig, 'id' | 'created_at'>) => Promise<boolean>;
  updateCommissionConfig: (id: string, updates: Partial<CommissionConfig>) => Promise<boolean>;
  deleteCommissionConfig: (id: string) => Promise<boolean>;
  addBonusConfig: (config: Omit<BonusConfig, 'id' | 'created_at'>) => Promise<boolean>;
  updateBonusConfig: (id: string, updates: Partial<BonusConfig>) => Promise<boolean>;
  deleteBonusConfig: (id: string) => Promise<boolean>;
  fetchBonusReport: (month: string) => Promise<{ month: string; configName: string; report: any[] }>;

  // Stats refresh
  refreshStats: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [orders, setOrders] = useState<InsuranceOrder[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [commissionConfigs, setCommissionConfigs] = useState<CommissionConfig[]>([]);
  const [bonusConfigs, setBonusConfigs] = useState<BonusConfig[]>([]);
  
  // Server-computed stats
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [staffReport, setStaffReport] = useState<StaffReportItem[]>([]);
  const [agencyReport, setAgencyReport] = useState<AgencyReportItem[]>([]);
  const [personalStats, setPersonalStats] = useState<PersonalStats | null>(null);
  const [reportData, setReportData] = useState<{ cancelled: InsuranceOrder[]; unpaid: InsuranceOrder[]; expiring: (InsuranceOrder & { daysLeft?: number })[] }>({ cancelled: [], unpaid: [], expiring: [] });

  // Get current authenticated user from localStorage
  const getAuthUser = useCallback((): User | null => {
    try {
      const savedUser = localStorage.getItem('auth_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch { return null; }
  }, []);

  // Fetch core data from backend
  const fetchData = async () => {
    try {
      const [resOrders, resUsers, resLogs, resBatches, resProviders, resComm, resBonus] = await Promise.all([
        fetch('/api/orders').then(r => r.json()),
        fetch('/api/users').then(r => r.json()),
        fetch('/api/logs').then(r => r.json()),
        fetch('/api/batches').then(r => r.json()),
        fetch('/api/providers').then(r => r.json()),
        fetch('/api/commission-configs').then(r => r.json()),
        fetch('/api/bonus-configs').then(r => r.json())
      ]);
      setOrders(resOrders);
      setUsers(resUsers);
      setChangeLogs(resLogs);
      setBatches(resBatches);
      setProviders(resProviders);
      setCommissionConfigs(resComm);
      setBonusConfigs(resBonus);
    } catch (e) {
      console.error('Failed to fetch data from backend server:', e);
    }
  };

  // Fetch stats from server (server-computed)
  const fetchStats = useCallback(async () => {
    const authUser = getAuthUser();
    if (!authUser) return;

    try {
      // Dashboard stats
      const dashRes = await fetch(`/api/stats/dashboard?user_id=${authUser.id}&role=${authUser.role}`);
      const dashData = await dashRes.json();
      setDashboardStats(dashData);

      // Role-specific stats
      if (authUser.role === 'MASTER' || authUser.role === 'ACCOUNTANT') {
        const staffRes = await fetch('/api/stats/staff-report');
        setStaffReport(await staffRes.json());
      }

      if (authUser.role === 'MASTER' || authUser.role === 'ACCOUNTANT' || authUser.role === 'STAFF' || authUser.role === 'CTV') {
        const agencyRes = await fetch(`/api/stats/agency-report?user_id=${authUser.id}&role=${authUser.role}`);
        setAgencyReport(await agencyRes.json());
      }

      if (authUser.role === 'STAFF' || authUser.role === 'CTV') {
        const personalRes = await fetch(`/api/stats/personal?user_id=${authUser.id}&role=${authUser.role}`);
        setPersonalStats(await personalRes.json());
      }

      // Report list data
      const [cancelledRes, unpaidRes, expiringRes] = await Promise.all([
        fetch(`/api/stats/report-data?user_id=${authUser.id}&role=${authUser.role}&report_type=CANCELLED`).then(r => r.json()),
        fetch(`/api/stats/report-data?user_id=${authUser.id}&role=${authUser.role}&report_type=UNPAID`).then(r => r.json()),
        fetch(`/api/stats/report-data?user_id=${authUser.id}&role=${authUser.role}&report_type=EXPIRING`).then(r => r.json()),
      ]);
      setReportData({ cancelled: cancelledRes, unpaid: unpaidRes, expiring: expiringRes });

    } catch (e) {
      console.error('Failed to fetch stats from server:', e);
    }
  }, [getAuthUser]);

  const refreshStats = useCallback(() => {
    fetchStats();
  }, [fetchStats]);

  // Subscribe to SSE event stream for cross-device real-time updates
  useEffect(() => {
    fetchData().then(() => fetchStats());

    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'update') {
          fetchData().then(() => fetchStats());
        }
      } catch (err) {
        console.error('Error parsing SSE event data:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const addOrder = async (order: InsuranceOrder, userFullname: string): Promise<InsuranceOrder | null> => {
    const log: ChangeLog = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order_id: order.id,
      serial_number: order.serial_number || order.id,
      action: 'CREATE',
      user_fullname: userFullname,
      timestamp: new Date().toISOString(),
      details: `Tạo thẻ bảo hiểm mới cho chủ xe ${order.vehicle_owner}`
    };

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add order');
      }

      const computed = await response.json();
      setOrders(prev => [computed, ...prev]);
      setChangeLogs(prev => [log, ...prev]);

      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });

      return computed;
    } catch (err: any) {
      console.error('Failed to save order to server:', err);
      alert(err.message || 'Lỗi khi lưu đơn bảo hiểm');
      return null;
    }
  };

  const updateOrder = async (id: string, updates: Partial<InsuranceOrder>, userFullname: string, detailMsg?: string): Promise<boolean> => {
    const orig = orders.find(o => o.id === id);
    const serial = orig?.serial_number || updates.serial_number || id;
    
    let actionType: ChangeLog['action'] = 'EDIT';
    let details = detailMsg || '';
    if (!details && orig) {
      const changes: string[] = [];
      if (updates.status && updates.status !== orig.status) {
        actionType = updates.status === 'CANCELLED' ? 'CANCEL' : 'UPDATE_STATUS';
        changes.push(`Trạng thái đơn: ${orig.status} -> ${updates.status}`);
      }
      if (updates.payment_status && updates.payment_status !== orig.payment_status) {
        actionType = 'UPDATE_PAYMENT';
        changes.push(`Thanh toán: ${orig.payment_status} -> ${updates.payment_status}`);
      }
      if (updates.staff_id !== undefined && updates.staff_id !== orig.staff_id) {
        actionType = 'UPDATE_ASSIGNMENT';
        const oldStaff = users.find(u => u.id === orig.staff_id)?.fullname || 'Chưa phân công';
        const newStaff = users.find(u => u.id === updates.staff_id)?.fullname || 'Chưa phân công';
        changes.push(`Nhân viên phụ trách: ${oldStaff} -> ${newStaff}`);
      }
      if (updates.agency_id !== undefined && updates.agency_id !== orig.agency_id) {
        actionType = 'UPDATE_ASSIGNMENT';
        const oldAgency = users.find(u => u.id === orig.agency_id)?.fullname || 'Không có';
        const newAgency = users.find(u => u.id === updates.agency_id)?.fullname || 'Không có';
        changes.push(`Đại lý phụ trách: ${oldAgency} -> ${newAgency}`);
      }
      if (changes.length === 0) {
        changes.push(`Cập nhật thông tin chi tiết thẻ`);
      }
      details = changes.join(', ');
    }

    const log: ChangeLog = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order_id: id,
      serial_number: serial,
      action: actionType,
      user_fullname: userFullname,
      timestamp: new Date().toISOString(),
      details: details
    };

    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update order');
      }

      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
      return true;
    } catch (err: any) {
      console.error('Failed to update order on server:', err);
      alert(err.message || 'Lỗi khi cập nhật đơn bảo hiểm');
      return false;
    }
  };

  const importOrders = async (
    newOrders: InsuranceOrder[], 
    logs: ChangeLog[], 
    batchName?: string, 
    batchMonth?: string
  ): Promise<{ success: boolean; batchId?: string }> => {
    try {
      const response = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOrders, logs, batchName, batchMonth })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to bulk import orders');
      }

      const data = await response.json();
      return { success: true, batchId: data.batchId };
    } catch (err: any) {
      console.error('Failed to bulk import orders on server:', err);
      alert(err.message || 'Lỗi khi nhập Excel');
      return { success: false };
    }
  };

  const deleteOrder = async (id: string, userFullname: string): Promise<boolean> => {
    const deletedOrder = orders.find(o => o.id === id);
    
    const log: ChangeLog = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order_id: id,
      serial_number: deletedOrder?.serial_number || id,
      action: 'CANCEL',
      user_fullname: userFullname,
      timestamp: new Date().toISOString(),
      details: `Xóa vĩnh viễn thẻ bảo hiểm, chủ xe: ${deletedOrder?.vehicle_owner || 'N/A'}`
    };

    try {
      const response = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete order');
      }

      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
      return true;
    } catch (err: any) {
      console.error('Failed to delete order on server:', err);
      alert(err.message || 'Lỗi khi xóa đơn bảo hiểm');
      return false;
    }
  };

  const deleteOrdersBulk = async (ids: string[], userFullname: string): Promise<boolean> => {
    const idSet = new Set(ids);
    const deletedOrders = orders.filter(o => idSet.has(o.id));
    
    const logs: ChangeLog[] = deletedOrders.map(o => ({
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order_id: o.id,
      serial_number: o.serial_number || o.id,
      action: 'CANCEL',
      user_fullname: userFullname,
      timestamp: new Date().toISOString(),
      details: `Xóa hàng loạt thẻ bảo hiểm, chủ xe: ${o.vehicle_owner}`
    }));

    try {
      const response = await fetch('/api/orders/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, logs })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to bulk delete orders');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to bulk delete orders on server:', err);
      alert(err.message || 'Lỗi khi xóa hàng loạt');
      return false;
    }
  };

  const updateOrdersBulk = async (ids: string[], updates: Partial<InsuranceOrder>, userFullname: string): Promise<boolean> => {
    const idSet = new Set(ids);
    const targetOrders = orders.filter(o => idSet.has(o.id));
    const details = Object.entries(updates)
      .map(([key, val]) => `${key}: ${val}`)
      .join(', ');
      
    const logs: ChangeLog[] = targetOrders.map(o => ({
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order_id: o.id,
      serial_number: o.serial_number || o.id,
      action: 'EDIT',
      user_fullname: userFullname,
      timestamp: new Date().toISOString(),
      details: `Điều chỉnh hàng loạt: ${details}`
    }));

    try {
      const response = await fetch('/api/orders/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, updates, logs })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to bulk update orders');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to bulk update orders on server:', err);
      alert(err.message || 'Lỗi khi cập nhật hàng loạt');
      return false;
    }
  };

  const updateBatch = async (id: string, updates: Partial<ImportBatch>): Promise<boolean> => {
    try {
      const response = await fetch(`/api/batches/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update batch');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to update batch:', err);
      alert(err.message || 'Lỗi khi cập nhật bảng kê');
      return false;
    }
  };

  const deleteBatch = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/batches/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete batch');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to delete batch:', err);
      alert(err.message || 'Lỗi khi xóa bảng kê');
      return false;
    }
  };

  const addProvider = async (name: string, displayName?: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, display_name: displayName })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add provider');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to add provider:', err);
      alert(err.message || 'Lỗi khi thêm hãng');
      return false;
    }
  };

  const updateProvider = async (id: string, updates: Partial<Provider>): Promise<boolean> => {
    try {
      const response = await fetch(`/api/providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update provider');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to update provider:', err);
      alert(err.message || 'Lỗi khi cập nhật hãng');
      return false;
    }
  };

  const mergeProviders = async (sourceId: string, targetId: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/providers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to merge providers');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to merge providers:', err);
      alert(err.message || 'Lỗi khi gộp hãng');
      return false;
    }
  };

  const addCommissionConfig = async (config: Omit<CommissionConfig, 'id' | 'created_at'>): Promise<boolean> => {
    try {
      const response = await fetch('/api/commission-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add commission config');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to add commission config:', err);
      alert(err.message || 'Lỗi khi thêm cấu hình hoa hồng');
      return false;
    }
  };

  const updateCommissionConfig = async (id: string, updates: Partial<CommissionConfig>): Promise<boolean> => {
    try {
      const response = await fetch(`/api/commission-configs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update commission config');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to update commission config:', err);
      alert(err.message || 'Lỗi khi cập nhật cấu hình hoa hồng');
      return false;
    }
  };

  const deleteCommissionConfig = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/commission-configs/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete commission config');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to delete commission config:', err);
      alert(err.message || 'Lỗi khi xóa cấu hình hoa hồng');
      return false;
    }
  };

  const addBonusConfig = async (config: Omit<BonusConfig, 'id' | 'created_at'>): Promise<boolean> => {
    try {
      const response = await fetch('/api/bonus-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add bonus config');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to add bonus config:', err);
      alert(err.message || 'Lỗi khi thêm cấu hình thưởng');
      return false;
    }
  };

  const updateBonusConfig = async (id: string, updates: Partial<BonusConfig>): Promise<boolean> => {
    try {
      const response = await fetch(`/api/bonus-configs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update bonus config');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to update bonus config:', err);
      alert(err.message || 'Lỗi khi cập nhật cấu hình thưởng');
      return false;
    }
  };

  const deleteBonusConfig = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/bonus-configs/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete bonus config');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to delete bonus config:', err);
      alert(err.message || 'Lỗi khi xóa cấu hình thưởng');
      return false;
    }
  };

  const fetchBonusReport = async (month: string): Promise<{ month: string; configName: string; report: any[] }> => {
    try {
      const response = await fetch(`/api/stats/bonus-report?month=${month}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch bonus report');
      }
      return await response.json();
    } catch (err: any) {
      console.error('Failed to fetch bonus report:', err);
      alert(err.message || 'Lỗi khi tải báo cáo thưởng');
      return { month, configName: 'Lỗi', report: [] };
    }
  };

  const addUser = async (user: User) => {
    setUsers(prev => [...prev, user]);
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });

      if (user.role === 'AGENCY') {
        const ordersToUpdate = orders.filter(o => 
          o.agency_id && 
          typeof o.agency_id === 'string' && 
          o.agency_id.toLowerCase() === user.fullname.toLowerCase() &&
          (!o.staff_id || o.staff_id === user.parent_id)
        );
        if (ordersToUpdate.length > 0) {
          const ids = ordersToUpdate.map(o => o.id);
          await updateOrdersBulk(ids, { agency_id: user.id }, 'Hệ thống (Tự động map Đại lý)');
        }
      }
    } catch (err) {
      console.error('Failed to add user to server:', err);
    }
  };

  const updateUser = async (id: string, updates: Partial<User>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    const targetUser = users.find(u => u.id === id);
    const finalName = updates.fullname || targetUser?.fullname;
    const isAgency = (updates.role || targetUser?.role) === 'AGENCY';
    const parentId = updates.parent_id || targetUser?.parent_id;

    try {
      await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (isAgency && finalName) {
        const ordersToUpdate = orders.filter(o => 
          o.agency_id && 
          typeof o.agency_id === 'string' && 
          o.agency_id.toLowerCase() === finalName.toLowerCase() &&
          (!o.staff_id || o.staff_id === parentId)
        );
        if (ordersToUpdate.length > 0) {
          const ids = ordersToUpdate.map(o => o.id);
          await updateOrdersBulk(ids, { agency_id: id }, 'Hệ thống (Tự động map Đại lý)');
        }
      }
    } catch (err) {
      console.error('Failed to update user on server:', err);
    }
  };

  const deleteUser = async (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    try {
      await fetch(`/api/users/${id}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.error('Failed to delete user on server:', err);
    }
  };

  return (
    <DataContext.Provider value={{ 
      orders, users, changeLogs, batches, providers, commissionConfigs, bonusConfigs,
      dashboardStats, staffReport, agencyReport, personalStats, reportData,
      addOrder, updateOrder, importOrders,
      deleteOrder, deleteOrdersBulk, updateOrdersBulk,
      addUser, updateUser, deleteUser,
      updateBatch, deleteBatch, addProvider, updateProvider, mergeProviders,
      addCommissionConfig, updateCommissionConfig, deleteCommissionConfig,
      addBonusConfig, updateBonusConfig, deleteBonusConfig, fetchBonusReport,
      refreshStats
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
