/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Cliente, Movimiento, TipoCliente, EstadoCliente, MarcaCatalogo, ConfiguracionListasDesplegables, PedidoVenta, getTotalCobradoVenta } from "../types";
import { firestoreService } from "../lib/firebase";
import { construirPedidos } from "../lib/lecturasVentas";
import { mensajeError } from "../lib/errores";
import ClienteModal from "./ClienteModal";
import ConfiguracionModuloModal from "./ConfiguracionModuloModal";
import {
  Users,
  Search,
  Plus,
  Filter,
  UserCheck,
  UserX,
  Edit2,
  Eye,
  Phone,
  Instagram,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  ShoppingBag,
  Clock,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  MessageCircle,
  Tag,
  FileText,
  X,
  ArrowUpRight,
  Trash2,
  Settings
} from "lucide-react";

interface ClientesProps {
  preselectedClienteId?: string;
  onNavigateToVenta?: (clienteId?: string) => void;
  onNavigateToHistory?: (clienteId?: string) => void;
  onNavigateToPedidos?: () => void;
}

export default function Clientes({ preselectedClienteId, onNavigateToVenta, onNavigateToHistory, onNavigateToPedidos }: ClientesProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [marcas, setMarcas] = useState<MarcaCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and filters
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [estadoFilter, setEstadoFilter] = useState<string>("todos");

  // Modal create/edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [listasConfig, setListasConfig] = useState<ConfiguracionListasDesplegables | null>(null);

  const loadClientSettings = async () => {
    try { setListasConfig(await firestoreService.getConfiguracionListasDesplegables()); }
    catch (error) { console.warn("No se pudieron cargar los tipos de cliente:", error); }
  };

  useEffect(() => { loadClientSettings(); }, []);
  const [clienteToEdit, setClienteToEdit] = useState<Cliente | null>(null);

  // Detail Drawer / Modal
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [clienteMovimientos, setClienteMovimientos] = useState<Movimiento[]>([]);
  const [clientePedidos, setClientePedidos] = useState<PedidoVenta[]>([]);
  const [loadingMovimientos, setLoadingMovimientos] = useState(false);
  const [clienteDetalleError, setClienteDetalleError] = useState("");
  const [historialError, setHistorialError] = useState("");
  const [detalleClienteId, setDetalleClienteId] = useState("");
  const [detalleVersion, setDetalleVersion] = useState(0);
  const openedFromRouteRef = useRef("");

  // Status toggle in progress ID
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  // Load clients with realtime listener
  useEffect(() => {
    setLoading(true);
    setError(null);

    let isMounted = true;
    const unsub = firestoreService.getClientesRealtime(
      (data) => {
        if (!isMounted) return;
        setClientes(data);
        setLoading(false);
      },
      (err: any) => {
        if (!isMounted) return;
        setLoading(false);
        console.warn("Aviso en clientes:", err);
        setError("No se pudieron consultar los clientes en Firebase. Revisa tu conexión o permisos y vuelve a intentarlo.");
      }
    );

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // Load the brand catalog once for ID-to-name resolution and in-memory search.
  useEffect(() => {
    let isMounted = true;

    firestoreService.getMarcas()
      .then((catalogo) => {
        if (!isMounted) return;
        setMarcas([...catalogo].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })));
      })
      .catch((err) => {
        console.warn("No se pudo cargar el catálogo de marcas para clientes:", err);
        if (isMounted) setMarcas([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const marcasPorId = useMemo(
    () => new Map(marcas.map(marca => [marca.id, marca])),
    [marcas]
  );

  useEffect(() => {
    if (!preselectedClienteId || openedFromRouteRef.current === preselectedClienteId) return;
    const target = clientes.find(cliente => cliente.id === preselectedClienteId);
    if (!target) return;
    openedFromRouteRef.current = preselectedClienteId;
    setSelectedCliente(target);
  }, [clientes, preselectedClienteId]);

  // Fetch client movements when detail drawer is opened
  useEffect(() => {
    if (!selectedCliente?.id) {
      setClienteMovimientos([]);
      setClientePedidos([]);
      return;
    }

    let isMounted = true;
    setLoadingMovimientos(true);
    setClienteDetalleError("");
    setHistorialError("");
    setClienteMovimientos([]);
    setClientePedidos([]);
    setDetalleClienteId(selectedCliente.id);

    Promise.allSettled([
      firestoreService.getMovimientosCliente(selectedCliente.id),
      firestoreService.getVentasCliente(selectedCliente.id)
    ])
      .then(async ([movimientosResult, ventasResult]) => {
        if (!isMounted) return;
        const cId = selectedCliente.id;
        const failedSections: string[] = [];

        if (movimientosResult.status === "fulfilled") {
          setClienteMovimientos(movimientosResult.value.filter(m => m.tipo === "salida"));
        } else {
          console.warn("Error cargando el historial de ventas del cliente:", movimientosResult.reason);
          setClienteMovimientos([]);
          const message = mensajeError(movimientosResult.reason, "No fue posible cargar el historial de ventas del cliente.");
          setHistorialError(message);
          failedSections.push(message);
        }

        if (ventasResult.status === "fulfilled" && movimientosResult.status === "fulfilled") {
          const masterIds = new Set(ventasResult.value.map(venta => venta.id));
          const legacyIds = movimientosResult.value.filter(item => item.venta_id && item.afecta_stock === false && !masterIds.has(item.venta_id))
            .map(item => item.venta_id!);
          try {
            const events = await firestoreService.getEventosVentas(legacyIds);
            if (!isMounted) return;
            const byId = new Map([...movimientosResult.value, ...events].map(item => [item.id, item]));
            setClientePedidos(construirPedidos(ventasResult.value, [...byId.values()]).filter(pedido => pedido.cliente_id === cId));
          } catch (cause) {
            if (!isMounted) return;
            failedSections.push(mensajeError(cause, "No fue posible cargar el seguimiento de los pedidos anteriores."));
          }
        } else {
          setClientePedidos([]);
          if (ventasResult.status === "rejected") {
            console.warn("Error cargando las ventas del cliente:", ventasResult.reason);
            failedSections.push(mensajeError(ventasResult.reason, "No fue posible cargar los pedidos del cliente."));
          }
        }

        setClienteDetalleError([...new Set(failedSections)].join(" "));
      })
      .finally(() => {
        if (isMounted) setLoadingMovimientos(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCliente?.id, detalleVersion]);

  const detalleActual = detalleClienteId === selectedCliente?.id;

  // Client metrics calculated on the fly
  const returnedSaleIds = useMemo(() => new Set(
    clienteMovimientos
      .filter(m => m.subtipo === "reembolso_venta" && m.estado !== "anulado" && m.venta_relacionada_id)
      .map(m => m.venta_relacionada_id as string)
  ), [clienteMovimientos]);

  const groupedSales = useMemo(() => {
    const groups = new Map<string, Movimiento[]>();
    clienteMovimientos.filter(m => !m.subtipo && m.en_papelera !== true).forEach(m => {
      const key = m.venta_id || m.folio || m.id || `${m.sku}-${groups.size}`;
      groups.set(key, [...(groups.get(key) || []), m]);
    });
    return Array.from(groups.values()).map(items => {
      const ordered = [...items].sort((a, b) => (a.venta_partida || 0) - (b.venta_partida || 0));
      const primary = ordered[0];
      const total = typeof primary.venta_total_cobrado === "number"
        ? primary.venta_total_cobrado
        : ordered.reduce((sum, item) => sum + getTotalCobradoVenta(item), 0);
      const saleId = primary.venta_id || "";
      const estado = returnedSaleIds.has(saleId)
        ? "devuelto" as const
        : ordered.every(item => item.estado === "anulado")
          ? "anulado" as const
          : "activo" as const;
      return {
        key: primary.venta_id || primary.folio || primary.id || `${primary.sku}-${primary.fecha}`,
        folio: primary.folio || "Venta",
        fecha: primary.fecha,
        canal: primary.canal_venta_nombre,
        total,
        unidades: ordered.reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0),
        items: ordered,
        estado
      };
    }).sort((a, b) => {
      const toTime = (value: any) => value instanceof Date ? value.getTime() : value?.toDate ? value.toDate().getTime() : new Date(value?.seconds ? value.seconds * 1000 : value).getTime();
      return toTime(b.fecha) - toTime(a.fecha);
    });
  }, [clienteMovimientos, returnedSaleIds]);

  const activeGroupedSales = useMemo(
    () => groupedSales.filter(sale => sale.estado === "activo"),
    [groupedSales]
  );

  const clientMetrics = useMemo(() => {
    const totalComprado = activeGroupedSales.reduce((sum, sale) => sum + sale.total, 0);
    const pedidosPendientes = clientePedidos.filter(pedido => pedido.estado !== "entregado");
    return {
      totalComprado,
      ventasCount: activeGroupedSales.length,
      unidadesCompradas: activeGroupedSales.reduce((sum, sale) => sum + sale.unidades, 0),
      ticketPromedio: activeGroupedSales.length > 0 ? totalComprado / activeGroupedSales.length : 0,
      ultimaCompra: activeGroupedSales[0]?.fecha || null,
      pedidosPendientes: pedidosPendientes.length,
      saldoPendiente: pedidosPendientes.reduce((sum, pedido) => sum + pedido.saldo, 0)
    };
  }, [activeGroupedSales, clientePedidos]);

  // Filtered clients list
  const filteredClientes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const termNoSymbols = term.replace(/[@\s-]/g, "");

    return clientes.filter((c) => {
      // Tipo filter
      if (tipoFilter !== "todos" && c.tipo_cliente !== tipoFilter) {
        return false;
      }
      // Estado filter
      if (estadoFilter !== "todos" && (c.estado || "activo") !== estadoFilter) {
        return false;
      }

      // Search term match across name, instagram, phone, email, city
      if (!term) return true;

      const matchName = c.nombre_normalizado?.includes(term) || c.nombre_completo?.toLowerCase().includes(term);
      const matchIg = c.instagram_normalizado?.includes(termNoSymbols) || c.instagram?.toLowerCase().includes(term);
      const cleanPhone = c.telefono ? String(c.telefono).replace(/\D/g, "") : "";
      const matchPhone = cleanPhone.includes(termNoSymbols) || (c.telefono && c.telefono.includes(term));
      const matchEmail = c.email?.toLowerCase().includes(term);
      const matchCity = c.ciudad?.toLowerCase().includes(term);
      const matchMarca = (c.marcas_favoritas_ids || []).some(id =>
        marcasPorId.get(id)?.nombre.toLocaleLowerCase("es").includes(term)
      );

      return matchName || matchIg || matchPhone || matchEmail || matchCity || matchMarca;
    });
  }, [clientes, searchTerm, tipoFilter, estadoFilter, marcasPorId]);

  const handleToggleEstado = async (cliente: Cliente, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!cliente.id) return;

    const nuevoEstado: EstadoCliente = (cliente.estado || "activo") === "activo" ? "inactivo" : "activo";
    setTogglingId(cliente.id);

    try {
      await firestoreService.toggleClienteEstado(cliente.id, nuevoEstado);
      if (selectedCliente?.id === cliente.id) {
        setSelectedCliente({ ...selectedCliente, estado: nuevoEstado });
      }
    } catch (err) {
      console.error("Error cambiando estado de cliente:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleEnviarPapelera = async (cliente: Cliente, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!cliente.id) return;
    if (!window.confirm(`¿Enviar a ${cliente.nombre_completo} a la Papelera? Podrás restaurarlo después.`)) return;
    setArchivingId(cliente.id);
    try {
      await firestoreService.enviarClientePapelera(cliente.id);
      setClientes(current => current.filter(item => item.id !== cliente.id));
      if (selectedCliente?.id === cliente.id) setSelectedCliente(null);
    } catch (err: any) {
      setError(err?.message || "No se pudo enviar el cliente a la Papelera.");
    } finally {
      setArchivingId(null);
    }
  };

  const openCreateModal = () => {
    setClienteToEdit(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cliente: Cliente, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setClienteToEdit(cliente);
    setIsModalOpen(true);
  };

  const formatWhatsAppLink = (phone?: string) => {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, "");
    if (!clean) return null;
    return `https://wa.me/${clean}`;
  };

  const formatInstagramLink = (ig?: string) => {
    if (!ig) return null;
    const clean = ig.trim().replace(/^@+/, "");
    if (!clean) return null;
    return `https://instagram.com/${clean}`;
  };

  const formatDate = (dateVal: any) => {
    if (!dateVal) return "—";
    const d = dateVal instanceof Date 
      ? dateVal 
      : dateVal.toDate 
        ? dateVal.toDate() 
        : new Date(dateVal.seconds ? dateVal.seconds * 1000 : dateVal);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  };

  const getTipoBadgeStyle = (tipo: TipoCliente) => {
    switch (tipo) {
      case "mayorista":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20";
      case "emprendedor":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20";
      case "minorista":
      default:
        return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20";
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6" id="clientes-page">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-rose-500" />
            Clientes y Contactos
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Gestiona tu cartera de clientes, canales de contacto e historial de salidas y tickets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setIsSettingsOpen(true)} className="px-3 py-2 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-xl font-semibold text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"><Settings className="w-4 h-4" /><span>Configurar</span></button>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold text-xs hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors flex items-center gap-2 shadow-xs shrink-0"
            id="nuevo-cliente-btn"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* Error state with retry */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-800 dark:text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Buscar por nombre, Instagram (@), teléfono o ciudad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9.5 pr-4 py-2.5 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tipo filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline" />
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
          >
            <option value="todos">Todos los tipos</option>
            {listasConfig?.tipos_cliente.filter(item => item.activa).map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
          </select>

          {/* Estado filter */}
          <select
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
          >
            <option value="todos">Todos los estados</option>
            <option value="activo">Solo Activos</option>
            <option value="inactivo">Solo Inactivos</option>
          </select>
        </div>
      </div>

      {/* Main Table or Card List */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-zinc-400">
            <span className="h-7 w-7 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-xs">Cargando catálogo de clientes...</p>
          </div>
        ) : filteredClientes.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                {searchTerm || tipoFilter !== "todos" || estadoFilter !== "todos"
                  ? "No se encontraron clientes con los filtros aplicados"
                  : "Aún no tienes clientes registrados"}
              </p>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                {searchTerm || tipoFilter !== "todos" || estadoFilter !== "todos"
                  ? "Prueba cambiando los términos de búsqueda o restableciendo los filtros."
                  : "Crea tu primer cliente para comenzar a asociar ventas y llevar seguimiento de sus compras."}
              </p>
            </div>
            {!searchTerm && tipoFilter === "todos" && estadoFilter === "todos" && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold rounded-xl mt-2 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Primer Cliente</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Contacto Rápido</th>
                  <th className="py-3 px-4">Ciudad / Canal</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Fecha Alta</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {filteredClientes.map((c) => {
                  const waLink = formatWhatsAppLink(c.telefono);
                  const igLink = formatInstagramLink(c.instagram);
                  const marcasFavoritas = (c.marcas_favoritas_ids || []).map(id => ({
                    id,
                    marca: marcasPorId.get(id)
                  }));

                  return (
                    <tr 
                      key={c.id} 
                      onClick={() => setSelectedCliente(c)}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                    >
                      {/* Cliente nombre & notas preview */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{c.nombre_completo}</span>
                          {c.notas && (
                            <span title={c.notas} className="text-zinc-400">
                              <FileText className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                        {marcasFavoritas.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 max-w-xs">
                            {marcasFavoritas.slice(0, 3).map(({ id, marca }) => (
                              <span
                                key={id}
                                title={marca?.nombre || `ID: ${id}`}
                                className={`px-1.5 py-0.5 rounded-md border text-[10px] ${marca ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300" : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"}`}
                              >
                                {marca?.nombre || "Marca no disponible"}
                              </span>
                            ))}
                            {marcasFavoritas.length > 3 && (
                              <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[10px]">
                                +{marcasFavoritas.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                        {c.intereses && (
                          <p className="text-[10px] text-zinc-400 truncate max-w-xs mt-0.5">
                            Intereses anteriores: {c.intereses}
                          </p>
                        )}
                      </td>

                      {/* Tipo Badge */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border capitalize ${getTipoBadgeStyle(c.tipo_cliente)}`}>
                          {c.tipo_cliente}
                        </span>
                      </td>

                      {/* Contacto rápido: WhatsApp / Instagram / Phone */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {waLink ? (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir WhatsApp"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-100 transition-colors font-mono text-[11px]"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{c.telefono}</span>
                              <ArrowUpRight className="w-2.5 h-2.5 opacity-70" />
                            </a>
                          ) : c.telefono ? (
                            <span className="text-zinc-600 dark:text-zinc-400 font-mono text-[11px] flex items-center gap-1">
                              <Phone className="w-3 h-3 text-zinc-400" />
                              {c.telefono}
                            </span>
                          ) : null}

                          {igLink && (
                            <a
                              href={igLink}
                              target="_blank"
                              rel="noreferrer"
                              title="Ver perfil de Instagram"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 border border-pink-500/20 hover:bg-pink-100 transition-colors text-[11px]"
                            >
                              <Instagram className="w-3 h-3" />
                              <span>@{c.instagram?.replace(/^@+/, "")}</span>
                              <ArrowUpRight className="w-2.5 h-2.5 opacity-70" />
                            </a>
                          )}

                          {!c.telefono && !c.instagram && (
                            <span className="text-zinc-400 text-[11px] italic">Sin contacto</span>
                          )}
                        </div>
                      </td>

                      {/* Ciudad / Canal preferido */}
                      <td className="py-3.5 px-4">
                        <div className="text-zinc-900 dark:text-white font-medium">
                          {c.ciudad || "—"}
                        </div>
                        <div className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5">
                          <span>Canal: {c.canal_preferido || "WhatsApp"}</span>
                          {c.origen && <span>• {c.origen}</span>}
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleToggleEstado(c, e)}
                          disabled={togglingId === c.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                            c.estado === "activo" || !c.estado
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-300"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${c.estado === "activo" || !c.estado ? "bg-emerald-500" : "bg-zinc-400"}`} />
                          {c.estado === "activo" || !c.estado ? "Activo" : "Inactivo"}
                        </button>
                      </td>

                      {/* Fecha de creación */}
                      <td className="py-3.5 px-4 text-zinc-500 font-mono text-[11px]">
                        {formatDate(c.creado_at)}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCliente(c)}
                            title="Ver ficha y compras"
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => openEditModal(c, e)}
                            title="Editar datos"
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleEnviarPapelera(c, e)}
                            disabled={archivingId === c.id}
                            title="Enviar a Papelera"
                            className="p-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Detail Drawer / Side Sheet */}
      {selectedCliente && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div 
            className="bg-white dark:bg-zinc-900 w-full max-w-xl h-full shadow-2xl flex flex-col overflow-hidden border-l border-zinc-200 dark:border-zinc-800 animate-in slide-in-from-right duration-200"
            id="cliente-detalle-drawer"
          >
            {/* Header */}
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/50 dark:bg-zinc-800/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold text-sm">
                  {selectedCliente.nombre_completo.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <span>{selectedCliente.nombre_completo}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-md font-bold uppercase border ${getTipoBadgeStyle(selectedCliente.tipo_cliente)}`}>
                      {selectedCliente.tipo_cliente}
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Cliente registrado el {formatDate(selectedCliente.creado_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEditModal(selectedCliente)}
                  className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Editar cliente"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleEnviarPapelera(selectedCliente)}
                  disabled={archivingId === selectedCliente.id}
                  className="p-2 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50"
                  title="Enviar a Papelera"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCliente(null)}
                  className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {detalleActual && clienteDetalleError && (
                <div role="alert" className="p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
                  <p>{clienteDetalleError}</p>
                  <button type="button" onClick={() => setDetalleVersion(value => value + 1)} disabled={loadingMovimientos} className="mt-2 font-bold underline disabled:opacity-50">Reintentar</button>
                </div>
              )}
              {/* Quick Actions & Status banner */}
              <div className="flex items-center justify-between p-3.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${selectedCliente.estado === "activo" ? "bg-emerald-500" : "bg-zinc-400"}`} />
                  <span className="text-xs font-bold text-zinc-900 dark:text-white">
                    Estado: {selectedCliente.estado === "activo" ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleEstado(selectedCliente)}
                    disabled={togglingId === selectedCliente.id}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {selectedCliente.estado === "activo" ? "Desactivar" : "Activar"}
                  </button>

                  {onNavigateToVenta && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateToVenta(selectedCliente.id);
                        setSelectedCliente(null);
                      }}
                      className="text-xs font-bold px-3 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Registrar Venta</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Commercial Metrics Cards */}
              {detalleActual && !loadingMovimientos && !clienteDetalleError && <div>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2.5">
                  Métricas Comerciales
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Total Comprado</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono mt-0.5 block">
                      ${clientMetrics.totalComprado.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Ventas</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono mt-0.5 block">
                      {clientMetrics.ventasCount}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Ticket Promedio</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono mt-0.5 block">
                      ${clientMetrics.ticketPromedio.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Unidades</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono mt-0.5 block">
                      {clientMetrics.unidadesCompradas}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Pedidos abiertos</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono mt-0.5 block">
                      {clientMetrics.pedidosPendientes}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Saldo pendiente</span>
                    <span className={`text-sm font-bold font-mono mt-0.5 block ${clientMetrics.saldoPendiente > 0 ? "text-amber-600" : "text-zinc-900 dark:text-white"}`}>
                      ${clientMetrics.saldoPendiente.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Última Compra</span>
                    <span className="text-xs font-bold text-zinc-900 dark:text-white mt-0.5 block">
                      {clientMetrics.ultimaCompra ? formatDate(clientMetrics.ultimaCompra) : "Sin compras"}
                    </span>
                  </div>
                </div>
              </div>}

              {/* Contact and details grid */}
              <div className="space-y-3 bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-xs">
                <h3 className="font-bold text-zinc-900 dark:text-white text-xs mb-2">
                  Información de Contacto y Perfil
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Teléfono / WhatsApp:</span>
                    {formatWhatsAppLink(selectedCliente.telefono) ? <a href={formatWhatsAppLink(selectedCliente.telefono)!} target="_blank" rel="noreferrer" className="font-medium text-emerald-600 dark:text-emerald-400 font-mono hover:underline">{selectedCliente.telefono}</a> : <span className="font-medium text-zinc-800 dark:text-zinc-200">No registrado</span>}
                  </div>

                  <div>
                    <span className="text-[11px] text-zinc-400 block">Instagram:</span>
                    {formatInstagramLink(selectedCliente.instagram) ? <a href={formatInstagramLink(selectedCliente.instagram)!} target="_blank" rel="noreferrer" className="font-medium text-pink-600 dark:text-pink-400 hover:underline">@{selectedCliente.instagram?.replace(/^@+/, "")}</a> : <span className="font-medium text-zinc-800 dark:text-zinc-200">No registrado</span>}
                  </div>

                  <div>
                    <span className="text-[11px] text-zinc-400 block">Email:</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {selectedCliente.email || "No registrado"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-zinc-400 block">Ciudad:</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {selectedCliente.ciudad || "No especificada"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-zinc-400 block">Canal Preferido:</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {selectedCliente.canal_preferido || "WhatsApp"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-zinc-400 block">Origen:</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {selectedCliente.origen || "Instagram"}
                    </span>
                  </div>
                </div>

                {(selectedCliente.marcas_favoritas_ids || []).length > 0 && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                    <span className="text-[11px] text-zinc-400 block mb-1.5">Marcas favoritas:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedCliente.marcas_favoritas_ids || []).map(id => {
                        const marca = marcasPorId.get(id);
                        return (
                          <span
                            key={id}
                            title={marca?.nombre || `ID: ${id}`}
                            className={`px-2 py-1 rounded-lg border text-[11px] ${marca ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200" : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"}`}
                          >
                            {marca?.nombre || "Marca no disponible"}
                            {marca && !marca.activa ? " (inactiva)" : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedCliente.intereses && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                    <span className="text-[11px] text-zinc-400 block">Intereses anteriores:</span>
                    <p className="text-zinc-700 dark:text-zinc-300 text-xs mt-0.5">
                      {selectedCliente.intereses}
                    </p>
                  </div>
                )}

                {selectedCliente.notas && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                    <span className="text-[11px] text-zinc-400 block">Notas internas:</span>
                    <p className="text-zinc-700 dark:text-zinc-300 text-xs mt-0.5 whitespace-pre-line">
                      {selectedCliente.notas}
                    </p>
                  </div>
                )}

                {selectedCliente.proximo_seguimiento && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-rose-500" />
                    <span className="text-[11px] text-zinc-500">
                      Próximo seguimiento agendado: <strong className="text-zinc-900 dark:text-white">{formatDate(selectedCliente.proximo_seguimiento)}</strong>
                    </span>
                  </div>
                )}
              </div>

              {detalleActual && !loadingMovimientos && clientePedidos.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      Pedidos y saldos
                    </h3>
                    {onNavigateToPedidos && (
                      <button type="button" onClick={onNavigateToPedidos} className="text-xs text-rose-500 hover:underline flex items-center gap-1 font-semibold">
                        Ver seguimiento <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800">
                    {clientePedidos.map(pedido => (
                      <div key={pedido.venta_id} className="p-3 bg-white dark:bg-zinc-900/60 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-zinc-900 dark:text-white">{pedido.folio}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${pedido.estado === "entregado" ? "bg-emerald-500/10 text-emerald-600" : pedido.estado === "pagado" ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"}`}>
                              {pedido.estado === "entregado" ? "Entregado" : pedido.estado === "pagado" ? "Pagado" : "Por pagar"}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-1">{pedido.canal_venta_nombre} · {pedido.items.reduce((sum, item) => sum + item.cantidad, 0)} unidades</p>
                        </div>
                        <div className="text-right">
                          <strong className="block text-zinc-900 dark:text-white">${pedido.total.toFixed(2)}</strong>
                          <span className={pedido.saldo > 0 ? "text-amber-600" : "text-zinc-400"}>Saldo: ${pedido.saldo.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Purchase History / Salidas */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-rose-500" />
                    Historial de ventas
                  </h3>
                  {onNavigateToHistory && (
                    <button
                      type="button"
                      onClick={() => onNavigateToHistory(selectedCliente.id)}
                      className="text-xs text-rose-500 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>Ver en Historial General</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {loadingMovimientos || !detalleActual ? (
                  <div className="p-6 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                    <span>Buscando movimientos del cliente...</span>
                  </div>
                ) : historialError ? <p className="text-xs text-rose-600">Historial no disponible. Usa Reintentar para volver a consultarlo.</p> : groupedSales.length === 0 ? (
                  <div className="p-6 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-center text-xs text-zinc-400 space-y-2">
                    <p>Este cliente aún no tiene salidas o compras registradas en el sistema.</p>
                    {onNavigateToVenta && (
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateToVenta(selectedCliente.id);
                          setSelectedCliente(null);
                        }}
                        className="text-xs font-bold text-rose-500 hover:underline inline-block"
                      >
                        Crear primera venta ahora
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                    {groupedSales.map((sale) => {
                      return (
                        <div key={sale.key} className="p-3 bg-white dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-zinc-900 dark:text-white">
                                {sale.folio}
                              </span>
                              {sale.canal && <span className="text-[10px] text-zinc-500">{sale.canal}</span>}
                              {sale.estado === "anulado" && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 text-rose-500 font-bold">
                                  Anulado
                                </span>
                              )}
                              {sale.estado === "devuelto" && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-violet-500/10 text-violet-500 font-bold">
                                  Devuelto
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              {formatDate(sale.fecha)} • {sale.items.length} producto{sale.items.length === 1 ? "" : "s"} • {sale.unidades} uds
                            </p>
                            <p className="text-[10px] text-zinc-500 mt-1 truncate max-w-xs">{sale.items.map(item => `${item.cantidad}× ${item.sku}`).join(" · ")}</p>
                          </div>

                          <div className="text-right">
                            <span className="font-mono font-bold text-zinc-900 dark:text-white block">
                              ${sale.total.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal create / edit */}
      <ClienteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        clienteToEdit={clienteToEdit}
        existingClientes={clientes}
        onClienteSaved={(saved) => {
          setIsModalOpen(false);
          if (selectedCliente?.id === saved.id) {
            setSelectedCliente(saved);
          }
        }}
      />
      <ConfiguracionModuloModal isOpen={isSettingsOpen} module="clientes" onClose={() => setIsSettingsOpen(false)} onSaved={loadClientSettings} />
    </div>
  );
}
