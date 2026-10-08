import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  USE_MOCK_DATA: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  JWT_SECRET: z.string().min(16).default("development-secret-change-me"),
  SALESFORCE_LOGIN_URL: z
    .string()
    .url()
    .default("https://login.salesforce.com"),
  SALESFORCE_INSTANCE_URL: z.string().url().optional(),
  SALESFORCE_CLIENT_ID: z.string().optional(),
  SALESFORCE_CLIENT_SECRET: z.string().optional(),
  SALESFORCE_USERNAME: z.string().optional(),
  SALESFORCE_PASSWORD: z.string().optional(),
  SALESFORCE_SECURITY_TOKEN: z.string().optional(),
  SALESFORCE_ORG_ALIAS: z
    .string()
    .regex(/^[A-Za-z0-9_.@-]+$/)
    .default("sfaNewOrg"),
  SALESFORCE_REDIRECT_URI: z.string().optional(),
  SALESFORCE_API_VERSION: z.string().default("67.0"),
  AUTH_CODE_TTL_MINUTES: z.coerce.number().int().min(2).max(30).default(10),
  AUTH_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  AUTH_ALLOW_TEST_CODE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});
export const env = schema.parse(process.env);

export const objectMap = {
  distributor: process.env.DISTRIBUTOR_OBJECT || "Distributor__c",
  distributorAllocation:
    process.env.DISTRIBUTOR_ALLOCATION_OBJECT ||
    "Distributor_Outlet_Allocation__c",
  salesRep: process.env.SALES_REP_OBJECT || "Employee__c",
  beat: process.env.BEAT_OBJECT || "Beat__c",
  store: process.env.STORE_OBJECT || "Retailer__c",
  visit: process.env.VISIT_OBJECT || "Visit__c",
  order: process.env.ORDER_OBJECT || "Sales_Order__c",
  orderItem: process.env.ORDER_ITEM_OBJECT || "Order_Item__c",
  returns: process.env.RETURN_OBJECT || "Product_Return__c",
  competitor:
    process.env.COMPETITOR_ACTIVITY_OBJECT || "Competitor_Activity__c",
  ticket: process.env.TICKET_OBJECT || "SFA_Ticket__c",
  scheme: process.env.SCHEME_OBJECT || "Scheme__c",
  product: process.env.PRODUCT_OBJECT || "Product__c",
  attendance: process.env.ATTENDANCE_OBJECT || "Attendance__c",
  journeyPlan: process.env.JOURNEY_PLAN_OBJECT || "Permanent_Journey_Plan__c",
};
