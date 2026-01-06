/**
 * @fileoverview Central registry for all possible notification events in the system.
 */

import type { NotificationEvent } from '@/modules/core/types';

/**
 * A list of all events that can trigger notifications.
 * This is the single source of truth for available event triggers.
 */
export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  // --- Warehouse Module ---
  {
    id: 'onDispatchCompleted',
    module: 'Almacén',
    name: 'Al finalizar un Chequeo de Despacho',
    description: 'Se activa cuando un usuario finaliza la verificación de una factura, con o sin discrepancias.',
  },
  {
    id: 'onReceivingCompleted',
    module: 'Almacén',
    name: 'Al registrar una Recepción de Mercadería',
    description: 'Se activa cada vez que se crea una nueva unidad de inventario desde el asistente de recepción.',
  },
  // --- Planner Module ---
  {
    id: 'onPlannerOrderCreated',
    module: 'Planificador',
    name: 'Al crear una nueva Orden de Producción',
    description: 'Se activa cuando se guarda una nueva OP, antes de cualquier cambio de estado.',
  },
  {
    id: 'onPlannerOrderApproved',
    module: 'Planificador',
    name: 'Cuando una Orden de Producción es APROBADA',
    description: 'Se activa específicamente cuando el estado de una OP cambia a "Aprobada".',
  },
  {
    id: 'onPlannerOrderCompleted',
    module: 'Planificador',
    name: 'Cuando una Orden de Producción es COMPLETADA',
    description: 'Se activa específicamente cuando el estado de una OP cambia a "Completada".',
  },
  // --- Purchase Requests Module ---
  {
    id: 'onRequestCreated',
    module: 'Solicitud de Compra',
    name: 'Al crear una nueva Solicitud de Compra',
    description: 'Se activa cuando se guarda una nueva solicitud de compra.',
  },
  {
    id: 'onRequestApproved',
    module: 'Solicitud de Compra',
    name: 'Cuando una Solicitud es APROBADA',
    description: 'Se activa específicamente cuando el estado de una solicitud cambia a "Aprobada".',
  },
  {
    id: 'onRequestOrdered',
    module: 'Solicitud de Compra',
    name: 'Cuando una Solicitud es ORDENADA',
    description: 'Se activa específicamente cuando el estado de una solicitud cambia a "Ordenada".',
  },
];