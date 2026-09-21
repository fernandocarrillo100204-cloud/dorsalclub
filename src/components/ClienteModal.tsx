/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Cliente, TipoCliente, CanalPreferido, OrigenCliente, EstadoCliente, MarcaCatalogo } from "../types";
import { firestoreService } from "../lib/firebase";
import { X, AlertTriangle, CheckCircle2, User, Phone, Instagram, Mail, MapPin, Calendar, MessageSquare, Tag, Search, ChevronDown, Check, RefreshCw } from "lucide-react";

interface ClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteToEdit?: Cliente | null;
  existingClientes?: Cliente[];
  onClienteSaved: (cliente: Cliente) => void;
}

export default function ClienteModal({
  isOpen,
  onClose,
  clienteToEdit,
  existingClientes = [],
  onClienteSaved
}: ClienteModalProps) {
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>("minorista");
  const [instagram, setInstagram] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [canalPreferido, setCanalPreferido] = useState<CanalPreferido>("WhatsApp");
  const [marcas, setMarcas] = useState<MarcaCatalogo[]>([]);
  const [marcasFavoritasIds, setMarcasFavoritasIds] = useState<string[]>([]);
  const [marcasLoading, setMarcasLoading] = useState(false);
  const [marcasError, setMarcasError] = useState<string | null>(null);
  const [marcasTouched, setMarcasTouched] = useState(false);
  const [selectorMarcasOpen, setSelectorMarcasOpen] = useState(false);
  const [marcaSearch, setMarcaSearch] = useState("");
  const [origen, setOrigen] = useState<OrigenCliente>("Instagram");
  const [notas, setNotas] = useState("");
  const [proximoSeguimiento, setProximoSeguimiento] = useState("");
  const [estado, setEstado] = useState<EstadoCliente>("activo");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectorMarcasRef = useRef<HTMLDivElement>(null);
  const marcasRequestRef = useRef(0);

  // Duplicate warning confirmation state
  const [duplicateWarning, setDuplicateWarning] = useState<{
    matches: { cliente: Cliente; field: "telefono" | "instagram" }[];
  } | null>(null);

  useEffect(() => {
    if (clienteToEdit) {
      setNombreCompleto(clienteToEdit.nombre_completo || "");
      setTipoCliente(clienteToEdit.tipo_cliente || "minorista");
      setInstagram(clienteToEdit.instagram || "");
      setTelefono(clienteToEdit.telefono || "");
      setEmail(clienteToEdit.email || "");
      setCiudad(clienteToEdit.ciudad || "");
      setCanalPreferido((clienteToEdit.canal_preferido as CanalPreferido) || "WhatsApp");
      setMarcasFavoritasIds(Array.isArray(clienteToEdit.marcas_favoritas_ids)
        ? [...new Set(clienteToEdit.marcas_favoritas_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map(id => id.trim()))]
        : []);
      setOrigen((clienteToEdit.origen as OrigenCliente) || "Instagram");
      setNotas(clienteToEdit.notas || "");
      
      let dateVal = "";
      if (clienteToEdit.proximo_seguimiento) {
        const d = clienteToEdit.proximo_seguimiento instanceof Date 
          ? clienteToEdit.proximo_seguimiento 
          : (clienteToEdit.proximo_seguimiento as any)?.toDate 
            ? (clienteToEdit.proximo_seguimiento as any).toDate()
            : new Date(clienteToEdit.proximo_seguimiento as any);
        if (!isNaN(d.getTime())) {
          dateVal = d.toISOString().split("T")[0];
        }
      }
      setProximoSeguimiento(dateVal);
      setEstado(clienteToEdit.estado || "activo");
    } else {
      setNombreCompleto("");
      setTipoCliente("minorista");
      setInstagram("");
      setTelefono("");
      setEmail("");
      setCiudad("");
      setCanalPreferido("WhatsApp");
      setMarcasFavoritasIds([]);
      setOrigen("Instagram");
      setNotas("");
      setProximoSeguimiento("");
      setEstado("activo");
    }
    setError(null);
    setDuplicateWarning(null);
    setMarcasTouched(false);
    setSelectorMarcasOpen(false);
    setMarcaSearch("");
  }, [clienteToEdit, isOpen]);

  const loadMarcas = useCallback(async () => {
    const requestId = ++marcasRequestRef.current;
    setMarcasLoading(true);
    setMarcasError(null);

    try {
      const catalogo = await firestoreService.getMarcas();
      if (requestId !== marcasRequestRef.current) return;
      setMarcas([...catalogo].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })));
    } catch (err) {
      if (requestId !== marcasRequestRef.current) return;
      console.error("Error al cargar el catálogo de marcas:", err);
      setMarcas([]);
      setMarcasError("No se pudo cargar el catálogo de marcas.");
    } finally {
      if (requestId === marcasRequestRef.current) setMarcasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadMarcas();

    return () => {
      marcasRequestRef.current += 1;
    };
  }, [isOpen, loadMarcas]);

  useEffect(() => {
    if (!selectorMarcasOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (selectorMarcasRef.current && !selectorMarcasRef.current.contains(event.target as Node)) {
        setSelectorMarcasOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectorMarcasOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectorMarcasOpen]);

  const marcasActivasFiltradas = useMemo(() => {
    const term = marcaSearch.trim().toLocaleLowerCase("es");
    return marcas.filter(marca => marca.activa && (!term || marca.nombre.toLocaleLowerCase("es").includes(term)));
  }, [marcaSearch, marcas]);

  const marcasSeleccionadas = useMemo(() => {
    const marcasPorId = new Map(marcas.map(marca => [marca.id, marca]));
    return marcasFavoritasIds.map(id => ({ id, marca: marcasPorId.get(id) }));
  }, [marcas, marcasFavoritasIds]);

  const toggleMarca = (marcaId: string) => {
    setMarcasTouched(true);
    setMarcasFavoritasIds(current => current.includes(marcaId)
      ? current.filter(id => id !== marcaId)
      : [...current, marcaId]);
  };

  const removeMarca = (marcaId: string) => {
    setMarcasTouched(true);
    setMarcasFavoritasIds(current => current.filter(id => id !== marcaId));
  };

  if (!isOpen) return null;

  const checkDuplicates = () => {
    const rawTel = telefono.replace(/\D/g, "");
    const rawIg = instagram.trim().toLowerCase().replace(/^@+/, "");

    const matches: { cliente: Cliente; field: "telefono" | "instagram" }[] = [];

    existingClientes.forEach((c) => {
      // Exclude currently editing client
      if (clienteToEdit?.id && c.id === clienteToEdit.id) return;

      if (rawTel && c.telefono) {
        const cTel = String(c.telefono).replace(/\D/g, "");
        if (cTel && cTel === rawTel) {
          matches.push({ cliente: c, field: "telefono" });
        }
      }

      if (rawIg && (c.instagram_normalizado || c.instagram)) {
        const cIg = (c.instagram_normalizado || c.instagram || "").toLowerCase().replace(/^@+/, "");
        if (cIg && cIg === rawIg) {
          matches.push({ cliente: c, field: "instagram" });
        }
      }
    });

    return matches;
  };

  const handleSave = async (forceSave = false) => {
    setError(null);
    const cleanNombre = nombreCompleto.trim();
    if (!cleanNombre) {
      setError("El nombre completo es obligatorio.");
      return;
    }

    if (marcasError && marcasTouched) {
      setError("No se pueden modificar las marcas favoritas mientras el catálogo no esté disponible. Reintenta la carga o conserva la selección anterior.");
      return;
    }

    const cleanMarcasFavoritasIds: string[] = [...new Set<string>(
      marcasFavoritasIds
        .filter((id): id is string => typeof id === "string")
        .map(id => id.trim())
        .filter(Boolean)
    )];

    if (!forceSave) {
      const dupMatches = checkDuplicates();
      if (dupMatches.length > 0) {
        setDuplicateWarning({ matches: dupMatches });
        return;
      }
    }

    setSaving(true);
    try {
      const dateObj = proximoSeguimiento ? new Date(proximoSeguimiento + "T12:00:00") : null;

      let savedCliente: Cliente;
      if (clienteToEdit?.id) {
        await firestoreService.updateCliente(clienteToEdit.id, {
          nombre_completo: cleanNombre,
          tipo_cliente: tipoCliente,
          instagram: instagram.trim() || undefined,
          telefono: telefono.trim() || undefined,
          email: email.trim() || undefined,
          ciudad: ciudad.trim() || undefined,
          canal_preferido: canalPreferido,
          marcas_favoritas_ids: cleanMarcasFavoritasIds,
          origen,
          notas: notas.trim() || undefined,
          proximo_seguimiento: dateObj,
          estado
        });
        savedCliente = {
          ...clienteToEdit,
          nombre_completo: cleanNombre,
          nombre_normalizado: cleanNombre.toLowerCase().replace(/\s+/g, " "),
          tipo_cliente: tipoCliente,
          instagram: instagram.trim() || undefined,
          instagram_normalizado: instagram.trim().toLowerCase().replace(/^@+/, ""),
          telefono: telefono.trim() || undefined,
          email: email.trim() || undefined,
          ciudad: ciudad.trim() || undefined,
          canal_preferido: canalPreferido,
          marcas_favoritas_ids: cleanMarcasFavoritasIds,
          origen,
          notas: notas.trim() || undefined,
          proximo_seguimiento: dateObj,
          estado,
          actualizado_at: new Date()
        };
      } else {
        savedCliente = await firestoreService.addCliente({
          nombre_completo: cleanNombre,
          tipo_cliente: tipoCliente,
          instagram: instagram.trim() || undefined,
          telefono: telefono.trim() || undefined,
          email: email.trim() || undefined,
          ciudad: ciudad.trim() || undefined,
          canal_preferido: canalPreferido,
          marcas_favoritas_ids: cleanMarcasFavoritasIds,
          origen,
          notas: notas.trim() || undefined,
          proximo_seguimiento: dateObj,
          estado
        });
      }

      onClienteSaved(savedCliente);
      onClose();
    } catch (err: any) {
      console.error("Error al guardar cliente:", err);
      setError(err.message || "Error al guardar el cliente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        id="cliente-modal-dialog"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                {clienteToEdit ? "Editar Cliente" : "Nuevo Cliente"}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {clienteToEdit ? "Modifica los datos del cliente" : "Registra un nuevo contacto para vincular sus ventas"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content / Form body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {duplicateWarning && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2.5 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Posible cliente duplicado detectado</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Ya existen registros con el mismo {duplicateWarning.matches.map(m => m.field === "telefono" ? "teléfono" : "Instagram").join(" o ")}:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] font-medium">
                {duplicateWarning.matches.map((m, idx) => (
                  <li key={idx}>
                    <span className="font-bold">{m.cliente.nombre_completo}</span> ({m.cliente.tipo_cliente}) - Coincide en {m.field} ({m.field === "telefono" ? m.cliente.telefono : m.cliente.instagram})
                  </li>
                ))}
              </ul>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-zinc-700 dark:text-zinc-200 text-xs hover:bg-amber-100/50"
                >
                  Corregir datos
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors"
                >
                  Confirmar y guardar de todos modos
                </button>
              </div>
            </div>
          )}

          {/* Nombre y Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Nombre Completo <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="Ej. Sofía Martínez / Streetwear MX"
                  value={nombreCompleto}
                  onChange={(e) => setNombreCompleto(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Tipo de Cliente <span className="text-rose-500">*</span>
              </label>
              <select
                value={tipoCliente}
                onChange={(e) => setTipoCliente(e.target.value as TipoCliente)}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
              >
                <option value="minorista">Minorista</option>
                <option value="mayorista">Mayorista</option>
                <option value="emprendedor">Emprendedor</option>
              </select>
            </div>
          </div>

          {/* Contacto: Teléfono e Instagram */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Teléfono / WhatsApp (Opcional)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Ej. +52 55 1234 5678"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Instagram (Opcional)
              </label>
              <div className="relative">
                <Instagram className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Ej. @sneakershop_mx"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                />
              </div>
            </div>
          </div>

          {/* Email y Ciudad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Email (Opcional)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  placeholder="cliente@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Ciudad / Ubicación (Opcional)
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Ej. Ciudad de México, Guadalajara"
                  value={ciudad}
                  onChange={(e) => setCiudad(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                />
              </div>
            </div>
          </div>

          {/* Canal Preferido y Origen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Canal Preferido de Contacto
              </label>
              <select
                value={canalPreferido}
                onChange={(e) => setCanalPreferido(e.target.value as CanalPreferido)}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
              >
                <option value="WhatsApp">WhatsApp</option>
                <option value="Instagram">Instagram</option>
                <option value="llamada">Llamada telefónica</option>
                <option value="correo">Correo electrónico</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Origen del Cliente
              </label>
              <select
                value={origen}
                onChange={(e) => setOrigen(e.target.value as OrigenCliente)}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
              >
                <option value="Instagram">Instagram</option>
                <option value="recomendación">Recomendación / Boca a boca</option>
                <option value="tienda física">Tienda física / Showroom</option>
                <option value="evento">Evento / Pop-up</option>
                <option value="otro">Otro canal</option>
              </select>
            </div>
          </div>

          {/* Marcas favoritas y Próximo Seguimiento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div ref={selectorMarcasRef} className="relative">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Marcas favoritas (Opcional)
              </label>
              <button
                type="button"
                onClick={() => setSelectorMarcasOpen(open => !open)}
                aria-expanded={selectorMarcasOpen}
                aria-haspopup="listbox"
                className="w-full min-h-9 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-3 pr-2 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Tag className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="truncate">
                    {marcasFavoritasIds.length > 0
                      ? `${marcasFavoritasIds.length} ${marcasFavoritasIds.length === 1 ? "marca seleccionada" : "marcas seleccionadas"}`
                      : "Seleccionar marcas"}
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${selectorMarcasOpen ? "rotate-180" : ""}`} />
              </button>

              {selectorMarcasOpen && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                      <input
                        type="search"
                        value={marcaSearch}
                        onChange={(event) => setMarcaSearch(event.target.value)}
                        placeholder="Buscar marca..."
                        aria-label="Buscar marca"
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                      />
                    </div>
                  </div>

                  <div role="listbox" aria-multiselectable="true" className="max-h-52 overflow-y-auto p-1.5">
                    {marcasLoading ? (
                      <div className="p-4 text-xs text-zinc-500 flex items-center justify-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Cargando catálogo...</span>
                      </div>
                    ) : marcasError ? (
                      <div className="p-3 text-center space-y-2">
                        <p className="text-xs text-rose-600 dark:text-rose-400">{marcasError}</p>
                        <button
                          type="button"
                          onClick={loadMarcas}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Reintentar
                        </button>
                      </div>
                    ) : marcasActivasFiltradas.length === 0 ? (
                      <p className="p-4 text-center text-xs text-zinc-500">
                        {marcaSearch ? "No hay marcas que coincidan." : "No hay marcas activas en el catálogo."}
                      </p>
                    ) : (
                      marcasActivasFiltradas.map(marca => {
                        const selected = marcasFavoritasIds.includes(marca.id);
                        return (
                          <button
                            key={marca.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => toggleMarca(marca.id)}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-900 dark:focus:ring-white"
                          >
                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-600"}`}>
                              {selected && <Check className="w-3 h-3" />}
                            </span>
                            <span className="truncate">{marca.nombre}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {marcasSeleccionadas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2" aria-label="Marcas favoritas seleccionadas">
                  {marcasSeleccionadas.map(({ id, marca }) => (
                    <span
                      key={id}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${marca?.activa ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200" : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"}`}
                    >
                      <span>{marca?.nombre || "Marca no disponible"}{marca && !marca.activa ? " (inactiva)" : ""}</span>
                      <button
                        type="button"
                        onClick={() => removeMarca(id)}
                        aria-label={`Quitar ${marca?.nombre || "marca no disponible"}`}
                        className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-current"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {clienteToEdit?.intereses && (
                <div className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-2.5 py-2">
                  <span className="text-[10px] font-semibold text-zinc-500 block">Intereses anteriores</span>
                  <span className="text-[11px] text-zinc-700 dark:text-zinc-300">{clienteToEdit.intereses}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Fecha de Próximo Seguimiento (Opcional)
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="date"
                  value={proximoSeguimiento}
                  onChange={(e) => setProximoSeguimiento(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                />
              </div>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Notas / Observaciones (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Preferencias de pago, entregas personales, acuerdos especiales..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white resize-none"
            />
          </div>

          {/* Estado activo/inactivo */}
          {clienteToEdit && (
            <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-xl">
              <div>
                <span className="text-xs font-semibold text-zinc-900 dark:text-white block">
                  Estado del Cliente
                </span>
                <span className="text-[11px] text-zinc-500">
                  {estado === "activo" ? "Cliente activo y disponible para ventas" : "Cliente inactivo (conserva historial sin borrado físico)"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEstado(estado === "activo" ? "inactivo" : "activo")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  estado === "activo"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                }`}
              >
                {estado === "activo" ? "Activo" : "Inactivo"}
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-3 shrink-0 bg-zinc-50/50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors flex items-center gap-2 shadow-xs disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{clienteToEdit ? "Actualizar Cliente" : "Guardar Cliente"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
