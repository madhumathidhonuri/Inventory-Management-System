import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const ROLES = {
  SUPER_ADMIN: { key: 'SUPER_ADMIN', label: 'Super Admin', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  WAREHOUSE_MANAGER: { key: 'WAREHOUSE_MANAGER', label: 'Warehouse Manager', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  SALES_MANAGER: { key: 'SALES_MANAGER', label: 'Sales Manager', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  INSTALLER: { key: 'INSTALLER', label: 'Field Installer', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  DEALER: { key: 'DEALER', label: 'Dealer Partner', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }
};

export const SAMPLE_USERS = [
  { id: 1, name: 'Super Admin', role: 'SUPER_ADMIN', email: 'admin@fueltracks.in' },
  { id: 2, name: 'Suresh (Warehouse)', role: 'WAREHOUSE_MANAGER', email: 'suresh.wh@fueltracks.in' },
  { id: 3, name: 'Vikram (Sales Mgr)', role: 'SALES_MANAGER', email: 'vikram.sm@fueltracks.in' },
  { id: 4, name: 'Rajesh (Installer)', role: 'INSTALLER', email: 'rajesh.tech@fueltracks.in' },
  { id: 5, name: 'Apex Telematics', role: 'DEALER', email: 'contact@apextelematics.com' }
];

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(SAMPLE_USERS[0]);
  const [isMobileMode, setIsMobileMode] = useState(false);

  const setRole = (roleKey) => {
    const userMatch = SAMPLE_USERS.find(u => u.role === roleKey) || {
      id: 99,
      name: `User (${roleKey})`,
      role: roleKey,
      email: `${roleKey.toLowerCase()}@fueltracks.in`
    };
    setCurrentUser(userMatch);
  };

  return (
    <AuthContext.Provider value={{
      user: currentUser,
      roleInfo: ROLES[currentUser.role] || ROLES.SUPER_ADMIN,
      setRole,
      isMobileMode,
      setIsMobileMode
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
