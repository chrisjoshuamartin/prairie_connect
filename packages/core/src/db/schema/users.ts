import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/** Roles are plain text (not pg enums) to avoid RDS Data API enum-cast pain. */
export const USER_ROLES = ["member", "operator", "edo", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  cognitoSub: text("cognito_sub").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").$type<UserRole>().notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
