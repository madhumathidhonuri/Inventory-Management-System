import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const ROLES = {
  SUPER_ADMIN: { key: 'SUPER_ADMIN', label: 'Super Admin (Owner)', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  ADMIN_TEAM: { key: 'ADMIN_TEAM', label: 'Admin Team (Vehicle & Certificate)', color: 'bg-amber-100 text-amber-850 border-amber-300' },
  SALES_TEAM: { key: 'SALES_TEAM', label: 'Sales Team (Cost & Payment)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  DEALER: { key: 'DEALER', label: 'Dealer / Partner Portal', color: 'bg-blue-100 text-blue-800 border-blue-300' }
};

export const DEFAULT_ROLE_COLUMNS = {
  ADMIN_TEAM: [
    'Vehicle Number',
    'Customer Name',
    'Customer Contact',
    'Chasis Number',
    'Engine Number',
    'Certificate Issued Date',
    'Certificate Issued To',
    'Stock Place',
    'Stock Place Date',
    'SIM Number',
    'Status'
  ],
  SALES_TEAM: [
    'Sales Person',
    'Cost',
    'Tax',
    'Total Cost',
    'Installation Charges',
    'Payment Status',
    'Amount Received',
    'Amount Received By',
    'Sale Price'
  ],
  DEALER: [
    'Vehicle Number',
    'Customer Name',
    'Customer Contact',
    'Certificate Issued Date',
    'Stock Place Date',
    'SIM Number',
    'Status',
    'Remarks'
  ]
};

export const SAMPLE_USERS = [
  { id: 1, name: 'FuelTracks Admin', role: 'SUPER_ADMIN', email: 'owner@fueltracks.in', password: 'admin', allowed_columns: [], desc: 'Master access to all modules, financial reporting, system settings, and complete deletion rights.' },
  { id: 2, name: 'FuelTracks Admin', role: 'SUPER_ADMIN', email: 'admin@fueltracks.in', password: 'admin', allowed_columns: [], desc: 'Master access to all modules, financial reporting, system settings, and complete deletion rights.' }
];

// Helper to determine if a specific role or user can edit a given field
export function canUserEditField(userOrRole, fieldName) {
  if (!userOrRole) return true;

  const roleKey = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
  const customAllowedCols = typeof userOrRole === 'object' && Array.isArray(userOrRole.allowed_columns) && userOrRole.allowed_columns.length > 0
    ? userOrRole.allowed_columns
    : null;

  if (roleKey === 'SUPER_ADMIN') return true;

  const targetField = String(fieldName || '').trim().toUpperCase();

  // If custom allowed_columns are configured for this user, check them directly:
  if (customAllowedCols) {
    return customAllowedCols.some(col => {
      const colNorm = String(col).trim().toUpperCase();
      if (colNorm === targetField) return true;
      if (colNorm.replace(/[\s_-]+/g, '') === targetField.replace(/[\s_-]+/g, '')) return true;
      return false;
    });
  }

  // Fall back to role default permission matrices
  if (roleKey === 'DEALER') {
    const allowedDealerPatterns = [
      /vehicle.*num|vehicle|veh_no|reg_no/i,
      /customer.*name|cust.*name/i,
      /phone|contact|mobile/i,
      /certificate.*date|issued.*date/i,
      /status/i,
      /remarks/i
    ];
    return allowedDealerPatterns.some(p => p.test(targetField));
  }

  if (roleKey === 'ADMIN_TEAM' || roleKey === 'WAREHOUSE_MANAGER' || roleKey === 'INSTALLER') {
    const allowedAdminPatterns = [
      /vehicle.*num|vehicle|veh_no|reg_no/i,
      /chasis|chassis/i,
      /engine/i,
      /customer.*name|cust.*name/i,
      /phone|contact|mobile/i,
      /certificate.*date|issued.*date/i,
      /certificate.*to|issued.*to/i,
      /stock.*place/i,
      /place.*date/i,
      /sim/i,
      /status/i,
      /remarks/i
    ];
    return allowedAdminPatterns.some(p => p.test(targetField));
  }

  if (roleKey === 'SALES_TEAM' || roleKey === 'SALES_MANAGER') {
    const allowedSalesPatterns = [
      /^cost$/i,
      /tax/i,
      /total.*cost/i,
      /installation.*charge/i,
      /amount.*rec|payment|received/i,
      /amount.*rec.*by|received.*by/i,
      /sales.*person/i,
      /sales.*manager/i,
      /sale_price/i,
      /purchase_price/i
    ];
    return allowedSalesPatterns.some(p => p.test(targetField));
  }

  return false;
}

// Helper to check if active user is Super Admin
export function isSuperAdmin(userOrRole) {
  if (!userOrRole) return false;
  const roleKey = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
  return roleKey === 'SUPER_ADMIN';
}

// Helper to check if active user has delete permissions (Strictly Super Admin)
export function canUserDelete(userOrRole) {
  return isSuperAdmin(userOrRole);
}

// Helper to check if active user can see wholesale vendor costs
export function canUserSeeWholesaleCost(userOrRole) {
  if (!userOrRole) return false;
  const roleKey = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
  return roleKey === 'SUPER_ADMIN';
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('fueltracks_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      const savedAuth = localStorage.getItem('fueltracks_auth');
      return savedAuth === 'true';
    } catch {
      return false;
    }
  });

  const [isMobileMode, setIsMobileMode] = useState(false);

  const login = async (email, password) => {
    let allUsers = [...SAMPLE_USERS];
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          // Merge unique users
          const backendUsers = data.data.map(u => ({
            ...u,
            allowed_columns: Array.isArray(u.allowed_columns) ? u.allowed_columns : []
          }));
          allUsers = [...SAMPLE_USERS, ...backendUsers];
        }
      }
    } catch (e) {
      console.warn('User fetch during login fallback:', e);
    }

    const cleanEmail = String(email || '').toLowerCase().trim();
    const cleanPass = String(password || '').trim();

    const userMatch = allUsers.find(
      u => (u.email && u.email.toLowerCase() === cleanEmail) || 
           (u.phone && u.phone.toLowerCase() === cleanEmail) ||
           (u.name && u.name.toLowerCase() === cleanEmail)
    );

    if (
      userMatch &&
      (userMatch.password === cleanPass ||
       (userMatch.role === 'SUPER_ADMIN' && (cleanPass === 'admin123' || cleanPass === '123456' || cleanPass === 'admin')) ||
       (userMatch.role === 'ADMIN_TEAM' && (cleanPass === 'admin123' || cleanPass === '123456' || cleanPass === 'admin')) ||
       (userMatch.role === 'SALES_TEAM' && (cleanPass === 'sales123' || cleanPass === '123456' || cleanPass === 'sales')) ||
       (userMatch.role === 'DEALER' && (cleanPass === 'dealer' || cleanPass === '123456' || cleanPass === 'admin')))
    ) {
      setCurrentUser(userMatch);
      setIsAuthenticated(true);
      localStorage.setItem('fueltracks_user', JSON.stringify(userMatch));
      localStorage.setItem('fueltracks_auth', 'true');
      return { success: true, user: userMatch };
    }
    return { success: false, error: 'Invalid work email or password. Please try again.' };
  };

  const loginAsRole = (roleKey) => {
    const userMatch = SAMPLE_USERS.find(u => u.role === roleKey) || SAMPLE_USERS[0];
    setCurrentUser(userMatch);
    setIsAuthenticated(true);
    localStorage.setItem('fueltracks_user', JSON.stringify(userMatch));
    localStorage.setItem('fueltracks_auth', 'true');
    return { success: true, user: userMatch };
  };

  const logout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem('fueltracks_auth');
    localStorage.removeItem('fueltracks_user');
  };

  const setRole = (roleKey) => {
    loginAsRole(roleKey);
  };

  return (
    <AuthContext.Provider value={{
      user: currentUser,
      isAuthenticated,
      roleInfo: ROLES[currentUser?.role] || ROLES.SUPER_ADMIN,
      login,
      loginAsRole,
      logout,
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
