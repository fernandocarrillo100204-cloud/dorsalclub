/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Cliente, TipoCliente, CanalPreferido, OrigenCliente, EstadoCliente } from "../types";
import { firestoreService } from "../lib/firebase";
import { X, AlertTriangle, CheckCircle2, User, Phone, Instagram, Mail, MapPin, Calendar, MessageSquare, Tag } from "lucide-react";

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
  const [intereses, setIntereses] = useState("");
  const [origen, setOrigen] = useState<OrigenCliente>("Instagram");
  const [notas, setNotas] = useState("");
  const [proximoSeguimiento, setProximoSeguimiento] = useState("");
  const [estado, setEstado] = useState<EstadoCliente>("activo");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setIntereses(clienteToEdit.intereses || "");
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
      setIntereses("");
      setOrigen("Instagram");
      setNotas("");
      setProximoSeguimiento("");
      setEstado("activo");
    }
    setError(null);
    setDuplicateWarning(null);
  }, [clienteToEdit, isOpen]);

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
          intereses: intereses.trim() || undefined,
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
          intereses: intereses.trim() || undefined,
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
          intereses: intereses.trim() || undefined,
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

          {/* Intereses y Próximo Seguimiento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Intereses / Marcas Favoritas (Opcional)
              </label>
              <div className="relative">
                <Tag className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Ej. Jordan 4, Trapstar, Hoodies oversized"
                  value={intereses}
                  onChange={(e) => setIntereses(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                />
              </div>
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
