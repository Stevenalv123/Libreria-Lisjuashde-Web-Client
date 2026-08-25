import { useApp } from './context/AppContext';
import Header from './components/Header';
import Toast from './components/Toast';
import StoreView from './components/store/StoreView';
import PrintsView from './components/prints/PrintsView';
import AccessView from './components/account/AccessView';
import CartModal from './components/modals/CartModal';
import OrderDetailModal from './components/modals/OrderDetailModal';
import ConfirmModal from './components/modals/ConfirmModal';
import AccessGate from './components/account/AccessGate';

export default function App() {
  const { currentView, hasAccess, authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <i className="fa-solid fa-spinner fa-spin text-4xl text-indigo-600"></i>
          <p className="text-sm text-slate-500 font-medium">Cargando Librería Lisjuashde...</p>
        </div>
      </div>
    );
  }

  // Forced access: user must log in or continue as guest before browsing.
  if (!hasAccess) {
    return (
      <>
        <AccessGate />
        <Toast />
      </>
    );
  }

  return (
    <>
      <Header />

      <main className="flex-1 overflow-y-auto">
        {currentView === 'store' && <StoreView />}
        {currentView === 'prints' && <PrintsView />}
        {currentView === 'access' && <AccessView />}
      </main>

      {/* Modals */}
      <CartModal />
      <OrderDetailModal />
      <ConfirmModal />
      <Toast />
    </>
  );
}
