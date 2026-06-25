import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  login: (username: string, password?: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('auth_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {}
    }
  }, []);

  const login = async (username: string, password?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/users');
      const users: User[] = await res.json();
      const foundUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());
      
      if (foundUser) {
        const expectedPassword = foundUser.password || (foundUser.phone ? `${foundUser.phone}@` : `${foundUser.username}@`);
        if (password === expectedPassword) {
          setUser(foundUser);
          localStorage.setItem('auth_user', JSON.stringify(foundUser));
          return true;
        } else {
          alert('Mật khẩu không chính xác!');
          return false;
        }
      } else {
        alert('Tài khoản không tồn tại trong hệ thống!');
        return false;
      }
    } catch (e) {
      console.error('Login error:', e);
      alert('Không thể kết nối đến server!');
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
