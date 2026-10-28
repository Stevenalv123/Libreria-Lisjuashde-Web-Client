import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Single-company storefront. Empresa fixed by env (defaults to 1).
const EMPRESA_ID = parseInt(import.meta.env.VITE_LIBRERIA_EMPRESA_ID || '1', 10);
const GUEST_KEY = 'libreria_guest';
const SUCURSAL_KEY = 'libreria_sucursal';

// Print pricing convention (NIO / C$) — matches admin service products.
const PRINT_PRICE = { bn: 1, color: 5 };

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  // ===== Global state =====
  const [baseProducts, setBaseProducts] = useState([]);
  const [categories, setCategories] = useState(['Todos']);
  // ===== Sucursales (tiendas físicas) =====
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState(() => {
    try { const v = localStorage.getItem(SUCURSAL_KEY); return v ? parseInt(v, 10) : null; } catch { return null; }
  });
  const [stockSucursalMap, setStockSucursalMap] = useState(null); // null = stock global (sin sucursal elegida)
  const [cart, setCart] = useState([]);

  // ===== Descuentos / promociones =====
  const [descuentos, setDescuentos] = useState([]);
  // Mapas de aplicación: descuento -> productos / categorías
  const [descuentoProductos, setDescuentoProductos] = useState([]); // [{ id_descuento, id_producto }]
  const [descuentoCategorias, setDescuentoCategorias] = useState([]); // [{ id_descuento, categoria_nombre }]
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

  // ===== Login modal (shown when unauthenticated user tries cart/prints) =====
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const pendingCartItem = useRef(null);   // product id to add after login
  const pendingNavigation = useRef(null); // view to navigate to after login

  const openLoginModal = useCallback((productId = null, targetView = null) => {
    pendingCartItem.current = productId;
    pendingNavigation.current = targetView;
    setLoginModalOpen(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    pendingCartItem.current = null;
    pendingNavigation.current = null;
    setLoginModalOpen(false);
  }, []);

  // ===== Modals =====
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [orderModal, setOrderModal] = useState({ open: false, order: null });
  const viewOrderDetails = useCallback((order) => setOrderModal({ open: true, order }), []);
  const closeOrderModal = useCallback(() => setOrderModal({ open: false, order: null }), []);

  // ===== Confirmación de orden (muestra el número de orden en grande) =====
  const [orderConfirmation, setOrderConfirmation] = useState(null); // { numeroOrden, tipo, precio, nombre }
  const closeOrderConfirmation = useCallback(() => setOrderConfirmation(null), []);

  const isSupabaseConfigured = useCallback(() => {
    if (supabase) return true;
    showToast('Configura la URL y la clave anónima en el archivo .env.', 'error');
    return false;
  }, [showToast]);

  // ===== Access gate (kept for account view checks) =====
  const hasAccess = !!currentProfile || !!guestInfo;

  // Stock efectivo: si hay una sucursal elegida, el stock mostrado es el de esa sucursal.
  const products = useMemo(() => {
    if (!stockSucursalMap) return baseProducts;
    return baseProducts.map((p) => ({ ...p, stock: stockSucursalMap[p.id] ?? 0 }));
  }, [baseProducts, stockSucursalMap]);

  // Sucursal actualmente seleccionada (objeto completo)
  const sucursalActual = useMemo(
    () => sucursales.find((s) => s.id === sucursalId) || null,
    [sucursales, sucursalId]
  );

  // ===== productsRef: always-current reference to avoid stale closure in effects =====
  const productsRef = useRef([]);
  useEffect(() => { productsRef.current = products; }, [products]);

  // ===== View switching =====
  const switchView = useCallback((view) => {
    // 'access' view requires login
    if (view === 'access' && !currentProfile && !guestInfo) {
      openLoginModal(null, 'access');
      return;
    }
    setCurrentView(view);
  }, [currentProfile, guestInfo, openLoginModal]);

  // ===== Execute pending action after login/guest =====
  useEffect(() => {
    if (currentProfile || guestInfo) {
      // Navigate to pending view
      if (pendingNavigation.current) {
        const nav = pendingNavigation.current;
        pendingNavigation.current = null;
        setCurrentView(nav);
      }
      // Add pending cart item
      if (pendingCartItem.current) {
        const id = pendingCartItem.current;
        pendingCartItem.current = null;
        const product = productsRef.current.find((p) => p.id === id);
        if (product && product.stock > 0) {
          setCart((prev) => {
            const existing = prev.find((item) => item.id === id);
            if (existing) {
              if (existing.quantity < product.stock) {
                return prev.map((item) => item.id === id ? { ...item, quantity: item.quantity + 1 } : item);
              }
              return prev;
            }
            return [...prev, { ...product, quantity: 1 }];
          });
          showToast(`¡Añadido al carrito: ${product.name}!`);
          setCartModalOpen(true);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile, guestInfo]);

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
      setBaseProducts(mapped);

      // Build category list dynamically from available products.
      const cats = Array.from(new Set(mapped.map((p) => p.category).filter(Boolean))).sort();
      setCategories(['Todos', ...cats]);
    } catch (err) {
      console.error('loadProducts exception:', err);
    }
  }, []);

  // ===== Sucursales + stock por sucursal =====
  const loadSucursales = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('sucursales')
        .select('id, nombre, direccion, telefono')
        .eq('id_empresa', EMPRESA_ID)
        .eq('estado', true)
        .order('id', { ascending: true });
      if (error) { console.warn('loadSucursales error:', error.message || error); return; }
      setSucursales(data || []);
    } catch (err) {
      console.error('loadSucursales exception:', err);
    }
  }, []);

  const loadStockSucursal = useCallback(async (idSuc) => {
    if (!supabase || !idSuc) { setStockSucursalMap(null); return; }
    try {
      const { data, error } = await supabase
        .from('v_stock_sucursal')
        .select('id_producto, stock')
        .eq('id_sucursal', idSuc);
      if (error) { console.warn('loadStockSucursal error:', error.message || error); setStockSucursalMap(null); return; }
      const map = {};
      (data || []).forEach((r) => { map[r.id_producto] = r.stock || 0; });
      setStockSucursalMap(map);
    } catch (err) {
      console.error('loadStockSucursal exception:', err);
      setStockSucursalMap(null);
    }
  }, []);

  const setSucursal = useCallback((id) => {
    const parsed = id ? parseInt(id, 10) : null;
    setSucursalId(parsed);
    try {
      if (parsed) localStorage.setItem(SUCURSAL_KEY, String(parsed));
      else localStorage.removeItem(SUCURSAL_KEY);
    } catch { /* ignore */ }
  }, []);

  // Al cambiar la sucursal elegida, recargamos el stock de esa sucursal.
  useEffect(() => {
    loadStockSucursal(sucursalId);
  }, [sucursalId, loadStockSucursal]);

  // ===== Load descuentos (promociones activas) =====
  const loadDescuentos = useCallback(async () => {
    if (!supabase) return;
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('descuentos')
        .select('*')
        .eq('id_empresa', EMPRESA_ID)
        .eq('activo', true)
        .or(`fecha_inicio.is.null,fecha_inicio.lte.${nowIso}`)
        .or(`fecha_fin.is.null,fecha_fin.gte.${nowIso}`)
        .order('valor', { ascending: false });
      if (error) { console.warn('loadDescuentos error:', error.message || error); return; }

      const activos = data || [];
      setDescuentos(activos);

      if (activos.length === 0) {
        setDescuentoProductos([]);
        setDescuentoCategorias([]);
        return;
      }

      const ids = activos.map((d) => d.id);

      // Relaciones producto/categoría (solo para descuentos específicos)
      const [{ data: dp }, { data: dc }] = await Promise.all([
        supabase.from('descuento_productos').select('id_descuento,id_producto').in('id_descuento', ids),
        supabase.from('descuento_categorias').select('id_descuento,categoria_nombre').in('id_descuento', ids),
      ]);
      setDescuentoProductos(dp || []);
      setDescuentoCategorias(dc || []);
    } catch (err) {
      console.error('loadDescuentos exception:', err);
    }
  }, []);

  // Determina si un descuento aplica a un producto dado.
  const descuentoAplica = useCallback((d, productId, categoryName) => {
    const aplica = d.aplica_a || 'todos';
    if (aplica === 'todos') return true;
    if (aplica === 'producto') {
      return descuentoProductos.some((r) => r.id_descuento === d.id && r.id_producto === productId);
    }
    if (aplica === 'categoria') {
      return descuentoCategorias.some(
        (r) => r.id_descuento === d.id && (r.categoria_nombre || '').toLowerCase() === (categoryName || '').toLowerCase()
      );
    }
    return false;
  }, [descuentoProductos, descuentoCategorias]);

  // Devuelve el mejor descuento para un producto, o null.
  // { descuento, precioFinal, ahorro, label } — requiere el precio original.
  const getDescuentoParaProducto = useCallback((productId, categoryName, precioOriginal) => {
    if (!descuentos || descuentos.length === 0) return null;

    const precio = Number(precioOriginal);
    // Si no se pasa precio (uso solo para label), buscamos igual el descuento aplicable.
    const aplicables = descuentos.filter((d) => descuentoAplica(d, productId, categoryName));
    if (aplicables.length === 0) return null;

    // Elegimos el que genera mayor ahorro sobre este precio.
    let mejor = null;
    for (const d of aplicables) {
      let ahorro = 0;
      if (d.tipo === 'porcentaje') {
        ahorro = (precio || 0) * (Number(d.valor) / 100);
      } else { // monto_fijo
        ahorro = Number(d.valor);
      }
      if (precio) ahorro = Math.min(ahorro, precio); // nunca negativo
      if (!mejor || ahorro > mejor.ahorro) {
        const label = d.tipo === 'porcentaje'
          ? `${Number(d.valor)}% OFF`
          : `C$${Number(d.valor).toFixed(2)} OFF`;
        mejor = { descuento: d, ahorro, label };
      }
    }
    if (!mejor) return null;

    const precioFinal = precio ? Math.max(precio - mejor.ahorro, 0) : null;
    return { descuento: mejor.descuento, precioFinal, ahorro: mejor.ahorro, label: mejor.label };
  }, [descuentos, descuentoAplica]);

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
      setLoginModalOpen(false);
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
    setLoginModalOpen(false);
    showToast('¡Bienvenido/a de nuevo!');
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
    setLoginModalOpen(false);
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
    // Si no hay sesión ni modo invitado → pedir login primero
    if (!currentProfile && !guestInfo) {
      openLoginModal(id, null);
      return;
    }
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
  }, [products, showToast, currentProfile, guestInfo, openLoginModal]);

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

    // Calcula el precio efectivo de cada item aplicando el descuento vigente (si existe).
    const precioEfectivo = (item) => {
      const info = getDescuentoParaProducto(item.id, item.category, item.price);
      return info && info.precioFinal != null ? info.precioFinal : item.price;
    };

    const total = cart.reduce((sum, item) => sum + (precioEfectivo(item) * item.quantity), 0);
    const metodo = paymentMethod === 'tarjeta' ? 'Tarjeta' : 'Efectivo en local';
    const entrega = tipoEntrega === 'domicilio' ? 'Domicilio' : 'Recoger en tienda';
    const emailCliente = email?.trim() || currentProfile?.email || '';
    // Copia de los items para la factura (el carrito se vacía tras el checkout).
    const itemsFactura = cart.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      price: precioEfectivo(i),
    }));

    let numeroOrden = null;
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
        id_sucursal: sucursalId || null,
      };
      const itemsPayload = cart.map((i) => ({
        id_producto: i.id,
        nombre: i.name,
        cantidad: i.quantity,
        precio_unitario: precioEfectivo(i),
        imagen: i.image || '',
      }));

      const { data: rpcData, error: rpcError } = await supabase.rpc('crear_pedido_web', {
        p_pedido: pedidoPayload,
        p_items: itemsPayload,
      });
      if (rpcError) throw rpcError;

      // La función ahora devuelve { id_pedido, numero_orden }
      numeroOrden = rpcData?.numero_orden || (rpcData?.id_pedido ? `P-${String(rpcData.id_pedido).padStart(4, '0')}` : null);

      if (currentProfile?.id && loadMyOrdersRef.current) await loadMyOrdersRef.current();
    } catch (err) {
      console.error('checkout error:', err);
      showToast(err.message || 'Error guardando el pedido', 'error');
      return false;
    }

    setCart([]);
    setCartModalOpen(false);
    setOrderConfirmation({
      numeroOrden,
      tipo: 'pedido',
      precio: total,
      nombre: name.trim(),
      email: emailCliente,
      telefono: phone.trim(),
      metodo_pago: metodo,
      tipo_entrega: entrega,
      notas: notas?.trim() || '',
      sucursal: sucursalActual ? sucursalActual.nombre : null,
      items: itemsFactura,
      fecha: new Date(),
    });
    return { ok: true, numeroOrden, tipo: 'pedido' };
  }, [cart, currentProfile, showToast, isSupabaseConfigured, getDescuentoParaProducto, sucursalId, sucursalActual]);

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

    let numeroOrden = null;
    try {
      const userId = currentProfile?.id || null;
      const { data: insertData, error: dbErr } = await supabase
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
        }])
        .select('id_trabajo, numero_orden')
        .single();
      if (dbErr) throw dbErr;
      numeroOrden = insertData?.numero_orden || (insertData?.id_trabajo ? `I-${String(insertData.id_trabajo).padStart(4, '0')}` : null);
    } catch (err) {
      console.error('submitPrintOrder error:', err);
      showToast(err.message || 'Error guardando el trabajo de impresión', 'error');
      return false;
    }

    if (currentProfile?.id && loadMyOrdersRef.current) await loadMyOrdersRef.current();
    setCurrentView('store');
    setOrderConfirmation({ numeroOrden, tipo: 'impresion', precio: precioEstimado, nombre: name.trim() });
    return { ok: true, numeroOrden, tipo: 'impresion', precio: precioEstimado, nombre: name.trim() };
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
      await loadSucursales();
      await loadDescuentos();

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
    // sucursales
    sucursales, sucursalId, sucursalActual, setSucursal, loadSucursales,
    // descuentos / promociones
    descuentos, loadDescuentos, getDescuentoParaProducto,
    // toast + confirm
    toast, showToast,
    confirmState, openConfirmModal, resolveConfirm,
    // login modal
    loginModalOpen, openLoginModal, closeLoginModal,
    // modals
    cartModalOpen, setCartModalOpen,
    orderModal, viewOrderDetails, closeOrderModal,
    orderConfirmation, closeOrderConfirmation,
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
