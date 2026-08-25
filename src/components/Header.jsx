import { useApp } from '../context/AppContext';

export default function Header() {
  const { currentView, switchView, currentProfile, guestInfo, cartCount, setCartModalOpen, handleLogout, exitGuest } = useApp();

  const displayName = currentProfile?.nombre_completo || guestInfo?.nombre || 'Invitado';
  const firstName = displayName.split(' ')[0];

  const tabClass = (view) =>
    view === currentView
      ? 'px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-white text-indigo-700 shadow-sm flex items-center space-x-2'
      : 'px-3 py-1.5 rounded-lg text-sm font-medium transition-all text-indigo-100 hover:text-white flex items-center space-x-2';

  return (
    <header className="bg-indigo-600 text-white shadow-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-white rounded-xl shadow flex items-center justify-center w-10 h-10 overflow-hidden">
            <img src="img/logo.png" alt="Logotipo de Librería Lisjuashde" className="w-full h-full object-contain p-1" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Librería Lisjuashde</h1>
            <p className="text-xs text-indigo-200 hidden sm:block">Materiales, Impresiones y Útiles</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Mode Switcher Buttons */}
          <div className="bg-indigo-700/60 p-1 rounded-xl flex space-x-1 border border-indigo-500/30">
            <button onClick={() => switchView('store')} className={tabClass('store')}>
              <i className="fa-solid fa-store"></i>
              <span className="hidden sm:inline">Tienda</span>
            </button>
            <button onClick={() => switchView('prints')} className={tabClass('prints')}>
              <i className="fa-solid fa-print"></i>
              <span className="hidden sm:inline">Impresiones</span>
            </button>
            <button onClick={() => switchView('access')} className={tabClass('access')}>
              <i className="fa-solid fa-user"></i>
              <span className="hidden sm:inline">Mi cuenta</span>
            </button>
          </div>

          {/* Account indicator */}
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="text-indigo-100">Hola, <span className="font-bold text-white">{firstName}</span></span>
            {currentProfile ? (
              <button onClick={handleLogout} title="Cerrar sesión" className="bg-indigo-500/50 hover:bg-indigo-500 px-2 py-1.5 rounded-lg transition-all">
                <i className="fa-solid fa-right-from-bracket"></i>
              </button>
            ) : (
              <button onClick={exitGuest} title="Salir del modo invitado" className="bg-indigo-500/50 hover:bg-indigo-500 px-2 py-1.5 rounded-lg transition-all">
                <i className="fa-solid fa-right-from-bracket"></i>
              </button>
            )}
          </div>

          {/* Cart Button (Visible only in store) */}
          {currentView === 'store' && (
            <button onClick={() => setCartModalOpen(true)} className="relative bg-indigo-500 hover:bg-indigo-400 text-white p-2.5 rounded-xl transition-all flex items-center justify-center">
              <i className="fa-solid fa-cart-shopping text-lg"></i>
              <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold shadow">{cartCount}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
