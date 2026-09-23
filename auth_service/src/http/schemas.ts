import { z } from "zod";
import { ROLES } from "../policy/roles.js";

export const passwordSchema = z.string().min(12).max(128);

export const profileSchema = z.object({
  email: z.email(),
  password: passwordSchema.optional(),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(300),
  phone: z.string().trim().max(30).optional()
});

export const registerSchema = profileSchema.extend({
  password: passwordSchema
});

export const loginSchema = z.object({
  email: z.email(),
  password: passwordSchema,
  role: z.enum([
    ROLES.SUPER_ADMIN,
    ROLES.PARTNER_ADMIN,
    ROLES.PARTNER_USER,
    ROLES.CUSTOMER_ADMIN,
    ROLES.CUSTOMER_USER
  ]).optional(),
  partnerId: z.uuid().optional(),
  customerId: z.uuid().optional()
});

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export const contextSchema = z
  .object({
    role: loginSchema.shape.role,
    partnerId: z.uuid().optional(),
    customerId: z.uuid().optional()
  })
  .refine((value) => value.role || value.partnerId || value.customerId, {
    message: "A role or tenant id is required"
  });

export const createPartnerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  admin: registerSchema
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200)
});

export const invitePartnerMemberSchema = profileSchema.extend({
  role: z.enum([ROLES.PARTNER_ADMIN, ROLES.PARTNER_USER])
});

export const inviteCustomerMemberSchema = profileSchema.extend({
  role: z.enum([ROLES.CUSTOMER_ADMIN, ROLES.CUSTOMER_USER])
});
