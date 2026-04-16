import { z } from 'zod';
import {
  countrySchema,
  directionSchema,
  shipmentTypeSchema,
  payerSchema,
  paymentMethodSchema,
  collectionMethodSchema,
  deliveryMethodSchema,
  parcelStatusSchema,
  moneySchema,
  weightSchema,
  dimensionSchema,
  phoneSchema,
  uuidSchema,
  text,
} from './common';

/** One place inside a parcel (weight + optional dimensions). */
export const placeInputSchema = z.object({
  id: uuidSchema.optional(),
  placeNumber: z.number().int().min(1).max(100).optional(),
  weight: weightSchema.optional(),
  length: dimensionSchema.optional().nullable(),
  width: dimensionSchema.optional().nullable(),
  height: dimensionSchema.optional().nullable(),
  volume: z.number().finite().nonnegative().optional().nullable(),
  volumetricWeight: z.number().finite().nonnegative().optional().nullable(),
  needsPackaging: z.boolean().optional(),
});

/** Staff POST /api/parcels */
export const createParcelSchema = z.object({
  senderId: uuidSchema,
  senderAddressId: uuidSchema.nullish(),
  receiverId: uuidSchema,
  receiverAddressId: uuidSchema.nullish(),
  direction: directionSchema,
  shipmentType: shipmentTypeSchema.optional(),
  description: z.string().trim().max(500).optional().nullable(),
  declaredValue: moneySchema.optional().nullable(),
  payer: payerSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  paymentInUkraine: z.boolean().optional(),
  needsPackaging: z.boolean().optional(),
  places: z.array(placeInputSchema).min(1, 'Додайте хоча б одне місце').max(20),
  tripId: uuidSchema.optional().nullable(),
  collectionMethod: collectionMethodSchema.optional().nullable(),
  collectionPointId: uuidSchema.optional().nullable(),
  collectionDate: z.string().optional().nullable(),
  collectionAddress: z.string().trim().max(300).optional().nullable(),
});

/** Client portal POST /api/client-portal/orders */
export const clientOrderSchema = z.object({
  direction: directionSchema.optional(),
  shipmentType: shipmentTypeSchema.optional(),
  description: z.string().trim().max(500).optional().nullable(),
  declaredValue: moneySchema.optional().nullable(),
  payer: payerSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  paymentInUkraine: z.boolean().optional(),
  // Sender address (client is always the sender — enforced in route)
  senderCity: text(100).optional(),
  senderStreet: z.string().trim().max(300).optional().nullable(),
  senderCountry: countrySchema.optional().nullable(),
  senderFirstName: z.string().trim().max(100).optional(),
  senderLastName: z.string().trim().max(100).optional(),
  // Receiver
  receiverPhone: phoneSchema,
  receiverFirstName: text(100),
  receiverLastName: text(100),
  receiverCity: text(100).optional(),
  receiverStreet: z.string().trim().max(300).optional().nullable(),
  receiverCountry: countrySchema.optional().nullable(),
  receiverNpWarehouse: z.string().trim().max(50).optional().nullable(),
  receiverDeliveryMethod: deliveryMethodSchema.optional(),
  // Places
  places: z.array(placeInputSchema).min(1).max(20),
  // Collection
  collectionMethod: collectionMethodSchema.optional().nullable(),
  collectionPointId: uuidSchema.optional().nullable(),
  collectionDate: z.string().optional().nullable(),
  collectionAddress: z.string().trim().max(300).optional().nullable(),
});

/** PATCH /api/parcels/[id] — status + fields + places. All optional. */
export const updateParcelSchema = z.object({
  status: parcelStatusSchema.optional(),
  statusNote: z.string().trim().max(500).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  npTtn: z.string().trim().max(50).optional().nullable(),
  tripId: uuidSchema.optional().nullable(),
  assignedCourierId: uuidSchema.optional().nullable(),
  isPaid: z.boolean().optional(),
  estimatedDeliveryStart: z.string().optional().nullable(),
  estimatedDeliveryEnd: z.string().optional().nullable(),
  shortNumber: z.number().int().min(0).max(10000).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  declaredValue: moneySchema.optional().nullable(),
  needsPackaging: z.boolean().optional(),
  payer: payerSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  paymentInUkraine: z.boolean().optional(),
  shipmentType: shipmentTypeSchema.optional(),
  collectionMethod: collectionMethodSchema.nullable().optional(),
  collectionPointId: uuidSchema.nullable().optional(),
  collectionDate: z.string().nullable().optional(),
  collectionAddress: z.string().trim().max(300).nullable().optional(),
  routeTaskStatus: z.string().trim().max(50).nullable().optional(),
  routeTaskFailReason: z.string().trim().max(500).nullable().optional(),
  routeTaskReschedDate: z.string().nullable().optional(),
  places: z.array(placeInputSchema).max(20).optional(),
});

/** POST /api/parcels/calculate — cost calculator endpoint. */
export const calculateCostSchema = z.object({
  direction: directionSchema,
  country: countrySchema.refine(c => c !== 'UA', {
    message: 'Ціноутворення задано для європейських країн — UA не підтримується',
  }),
  actualWeight: weightSchema.optional(),
  volumetricWeight: weightSchema.optional(),
  declaredValue: moneySchema.optional(),
  needsPackaging: z.boolean().optional(),
  isAddressDelivery: z.boolean().optional(),
});

/** POST /api/parcels/[id]/payment */
export const acceptPaymentSchema = z.object({
  amount: z.number().finite().positive('Сума має бути більше 0').max(1_000_000),
  paymentMethod: paymentMethodSchema,
  currency: z.enum(['EUR', 'UAH']),
  description: z.string().trim().max(500).optional().nullable(),
});

/** POST /api/parcels/bulk-paid */
export const bulkPaidSchema = z.object({
  parcelIds: z.array(uuidSchema).min(1).max(500),
  isPaid: z.boolean(),
});
