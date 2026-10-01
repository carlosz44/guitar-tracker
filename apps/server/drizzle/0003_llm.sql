CREATE TABLE "llm_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"payload" jsonb,
	"review" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"skipped_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"llm_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_drafts_kind_check" CHECK ("llm_drafts"."kind" IN ('lesson_enrichment', 'topic_improve')),
	CONSTRAINT "llm_drafts_subject_check" CHECK ("llm_drafts"."subject_type" IN ('lesson', 'topic')),
	CONSTRAINT "llm_drafts_status_check" CHECK ("llm_drafts"."status" IN ('queued', 'running', 'pending', 'accepted', 'discarded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "llm_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"subject_type" text,
	"subject_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_runs_feature_check" CHECK ("llm_runs"."feature" IN ('lesson_enrichment', 'weekly_plan', 'weekly_review', 'topic_improve', 'log_parse')),
	CONSTRAINT "llm_runs_status_check" CHECK ("llm_runs"."status" IN ('ok', 'error'))
);
--> statement-breakpoint
ALTER TABLE "llm_drafts" ADD CONSTRAINT "llm_drafts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_drafts" ADD CONSTRAINT "llm_drafts_llm_run_id_llm_runs_id_fk" FOREIGN KEY ("llm_run_id") REFERENCES "public"."llm_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_runs" ADD CONSTRAINT "llm_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_drafts_subject_type_subject_id_created_at_index" ON "llm_drafts" USING btree ("subject_type","subject_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "llm_drafts_one_active" ON "llm_drafts" USING btree ("user_id","subject_type","subject_id") WHERE "llm_drafts"."status" IN ('queued', 'running', 'pending');--> statement-breakpoint
CREATE INDEX "llm_runs_user_id_created_at_index" ON "llm_runs" USING btree ("user_id","created_at");