import {
  uuid,
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  firstName: varchar("first_name", { length: 25 }),
  lastName: varchar("last_name", { length: 25 }),

  profileImageURL: text("profile_image_url"),

  email: varchar("email", { length: 322 }).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),

  password: varchar("password", { length: 66 }),
  salt: text("salt"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});



export const devConsoleTable = pgTable("developer_console", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),

  applicationName: varchar("application_name", { length: 55 }),

  baseUrl: varchar("base_url", { length: 250 }).notNull(),
  redirectUrl: varchar("redirect_url", { length: 322 }).notNull(),


  clientId: varchar("client_id", { length: 255 }).notNull().unique(),
  clientSecret: varchar("client_secret", { length: 255 }).notNull(),
  salt: text("salt"),

  code: varchar("code", { length: 322 }).unique(),
  codeExpireAt: timestamp("code_expire_at"),


  token: text("token").unique(),
  tokenExpireAt: timestamp("token_expire_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});
