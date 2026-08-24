/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Almacen {
  id: string;
  nombre: string;
  ubicacion: string;
}

export interface Producto {
  id?: string;
  producto_base_id?: string; // Identificador común para agrupar variantes del mismo modelo
  sku: string; // Identificador único de la variante
  nombre: string; // Nombre comercial del producto
  marca?: string; // Marca (ej. dorsalclub, Nike, Stüssy)
  categoria: string; // Categoría (ej. Camisetas, Sudaderas, Tenis)
  color?: string; // Color de la prenda/sneaker
  talla?: string; // Talla (ej. M, L, 27.5, Única)
  tipo_talla?: "ropa" | "calzado" | "unica"; // Tipo de talla
  codigo_barras?: string; // Código de barras opcional (EAN/UPC)
  precio_costo?: number; // Costo de adquisición unitario
  precio_venta?: number; // Precio de venta
  precio_venta_sugerido?: number; // Precio de venta sugerido en MXN
  stock_minimo: number; // Global o fallback legacy
  stock_minimo_almacenes?: Record<string, number>; // Mínimo individual por almacén (0 = alerta desactivada)
  unidad: string; // Unidad de medida (normalmente 'pieza' o 'par')
  activo?: boolean; // Estado activo/inactivo (por defecto true)
  creado_at?: {
    seconds: number;
    nanoseconds: number;
  } | Date;
  actualizado_at?: {
    seconds: number;
    nanoseconds: number;
  } | Date;
}

export interface StockItem {
  id: string; // sku_almacenId
  sku: string;
  almacen_id: string;
  cantidad: number;
  actualizado: {
    seconds: number;
    nanoseconds: number;
  } | Date;
}

export interface Movimiento {
  id?: string;
  folio?: string; // Folio consecutivo único: Entrada-1, Salida-1, Transferencia-1
  sku: string;
  almacen_id: string;
  tipo: "entrada" | "salida" | "ajuste" | "transferencia";
  cantidad: number;
  referencia: string;
  usuario: string;
  fecha: {
    seconds: number;
    nanoseconds: number;
  } | Date;
  almacen_destino_id?: string; // Para transferencias
  compra_id?: string; // Trazabilidad con lote de compra
  lote_id?: string; // Identificador de lote
  costo_unitario?: number; // Costo unitario al registrar compra
  estado?: "activo" | "anulado"; // Estado del movimiento (por defecto activo)
  anulado_at?: {
    seconds: number;
    nanoseconds: number;
  } | Date;
  anulado_por?: string; // Usuario / Email que realizó la anulación
  motivo_anulacion?: string; // Motivo opcional de la anulación
}

export interface Usuario {
  uid: string;
  email: string;
  nombre?: string;
}

export type NavigationTab = 
  | "dashboard" 
  | "compras" 
  | "compras_nueva"
  | "ventas_nueva"
  | "transferencias_nueva"
  | "historial" 
  | "analisis_ventas" 
  | "almacenes" 
  | "catalogo"
  | "ventas" // legacy/alias for sales analysis
  | "movimientos"; // alias for redirect

export interface CompraItem {
  sku: string;
  nombre_producto?: string;
  variante_label?: string;
  cantidad: number;
  costo_unitario: number;
  subtotal: number;
}

export interface Compra {
  id?: string;
  folio: string; // ej. COMP-1
  proveedor: string;
  fecha: {
    seconds: number;
    nanoseconds: number;
  } | Date;
  fecha_str?: string; // YYYY-MM-DD
  almacen_id: string; // Almacén de recepción
  items: CompraItem[];
  total_unidades: number;
  subtotal: number;
  costo_envio: number;
  comisiones: number;
  descuentos: number;
  total: number;
  referencia?: string; // Folio de factura / remisión
  notas?: string;
  creado_por: string;
  creado_at: {
    seconds: number;
    nanoseconds: number;
  } | Date;
  estado?: "completada" | "anulada";
}

export type PeriodoVenta = "esta_semana" | "mes_actual" | "ultimos_30_dias" | "personalizado";

export interface CategoriaCatalogo {
  id: string;
  nombre: string;
  activa: boolean;
  creado?: {
    seconds: number;
    nanoseconds: number;
  } | Date;
}

export interface MarcaCatalogo {
  id: string;
  nombre: string;
  activa: boolean;
  creado?: {
    seconds: number;
    nanoseconds: number;
  } | Date;
}

export interface ColorCatalogo {
  id: string;
  nombre: string;
  codigo_hex?: string; // Código hexadecimal para preview visual
  activa: boolean;
  creado?: {
    seconds: number;
    nanoseconds: number;
  } | Date;
}

export interface TallaRopaCatalogo {
  id: string;
  nombre: string;
  orden?: number;
  activa: boolean;
  creado?: {
    seconds: number;
    nanoseconds: number;
  } | Date;
}

export interface TallaCalzadoCatalogo {
  id: string;
  nombre: string;
  orden?: number;
  activa: boolean;
  creado?: {
    seconds: number;
    nanoseconds: number;
  } | Date;
}

export interface UnidadMedidaCatalogo {
  id: string;
  nombre: string;
  abreviatura: string;
  activa: boolean;
  creado?: {
    seconds: number;
    nanoseconds: number;
  } | Date;
}

export interface ResumenVentaDiaria {
  id: string; // Formato: YYYY-MM-DD_SKU_almacenId
  fecha_str: string; // YYYY-MM-DD
  fecha: {
    seconds: number;
    nanoseconds: number;
  } | Date;
  sku: string;
  almacen_id: string;
  cantidad: number; // Unidades totales vendidas para este SKU, almacén y fecha
  total_transacciones: number; // Número de movimientos de salida
  actualizado?: {
    seconds: number;
    nanoseconds: number;
  } | Date;
}


