CREATE TABLE "lc_auth"."account" (
	"id" uuid PRIMARY KEY DEFAULT lc.uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"scope" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lc_auth"."app_user" (
	"id" uuid PRIMARY KEY DEFAULT lc.uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_name_check" CHECK (char_length("lc_auth"."app_user"."name") BETWEEN 1 AND 30 AND "lc_auth"."app_user"."name" !~ '^[[:space:]]|[[:space:]]$'),
	CONSTRAINT "app_user_email_length_check" CHECK (char_length("lc_auth"."app_user"."email") <= 254),
	CONSTRAINT "app_user_email_lower_check" CHECK ("lc_auth"."app_user"."email" = lower("lc_auth"."app_user"."email"))
);
--> statement-breakpoint
CREATE TABLE "lc"."household" (
	"id" uuid PRIMARY KEY DEFAULT lc.uuidv7() NOT NULL,
	"name" text NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_name_check" CHECK (char_length("lc"."household"."name") BETWEEN 1 AND 50 AND "lc"."household"."name" !~ '^[[:space:]]|[[:space:]]$'),
	CONSTRAINT "household_member_count_nonneg" CHECK ("lc"."household"."member_count" >= 0),
	CONSTRAINT "household_member_limit" CHECK ("lc"."household"."member_count" <= 10),
	CONSTRAINT "household_item_count_nonneg" CHECK ("lc"."household"."item_count" >= 0),
	CONSTRAINT "household_item_limit" CHECK ("lc"."household"."item_count" <= 200)
);
--> statement-breakpoint
CREATE TABLE "lc"."invite_code" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_code_format" CHECK ("lc"."invite_code"."code" ~ '^[0-9A-HJKMNP-TV-Z]{10}$')
);
--> statement-breakpoint
CREATE TABLE "lc"."membership" (
	"id" uuid PRIMARY KEY DEFAULT lc.uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"display_name" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_role_check" CHECK ("lc"."membership"."role" IN ('owner', 'member')),
	CONSTRAINT "membership_display_name_check" CHECK (char_length("lc"."membership"."display_name") BETWEEN 1 AND 30 AND "lc"."membership"."display_name" !~ '^[[:space:]]|[[:space:]]$')
);
--> statement-breakpoint
CREATE TABLE "lc_auth"."session" (
	"id" uuid PRIMARY KEY DEFAULT lc.uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lc_auth"."verification" (
	"id" uuid PRIMARY KEY DEFAULT lc.uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lc_auth"."account" ADD CONSTRAINT "account_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "lc_auth"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lc"."invite_code" ADD CONSTRAINT "invite_code_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "lc"."household"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lc"."membership" ADD CONSTRAINT "membership_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "lc"."household"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lc"."membership" ADD CONSTRAINT "membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "lc_auth"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lc_auth"."session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "lc_auth"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_key" ON "lc_auth"."account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "lc_auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_key" ON "lc_auth"."app_user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_code_code_key" ON "lc"."invite_code" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_user_key" ON "lc"."membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_one_owner_idx" ON "lc"."membership" USING btree ("household_id") WHERE role = 'owner';--> statement-breakpoint
CREATE INDEX "membership_household_idx" ON "lc"."membership" USING btree ("household_id","joined_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_key" ON "lc_auth"."session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "lc_auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "lc_auth"."verification" USING btree ("identifier");