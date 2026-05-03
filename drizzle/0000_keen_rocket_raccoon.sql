CREATE TABLE "developer_console" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_name" varchar(55),
	"base_url" varchar(250) NOT NULL,
	"redirect_url" varchar(322) NOT NULL,
	"client_id" varchar(255) NOT NULL,
	"client_secret" varchar(255) NOT NULL,
	"salt" text,
	"code" varchar(322),
	"code_expire_at" timestamp,
	"token" varchar(322),
	"token_expire_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "developer_console_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "developer_console_code_unique" UNIQUE("code"),
	CONSTRAINT "developer_console_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(25),
	"last_name" varchar(25),
	"profile_image_url" text,
	"email" varchar(322) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"password" varchar(66),
	"salt" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "developer_console" ADD CONSTRAINT "developer_console_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;