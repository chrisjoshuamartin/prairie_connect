CREATE TABLE "rail_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"operator" text,
	"description" text,
	"geometry" geography(MultiLineString,4326) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rail_lines_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "corridors" ADD COLUMN "rail_line_id" uuid;--> statement-breakpoint
ALTER TABLE "rail_edges" ADD COLUMN "rail_line_id" uuid;--> statement-breakpoint
ALTER TABLE "rail_nodes" ADD COLUMN "rail_line_id" uuid;--> statement-breakpoint
ALTER TABLE "corridors" ADD CONSTRAINT "corridors_rail_line_id_rail_lines_id_fk" FOREIGN KEY ("rail_line_id") REFERENCES "public"."rail_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rail_edges" ADD CONSTRAINT "rail_edges_rail_line_id_rail_lines_id_fk" FOREIGN KEY ("rail_line_id") REFERENCES "public"."rail_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rail_nodes" ADD CONSTRAINT "rail_nodes_rail_line_id_rail_lines_id_fk" FOREIGN KEY ("rail_line_id") REFERENCES "public"."rail_lines"("id") ON DELETE no action ON UPDATE no action;