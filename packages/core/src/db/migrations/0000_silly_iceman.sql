CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgrouting;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cognito_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_cognito_sub_unique" UNIQUE("cognito_sub")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'other' NOT NULL,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"organization_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sector" text DEFAULT 'other' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"address" text,
	"city" text,
	"province" text,
	"location" geography(Point,4326),
	"verified" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_listings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "corridors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"operator" text,
	"description" text,
	"geometry" geography(MultiLineString,4326),
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corridors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rail_edges" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" bigint NOT NULL,
	"target_id" bigint NOT NULL,
	"corridor_id" uuid,
	"operator" text,
	"mode" text DEFAULT 'shortline' NOT NULL,
	"length_km" double precision,
	"cost_weight" double precision DEFAULT 1 NOT NULL,
	"reverse_cost_weight" double precision DEFAULT 1 NOT NULL,
	"geometry" geography(LineString,4326),
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rail_nodes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text,
	"kind" text DEFAULT 'station' NOT NULL,
	"corridor_id" uuid,
	"location" geography(Point,4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"origin" jsonb NOT NULL,
	"destination" jsonb NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"geometry" jsonb,
	"reverse" boolean DEFAULT false NOT NULL,
	"curated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "directory_listings" ADD CONSTRAINT "directory_listings_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_listings" ADD CONSTRAINT "directory_listings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rail_edges" ADD CONSTRAINT "rail_edges_source_id_rail_nodes_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."rail_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rail_edges" ADD CONSTRAINT "rail_edges_target_id_rail_nodes_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."rail_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rail_edges" ADD CONSTRAINT "rail_edges_corridor_id_corridors_id_fk" FOREIGN KEY ("corridor_id") REFERENCES "public"."corridors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rail_nodes" ADD CONSTRAINT "rail_nodes_corridor_id_corridors_id_fk" FOREIGN KEY ("corridor_id") REFERENCES "public"."corridors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_routes" ADD CONSTRAINT "saved_routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;