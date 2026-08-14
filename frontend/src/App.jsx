import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ImeiJourneyDrawer from './components/ImeiJourneyDrawer';
import BarcodeScannerModal from './components/BarcodeScannerModal';

import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import PurchaseUploadPage from './pages/PurchaseUploadPage';
import InstallationPage from './pages/InstallationPage';
import CustomerCrmPage from './pages/CustomerCrmPage';
import DeviceTypesPage from './pages/DeviceTypesPage';
import ReportsPage from './pages/ReportsPage';
import UserManagementPage from './pages/UserManagementPage';
import MobileAppView from './pages/MobileAppView';

function MainLayout() {
  const { isMobileMode } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Drawer & Scanner States
  const [traceDrawerOpen, setTraceDrawerOpen] = useState(false);
  const [traceImei, setTraceImei] = useState('');

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerCallback, setScannerCallback] = useState(null);

  const openTraceDrawer = (imeiToTrace = '') => {
    setTraceImei(imeiToTrace);
    setTraceDrawerOpen(true);
  };

  const openScannerWithCallback = (callbackFn) => {
    setScannerCallback(() => callbackFn);
    setScannerOpen(true);
  };

  const handleScannedComplete = (scannedList, actionType) => {
    if (scannerCallback) {
      scannerCallback(scannedList);
      setScannerCallback(null);
    } else if (actionType === 'INSTALL') {
      setActiveTab('installations');
    }
  };

  const renderActiveTab = () => {
    if (isMobileMode || activeTab === 'mobile') {
      return (
        <MobileAppView
          onOpenScannerWithCallback={openScannerWithCallback}
          onOpenTraceDrawer={openTraceDrawer}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage onOpenTraceDrawer={openTraceDrawer} onNavigateTab={setActiveTab} />;
      case 'inventory':
        return <InventoryPage onOpenTraceDrawer={openTraceDrawer} />;
      case 'upload':
        return <PurchaseUploadPage onUploadSuccess={() => setActiveTab('inventory')} />;
      case 'installations':
        return <InstallationPage onOpenScannerWithCallback={openScannerWithCallback} onOpenTraceDrawer={openTraceDrawer} />;
      case 'customers':
        return <CustomerCrmPage onOpenTraceDrawer={openTraceDrawer} />;
      case 'types':
        return <DeviceTypesPage />;
      case 'reports':
        return <ReportsPage />;
      case 'users':
        return <UserManagementPage />;
      default:
        return <DashboardPage onOpenTraceDrawer={openTraceDrawer} onNavigateTab={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      
      {/* Top Navigation Header */}
      <Header
        onOpenScanner={() => openScannerWithCallback(null)}
        onOpenTraceDrawer={openTraceDrawer}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar (Hidden in Mobile Mode) */}
        {!isMobileMode && (
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        )}

        {/* Content Area */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto max-w-7xl mx-auto w-full">
          {renderActiveTab()}
        </main>

      </div>

      {/* Global IMEI Journey Trace Drawer */}
      <ImeiJourneyDrawer
        isOpen={traceDrawerOpen}
        onClose={() => setTraceDrawerOpen(false)}
        initialImei={traceImei}
      />

      {/* Global Barcode Camera Scanner Modal */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScannedComplete={handleScannedComplete}
      />

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
