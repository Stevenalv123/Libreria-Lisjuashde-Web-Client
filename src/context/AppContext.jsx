import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Single-company storefront. Empresa fixed by env (defaults to 1).
const EMPRESA_ID = parseInt(import.meta.env.VITE_LIBRERIA_EMPRESA_ID || '1', 10);
const GUEST_KEY = 'libreria_guest';

// Print pricing convention (NIO / C$) — matches admin service products.
const PRINT_PRICE = { bn: 1, color: 5 };

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  // ===== Global state =====
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['Todos']);
  const [cart, setCart] = useState([]);
  const [currentCategory, setCurrentCategory] = useState('Todos');
  const [currentView, setCurrentView] = useState('store');

  // Auth / access
  const [currentProfile, setCurrentProfile] = useState(null); // logged-in user profile
  const [guestInfo, setGuestInfo] = useState(null); // { nombre, telefono }
  const [authLoading, setAuthLoading] = useState(true);

  // ===== Toast =====
  const [toast, setToast] = useState({ message: '', type: 'success', visible: false });
  const toastTimer = useRef(null);
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, visible: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 3000);
  }, []);

  // ===== Confirm modal (returns Promise<boolean>) =====
  const [confirmState, setConfirmState] = useState({ visible: false, message: '' });
  const confirmResolver = useRef(null);
  const openConfirmModal = useCallback((message) => {
    return new Promise((resolve) => {
      confirmResolver.current = resolve;
      setConfirmState({ visible: true, message });
    });
  }, []);
  const resolveConfirm = useCallback((value) => {
    setConfirmState({ visible: false, message: '' });
    if (confirmResolver.current) {
      confirmResolver.current(value);
      confirmResolver.current = null;
    }
  }, []);

  // ===== Modals =====
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [orderModal, setOrderModal] = useState({ open: false, order: null });
  const viewOrderDetails = useCallback((order) => setOrderModal({ open: true, order }), []);
  const closeOrderModal = useCallback(() => setOrderModal({ open: false, order: null }), []);

  const isSupabaseConfigured = useCallback(() => {
    if (supabase) return true;
    showToast('Configura la URL y la clave anónima en el archivo .env.', 'error');
    return false;
  }, [showToast]);

  // ===== Access gate =====
  const hasAccess = !!currentProfile || !!guestInfo;

  // ===== View switching =====
  const switchView = useCallback((view) => {
    setCurrentView(view);
  }, []);

  // ===== Load products from storefront view =====
  const loadProducts = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('vw_productos_web')
        .select('id_producto,id_empresa,nombre,descripcion,precio_venta,stock,imagen_principal,materia,id_categoria,categoria')
        .eq('id_empresa', EMPRESA_ID)
        .order('nombre', { ascending: true });
      if (error) { console.warn('loadProducts error:', error.message || error); return; }
      const mapped = (data || []).map((p) => ({
        id: p.id_producto,
        name: p.nombre,
        desc: p.descripcion || '',
        price: parseFloat(p.precio_venta || 0),
        stock: p.stock || 0,
        image: p.imagen_principal || 'https://placehold.co/300x300/png?text=Util',
        materia: p.materia || '',
        category_id: p.id_categoria,
        category: p.categoria || 'General',
      }));
      setProducts(mapped);

      // Build category list dynamically from available products.
      const cats = Array.from(new Set(mapped.map((p) => p.category).filter(Boolean))).sort();
      setCategories(['Todos', ...cats]);
    } catch (err) {
      console.error('loadProducts exception:', err);
    }
  }, []);

  // ===== Auth =====
  const loadMyOrdersRef = useRef(null);

  const loadCurrentProfile = useCallback(async (user) => {
    try {
      const { data: perfil, error } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, email, telefono, rol')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      const profileObj = {
        id: user.id,
        email: perfil?.email || user.email,
        full_name: perfil?.nombre_completo || user.email,
        nombre_completo: perfil?.nombre_completo || user.email,
        telefono: perfil?.telefono || '',
        rol: perfil?.rol || 'cliente',
      };
      setCurrentProfile(profileObj);
      return profileObj;
    } catch (err) {
      console.warn('loadCurrentProfile fallback:', err.message || err);
      const profileObj = {
        id: user.id,
        email: user.email,
        full_name: (user.user_metadata && user.user_metadata.nombre_completo) || user.email,
        nombre_completo: (user.user_metadata && user.user_metadata.nombre_completo) || user.email,
        telefono: '',
        rol: 'cliente',
      };
      setCurrentProfile(profileObj);
      return profileObj;
    }
  }, []);

  const handleRegistration = useCallback(async ({ fullName, email, password, confirmation, phone }) => {
    if (!isSupabaseConfigured()) return;
    if (password !== confirmation) { showToast('Las contraseñas no coinciden.', 'error'); return; }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre_completo: fullName, telefono: phone || '', rol: 'cliente' } },
    });
    if (error) { showToast(error.message, 'error'); return; }
    if (data.session) {
      await loadCurrentProfile(data.user);
      clearGuest();
      showToast('¡Cuenta creada! Sesión iniciada correctamente.');
    } else {
      showToast('Cuenta creada. Revisa tu correo para confirmar la cuenta.');
    }
    return data;
  }, [isSupabaseConfigured, showToast, loadCurrentProfile]);

  const handleLogin = useCallback(async ({ email, password }) => {
    if (!isSupabaseConfigured()) return;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { showToast(error.message, 'error'); return; }
    await loadCurrentProfile(data.user);
    clearGuest();
    showToast('Sesión iniciada correctamente.');
    return data;
  }, [isSupabaseConfigured, showToast, loadCurrentProfile]);

  const handleGoogleSignIn = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
      if (error) { showToast(error.message || 'Error iniciando sesión con Google', 'error'); return; }
      if (data && data.url) window.location.href = data.url;
    } catch (err) {
      console.error('handleGoogleSignIn error:', err);
      showToast('Error al iniciar sesión con Google.', 'error');
    }
  }, [isSupabaseConfigured, showToast]);

  const handleLogout = useCallback(async () => {
    if (supabase) {
      try { await supabase.auth.signOut(); }
      catch (err) { console.error('Error al cerrar sesión:', err.message || err); }
    }
    setCurrentProfile(null);
    setCurrentView('store');
    showToast('Sesión cerrada.');
  }, [showToast]);

  // ===== Guest mode =====
  const clearGuest = () => {
    try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
    setGuestInfo(null);
  };

  const enterGuest = useCallback(({ nombre, telefono }) => {
    if (!nombre || !nombre.trim()) { showToast('Ingresa tu nombre para continuar', 'error'); return false; }
    if (!telefono || !telefono.trim()) { showToast('Ingresa tu teléfono para continuar', 'error'); return false; }
    const info = { nombre: nombre.trim(), telefono: telefono.trim() };
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(info)); } catch { /* ignore */ }
    setGuestInfo(info);
    showToast(`¡Bienvenido/a, ${info.nombre}!`);
    return true;
  }, [showToast]);

  const exitGuest = useCallback(() => {
    clearGuest();
    setCurrentView('store');
    showToast('Has salido del modo invitado.');
  }, [showToast]);

  // ===== Cart =====
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const addToCart = useCallback((id) => {
    const product = products.find((p) => p.id === id);
    if (!product || product.stock <= 0) { showToast('Producto sin stock disponible', 'error'); return; }
    setCart((prev) => {
      const existing = prev.find((item) => item.id === id);
      if (existing) {
        if (existing.quantity < product.stock) {
          return prev.map((item) => item.id === id ? { ...item, quantity: item.quantity + 1 } : item);
        }
        showToast('No hay más stock disponible', 'error');
        return prev;
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    showToast(`Añadido: ${product.name}`);
  }, [products, showToast]);

  const changeQty = useCallback((id, delta) => {
    const product = products.find((p) => p.id === id);
    setCart((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item) return prev;
      let newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter((i) => i.id !== id);
      if (product && newQty > product.stock) {
        newQty = product.stock;
        showToast('Límite de stock alcanzado', 'error');
      }
      return prev.map((i) => i.id === id ? { ...i, quantity: newQty } : i);
    });
  }, [products, showToast]);

  const removeFromCart = useCallback((id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ===== Checkout -> pedidos_web =====
  const checkoutOrder = useCallback(async ({ name, phone, email, paymentMethod, tipoEntrega, notas }) => {
    if (cart.length === 0) { showToast('Agrega productos antes de reservar', 'error'); return false; }
    if (!name || !name.trim()) { showToast('Ingresa el nombre del cliente', 'error'); return false; }
    if (!phone || !phone.trim()) { showToast('Ingresa un teléfono de contacto', 'error'); return false; }
    if (!isSupabaseConfigured()) return false;

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const metodo = paymentMethod === 'tarjeta' ? 'Tarjeta' : 'Efectivo en local';
    const entrega = tipoEntrega === 'domicilio' ? 'Domicilio' : 'Recoger en tienda';

    try {
      const pedidoPayload = {
        id_empresa: EMPRESA_ID,
        nombre_cliente: name.trim(),
        telefono: phone.trim(),
        email: email?.trim() || currentProfile?.email || '',
        total,
        metodo_pago: metodo,
        tipo_entrega: entrega,
        notas: notas?.trim() || '',
      };
      const itemsPayload = cart.map((i) => ({
        id_producto: i.id,
        nombre: i.name,
        cantidad: i.quantity,
        precio_unitario: i.price,
        imagen: i.image || '',
      }));

      const { error: rpcError } = await supabase.rpc('crear_pedido_web', {
        p_pedido: pedidoPayload,
        p_items: itemsPayload,
      });
      if (rpcError) throw rpcError;

      if (currentProfile?.id && loadMyOrdersRef.current) await loadMyOrdersRef.current();
    } catch (err) {
      console.error('checkout error:', err);
      showToast(err.message || 'Error guardando el pedido', 'error');
      return false;
    }

    setCart([]);
    setCartModalOpen(false);
    showToast('¡Pedido reservado! Te avisaremos cuando esté listo.');
    return true;
  }, [cart, currentProfile, showToast, isSupabaseConfigured]);

  // ===== Print order -> trabajos_impresion =====
  const submitPrintOrder = useCallback(async ({ name, phone, mode, copies, paperSize, notes, file }) => {
    if (!name || !name.trim()) { showToast('Ingresa tu nombre para retirar', 'error'); return false; }
    if (!phone || !phone.trim()) { showToast('Ingresa tu teléfono de contacto', 'error'); return false; }
    if (!file) { showToast('Selecciona un archivo para imprimir', 'error'); return false; }
    if (!isSupabaseConfigured()) return false;

    const copiesNum = parseInt(copies, 10) || 1;
    const modoColor = mode === 'color' ? 'color' : 'bn';
    const precioEstimado = (modoColor === 'color' ? PRINT_PRICE.color : PRINT_PRICE.bn) * copiesNum;

    let storagePath = null;
    const fileName = file.name;
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      storagePath = `prints/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('print-files').upload(storagePath, file, { upsert: false });
      if (upErr) { console.warn('Storage upload failed:', upErr.message); showToast('No se pudo subir el archivo. Intenta de nuevo.', 'error'); return false; }
    } catch (err) {
      console.warn('Upload error:', err);
      showToast('Error subiendo el archivo.', 'error');
      return false;
    }

    try {
      const userId = currentProfile?.id || null;
      const { error: dbErr } = await supabase
        .from('trabajos_impresion')
        .insert([{
          id_empresa: EMPRESA_ID,
          user_id: userId,
          nombre_cliente: name.trim(),
          telefono: phone.trim(),
          archivo_nombre: fileName,
          storage_path: storagePath,
          modo_color: modoColor,
          copias: copiesNum,
          tamano_papel: paperSize,
          notas: notes?.trim() || null,
          precio_estimado: precioEstimado,
          estado: 'Pendiente',
        }]);
      if (dbErr) throw dbErr;
    } catch (err) {
      console.error('submitPrintOrder error:', err);
      showToast(err.message || 'Error guardando el trabajo de impresión', 'error');
      return false;
    }

    if (currentProfile?.id && loadMyOrdersRef.current) await loadMyOrdersRef.current();
    showToast(`¡Trabajo enviado! Costo estimado: C$${precioEstimado.toFixed(2)}. Retira con: ${name.trim()}`);
    setCurrentView('store');
    return true;
  }, [currentProfile, showToast, isSupabaseConfigured]);

  // ===== Initialization =====
  useEffect(() => {
    let mounted = true;
    (async () => {
      // Restore guest session
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        if (raw) setGuestInfo(JSON.parse(raw));
      } catch { /* ignore */ }

      if (!supabase) { setAuthLoading(false); return; }

      await loadProducts();

      try {
        supabase.auth.onAuthStateChange(async (_event, session) => {
          if (!mounted) return;
          if (session && session.user) {
            await loadCurrentProfile(session.user);
          } else {
            setCurrentProfile(null);
          }
        });
        const { data } = await supabase.auth.getSession();
        const session = data ? data.session : null;
        if (session && session.user) {
          await loadCurrentProfile(session.user);
        }
      } catch (err) {
        console.error('initializeAuth error:', err);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = {
    // state
    products,
    categories,
    cart, cartCount,
    currentCategory, setCurrentCategory,
    currentView, switchView,
    // access
    currentProfile, guestInfo, hasAccess, authLoading,
    enterGuest, exitGuest,
    // data loaders
    loadProducts,
    // toast + confirm
    toast, showToast,
    confirmState, openConfirmModal, resolveConfirm,
    // modals
    cartModalOpen, setCartModalOpen,
    orderModal, viewOrderDetails, closeOrderModal,
    // auth
    handleRegistration, handleLogin, handleLogout, handleGoogleSignIn,
    loadMyOrdersRef,
    // cart actions
    addToCart, changeQty, removeFromCart, checkoutOrder,
    // prints
    submitPrintOrder,
    // supabase
    supabase,
    EMPRESA_ID,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
