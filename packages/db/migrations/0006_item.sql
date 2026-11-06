CREATE TABLE "lc"."item" (
	"id" uuid PRIMARY KEY DEFAULT lc.uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" text,
	"purchased" boolean DEFAULT false NOT NULL,
	"author_user_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_name_check" CHECK (char_length("lc"."item"."name") BETWEEN 1 AND 100 AND "lc"."item"."name" !~ '^[[:space:]]|[[:space:]]$'),
	CONSTRAINT "item_quantity_check" CHECK ("lc"."item"."quantity" IS NULL OR (char_length("lc"."item"."quantity") BETWEEN 1 AND 30 AND "lc"."item"."quantity" !~ '^[[:space:]]|[[:space:]]$')),
	CONSTRAINT "item_author_name_check" CHECK (char_length("lc"."item"."author_name") BETWEEN 1 AND 30 AND "lc"."item"."author_name" !~ '^[[:space:]]|[[:space:]]$')
);
--> statement-breakpoint
ALTER TABLE "lc"."item" ADD CONSTRAINT "item_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "lc"."household"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lc"."item" ADD CONSTRAINT "item_author_user_id_app_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "lc_auth"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_household_order_idx" ON "lc"."item" USING btree ("household_id","created_at","id");