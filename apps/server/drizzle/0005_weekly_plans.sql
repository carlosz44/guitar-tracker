CREATE TABLE "plan_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"target_minutes" smallint NOT NULL,
	"focus_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_days_planId_date_unique" UNIQUE("plan_id","date"),
	CONSTRAINT "plan_days_target_check" CHECK ("plan_days"."target_minutes" BETWEEN 10 AND 240)
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_day_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"topic_id" uuid,
	"label" text,
	"minutes" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_items_planDayId_position_unique" UNIQUE("plan_day_id","position"),
	CONSTRAINT "plan_items_topic_or_label_check" CHECK ("plan_items"."topic_id" IS NOT NULL OR "plan_items"."label" IS NOT NULL),
	CONSTRAINT "plan_items_minutes_check" CHECK ("plan_items"."minutes" >= 5 AND "plan_items"."minutes" % 5 = 0)
);
--> statement-breakpoint
CREATE TABLE "weekly_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle_start" date NOT NULL,
	"cycle_end" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"week_note" text DEFAULT '' NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'rules' NOT NULL,
	"llm_status" text DEFAULT 'skipped' NOT NULL,
	"llm_error" text,
	"llm_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plans_status_check" CHECK ("weekly_plans"."status" IN ('draft', 'active', 'replaced')),
	CONSTRAINT "weekly_plans_source_check" CHECK ("weekly_plans"."source" IN ('rules', 'claude')),
	CONSTRAINT "weekly_plans_llm_status_check" CHECK ("weekly_plans"."llm_status" IN ('queued', 'running', 'done', 'rejected', 'failed', 'skipped')),
	CONSTRAINT "weekly_plans_cycle_check" CHECK ("weekly_plans"."cycle_end" >= "weekly_plans"."cycle_start")
);
--> statement-breakpoint
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_day_id_plan_days_id_fk" FOREIGN KEY ("plan_day_id") REFERENCES "public"."plan_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_llm_run_id_llm_runs_id_fk" FOREIGN KEY ("llm_run_id") REFERENCES "public"."llm_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_items_topic_id_index" ON "plan_items" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plans_one_draft" ON "weekly_plans" USING btree ("user_id","cycle_start") WHERE "weekly_plans"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plans_one_active" ON "weekly_plans" USING btree ("user_id","cycle_start") WHERE "weekly_plans"."status" = 'active';--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_plan_day_id_plan_days_id_fk" FOREIGN KEY ("plan_day_id") REFERENCES "public"."plan_days"("id") ON DELETE set null ON UPDATE no action;