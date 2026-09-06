/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { Cliente, Movimiento, TipoCliente, EstadoCliente } from "../types";
import { firestoreService } from "../lib/firebase";
import ClienteModal from "./ClienteModal";
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
  ArrowUpRight
} from "lucide-react";

interface ClientesProps {
  onNavigateToVenta?: (clienteId?: string) => void;
  onNavigateToHistory?: (clienteId?: string) => void;
}

export default function Clientes({ onNavigateToVenta, onNavigateToHistory }: ClientesProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUsingLocalFallback, setIsUsingLocalFallback] = useState(false);
  const [dismissNotice, setDismissNotice] = useState(false);

  // Search and filters
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [estadoFilter, setEstadoFilter] = useState<string>("todos");

  // Modal create/edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clienteToEdit, setClienteToEdit] = useState<Cliente | null>(null);

  // Detail Drawer / Modal
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [clienteMovimientos, setClienteMovimientos] = useState<Movimiento[]>([]);
  const [loadingMovimientos, setLoadingMovimientos] = useState(false);

  // Status toggle in progress ID
  const [togglingId, setTogglingId] = useState<string | null>(null);

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
        const isPermission = err?.code === "permission-denied" || (err?.message && err.message.includes("permission"));
        if (isPermission) {
          setIsUsingLocalFallback(true);
        } else {
          console.warn("Aviso en clientes:", err);
          setError("No se pudieron sincronizar algunos datos con la nube. Los clientes locales se muestran a continuación.");
        }
      }
    );

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // Fetch client movements when detail drawer is opened
  useEffect(() => {
    if (!selectedCliente?.id) {
      setClienteMovimientos([]);
      return;
    }

    let isMounted = true;
    setLoadingMovimientos(true);

    // Fetch movements to inspect sales for this client
    firestoreService.getMovimientosPaginated({ pageSize: 150 })
      .then((res) => {
        if (!isMounted) return;
        // Filter by salidas matching this client ID or normalized name
        const cId = selectedCliente.id;
        const cNorm = selectedCliente.nombre_normalizado;

        const filtered = res.items.filter((m) => {
          if (m.tipo !== "salida") return false;
          if (m.cliente_id && m.cliente_id === cId) return true;
          if (m.cliente_nombre && m.cliente_nombre.toLowerCase().trim() === selectedCliente.nombre_completo.toLowerCase().trim()) return true;
          if (m.referencia && cNorm && m.referencia.toLowerCase().includes(cNorm)) return true;
          return false;
        });

        setClienteMovimientos(filtered);
      })
      .catch((err) => {
        console.warn("Error cargando compras del cliente:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingMovimientos(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCliente]);

  // Client metrics calculated on the fly
  const clientMetrics = useMemo(() => {
    if (!clienteMovimientos.length) {
      return {
        totalComprado: 0,
        pedidosCount: 0,
        ticketPromedio: 0,
        ultimaCompra: null as Date | null
      };
    }

    const activeMovs = clienteMovimientos.filter(m => m.estado !== "anulado");
    let total = 0;
    let latestDate: Date | null = null;

    activeMovs.forEach((m) => {
      const saleTotal = typeof m.total_venta === "number" 
        ? m.total_venta 
        : (typeof m.precio_unitario_venta === "number" ? m.precio_unitario_venta * m.cantidad : 0);
      total += saleTotal;

      const dateObj = m.fecha instanceof Date 
        ? m.fecha 
        : (m.fecha as any)?.toDate 
          ? (m.fecha as any).toDate() 
          : new Date((m.fecha as any)?.seconds ? (m.fecha as any).seconds * 1000 : m.fecha);

      if (!latestDate || dateObj > latestDate) {
        latestDate = dateObj;
      }
    });

    const pedidosCount = activeMovs.length;
    const ticketPromedio = pedidosCount > 0 ? total / pedidosCount : 0;

    return {
      totalComprado: total,
      pedidosCount,
      ticketPromedio,
      ultimaCompra: latestDate
    };
  }, [clienteMovimientos]);

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

      return matchName || matchIg || matchPhone || matchEmail || matchCity;
    });
  }, [clientes, searchTerm, tipoFilter, estadoFilter]);

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

      {/* Local mode / Firestore rules notice (non-blocking) */}
      {isUsingLocalFallback && !dismissNotice && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between gap-3 text-amber-800 dark:text-amber-300 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span>
              <strong>Modo de sincronización local activo:</strong> Las ventas y clientes se guardan y vinculan localmente de forma segura. Para sincronización en tiempo real en la nube, asegúrate de que tu Firebase Console tenga configurada la regla para <code className="bg-amber-500/15 px-1 py-0.5 rounded font-mono text-[11px]">/clientes</code>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissNotice(true)}
            className="text-amber-700 dark:text-amber-400 hover:underline shrink-0 text-xs font-medium cursor-pointer"
          >
            Entendido
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
            <option value="minorista">Minorista</option>
            <option value="mayorista">Mayorista</option>
            <option value="emprendedor">Emprendedor</option>
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
                        {c.intereses && (
                          <p className="text-[10px] text-zinc-400 truncate max-w-xs mt-0.5">
                            Interés: {c.intereses}
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
              <div>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2.5">
                  Métricas Comerciales
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Total Comprado</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono mt-0.5 block">
                      ${clientMetrics.totalComprado.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Pedidos / Salidas</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono mt-0.5 block">
                      {clientMetrics.pedidosCount}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Ticket Promedio</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono mt-0.5 block">
                      ${clientMetrics.ticketPromedio.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Última Compra</span>
                    <span className="text-xs font-bold text-zinc-900 dark:text-white mt-0.5 block">
                      {clientMetrics.ultimaCompra ? formatDate(clientMetrics.ultimaCompra) : "Sin compras"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contact and details grid */}
              <div className="space-y-3 bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-xs">
                <h3 className="font-bold text-zinc-900 dark:text-white text-xs mb-2">
                  Información de Contacto y Perfil
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Teléfono / WhatsApp:</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200 font-mono">
                      {selectedCliente.telefono || "No registrado"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-zinc-400 block">Instagram:</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {selectedCliente.instagram ? `@${selectedCliente.instagram.replace(/^@+/, "")}` : "No registrado"}
                    </span>
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

                {selectedCliente.intereses && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                    <span className="text-[11px] text-zinc-400 block">Intereses / Modelos:</span>
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

              {/* Purchase History / Salidas */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-rose-500" />
                    Historial de Compras / Salidas
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

                {loadingMovimientos ? (
                  <div className="p-6 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                    <span>Buscando movimientos del cliente...</span>
                  </div>
                ) : clienteMovimientos.length === 0 ? (
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
                    {clienteMovimientos.map((m) => {
                      const totalVal = typeof m.total_venta === "number"
                        ? m.total_venta
                        : (typeof m.precio_unitario_venta === "number" ? m.precio_unitario_venta * m.cantidad : 0);

                      return (
                        <div key={m.id || m.folio} className="p-3 bg-white dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-zinc-900 dark:text-white">
                                {m.folio || "Salida"}
                              </span>
                              <span className="font-mono text-zinc-500 text-[11px]">
                                SKU: {m.sku}
                              </span>
                              {m.estado === "anulado" && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 text-rose-500 font-bold">
                                  Anulado
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              {formatDate(m.fecha)} • Cantidad: {m.cantidad} uds
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="font-mono font-bold text-zinc-900 dark:text-white block">
                              ${totalVal.toFixed(2)}
                            </span>
                            {m.precio_unitario_venta && (
                              <span className="text-[10px] text-zinc-400 block font-mono">
                                (${m.precio_unitario_venta.toFixed(2)} c/u)
                              </span>
                            )}
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
    </div>
  );
}
