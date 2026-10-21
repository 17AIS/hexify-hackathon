CREATE TABLE "tests" (
	"id" serial PRIMARY KEY,
	"client_id" text NOT NULL,
	"duration" integer NOT NULL,
	"practice" boolean DEFAULT false NOT NULL,
	"scaled" real NOT NULL,
	"net" real NOT NULL,
	"raw" real NOT NULL,
	"accuracy" real NOT NULL,
	"consistency" real NOT NULL,
	"start_level" integer NOT NULL,
	"final_level" integer NOT NULL,
	"peak_level" integer NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tests_client_created_idx" ON "tests" ("client_id","created_at");