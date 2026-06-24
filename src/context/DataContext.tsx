import React, { createContext, useContext, useState, useEffect } from 'react';
import { InsuranceOrder, User, ChangeLog } from '../types';

interface DataContextType {
  orders: InsuranceOrder[];
  users: User[];
  changeLogs: ChangeLog[];
  addOrder: (order: InsuranceOrder, userFullname: string) => void;
  updateOrder: (id: string, updates: Partial<InsuranceOrder>, userFullname: string, detailMsg?: string) => void;
  importOrders: (newOrders: InsuranceOrder[], logs: ChangeLog[]) => void;
  deleteOrder: (id: string, userFullname: string) => Promise<void>;
  deleteOrdersBulk: (ids: string[], userFullname: string) => Promise<void>;
  updateOrdersBulk: (ids: string[], updates: Partial<InsuranceOrder>, userFullname: string) => Promise<void>;
  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [orders, setOrders] = useState<InsuranceOrder[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([]);

  // Fetch all database records from backend APIs
  const fetchData = async () => {
    try {
      const [resOrders, resUsers, resLogs] = await Promise.all([
        fetch('/api/orders').then(r => r.json()),
        fetch('/api/users').then(r => r.json()),
        fetch('/api/logs').then(r => r.json())
      ]);
      setOrders(resOrders);
      setUsers(resUsers);
      setChangeLogs(resLogs);
    } catch (e) {
      console.error('Failed to fetch data from backend server:', e);
    }
  };

  // Subscribe to SSE event stream for cross-device real-time updates
  useEffect(() => {
    fetchData();

    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'update') {
          fetchData();
        }
      } catch (err) {
        console.error('Error parsing SSE event data:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const addOrder = async (order: InsuranceOrder, userFullname: string) => {
    const orderWithExpiry = { ...order };
    if (!orderWithExpiry.expiration_date && orderWithExpiry.effective_date) {
      const d = new Date(orderWithExpiry.effective_date);
      d.setFullYear(d.getFullYear() + 1);
      orderWithExpiry.expiration_date = d.toISOString().split('T')[0];
    }

    // Optimistic UI updates
    setOrders(prev => [orderWithExpiry, ...prev]);

    const log: ChangeLog = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order_id: orderWithExpiry.id,
      serial_number: orderWithExpiry.serial_number || orderWithExpiry.id,
      action: 'CREATE',
      user_fullname: userFullname,
      timestamp: new Date().toISOString(),
      details: `Tạo thẻ bảo hiểm mới cho chủ xe ${orderWithExpiry.vehicle_owner}`
    };
    setChangeLogs(prev => [log, ...prev]);

    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderWithExpiry)
      });
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
    } catch (err) {
      console.error('Failed to save order to server:', err);
    }
  };

  const updateOrder = async (id: string, updates: Partial<InsuranceOrder>, userFullname: string, detailMsg?: string) => {
    // Optimistic UI updates
    setOrders(prev => prev.map(o => {
      if (o.id === id) {
        const updated = { ...o, ...updates, updated_at: new Date().toISOString() };
        if (updates.status === 'CANCELLED') {
          updated.tnds_fee = 0;
          updated.nn_fee = 0;
          updated.total_fee = 0;
          updated.cod_amount = 0;
          updated.shipping_fee = 0;
        }
        if (updates.effective_date && updates.effective_date !== o.effective_date) {
          const d = new Date(updates.effective_date);
          d.setFullYear(d.getFullYear() + 1);
          updated.expiration_date = d.toISOString().split('T')[0];
        }
        return updated;
      }
      return o;
    }));

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
    setChangeLogs(prev => [log, ...prev]);

    try {
      await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
    } catch (err) {
      console.error('Failed to update order on server:', err);
    }
  };

  const importOrders = async (newOrders: InsuranceOrder[], logs: ChangeLog[]) => {
    // Optimistic UI updates
    setOrders(prev => {
      const updated = [...prev];
      const processedNewOrders = newOrders.map((no: InsuranceOrder) => {
        const existing = updated.find(o => o.id === no.id || (o.serial_number && o.serial_number === no.serial_number));
        const processed = existing ? {
          ...existing,
          ...no,
          id: existing.id,
          created_at: existing.created_at,
          updated_at: new Date().toISOString()
        } : { ...no };
        
        if (processed.status === 'CANCELLED') {
          processed.tnds_fee = 0;
          processed.nn_fee = 0;
          processed.total_fee = 0;
          processed.cod_amount = 0;
          processed.shipping_fee = 0;
        }
        return processed;
      });

      const processedIds = new Set(processedNewOrders.map(o => o.id));
      const processedSerials = new Set(processedNewOrders.map(o => o.serial_number).filter(Boolean));
      const cleanExisting = updated.filter(o => !processedIds.has(o.id) && !(o.serial_number && processedSerials.has(o.serial_number)));

      return [...processedNewOrders, ...cleanExisting];
    });
    setChangeLogs(prev => [...logs, ...prev]);

    try {
      await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOrders, logs })
      });
    } catch (err) {
      console.error('Failed to bulk import orders on server:', err);
    }
  };

  const deleteOrder = async (id: string, userFullname: string) => {
    const deletedOrder = orders.find(o => o.id === id);
    setOrders(prev => prev.filter(o => o.id !== id));
    
    const log: ChangeLog = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order_id: id,
      serial_number: deletedOrder?.serial_number || id,
      action: 'CANCEL',
      user_fullname: userFullname,
      timestamp: new Date().toISOString(),
      details: `Xóa vĩnh viễn thẻ bảo hiểm, chủ xe: ${deletedOrder?.vehicle_owner || 'N/A'}`
    };
    setChangeLogs(prev => [log, ...prev]);

    try {
      await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
    } catch (err) {
      console.error('Failed to delete order on server:', err);
    }
  };

  const deleteOrdersBulk = async (ids: string[], userFullname: string) => {
    const idSet = new Set(ids);
    const deletedOrders = orders.filter(o => idSet.has(o.id));
    setOrders(prev => prev.filter(o => !idSet.has(o.id)));
    
    const logs: ChangeLog[] = deletedOrders.map(o => ({
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order_id: o.id,
      serial_number: o.serial_number || o.id,
      action: 'CANCEL',
      user_fullname: userFullname,
      timestamp: new Date().toISOString(),
      details: `Xóa hàng loạt thẻ bảo hiểm, chủ xe: ${o.vehicle_owner}`
    }));
    setChangeLogs(prev => [...logs, ...prev]);

    try {
      await fetch('/api/orders/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, logs })
      });
    } catch (err) {
      console.error('Failed to bulk delete orders on server:', err);
    }
  };

  const updateOrdersBulk = async (ids: string[], updates: Partial<InsuranceOrder>, userFullname: string) => {
    const idSet = new Set(ids);
    
    setOrders(prev => prev.map(o => {
      if (idSet.has(o.id)) {
        const u = { ...o, ...updates, updated_at: new Date().toISOString() };
        if (updates.status === 'CANCELLED') {
          u.tnds_fee = 0;
          u.nn_fee = 0;
          u.total_fee = 0;
          u.cod_amount = 0;
          u.shipping_fee = 0;
        }
        if (updates.tnds_fee !== undefined || updates.nn_fee !== undefined) {
          u.total_fee = Number(updates.tnds_fee !== undefined ? updates.tnds_fee : o.tnds_fee) + Number(updates.nn_fee !== undefined ? updates.nn_fee : o.nn_fee);
        }
        if (updates.total_fee !== undefined) {
          u.total_fee = Number(updates.total_fee);
        }
        if (updates.effective_date && updates.effective_date !== o.effective_date) {
          const d = new Date(updates.effective_date);
          d.setFullYear(d.getFullYear() + 1);
          u.expiration_date = d.toISOString().split('T')[0];
        }
        if (u.cod_amount > 0) {
          u.payment_status = 'PAID';
        }
        return u;
      }
      return o;
    }));
    
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
    setChangeLogs(prev => [...logs, ...prev]);

    try {
      await fetch('/api/orders/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, updates, logs })
      });
    } catch (err) {
      console.error('Failed to bulk update orders on server:', err);
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
    } catch (err) {
      console.error('Failed to add user to server:', err);
    }
  };

  const updateUser = async (id: string, updates: Partial<User>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    try {
      await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
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
      orders, users, changeLogs, 
      addOrder, updateOrder, importOrders,
      deleteOrder, deleteOrdersBulk, updateOrdersBulk,
      addUser, updateUser, deleteUser 
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


