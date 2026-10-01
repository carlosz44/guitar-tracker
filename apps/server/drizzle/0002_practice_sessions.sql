CREATE TABLE "practice_days" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"target_minutes" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_days_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"paused_seconds" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"source" text DEFAULT 'timer' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"plan_day_id" uuid,
	"practice_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_sessions_status_check" CHECK ("practice_sessions"."status" IN ('in_progress', 'completed', 'abandoned')),
	CONSTRAINT "practice_sessions_source_check" CHECK ("practice_sessions"."source" IN ('timer', 'manual', 'telegram')),
	CONSTRAINT "practice_sessions_paused_seconds_check" CHECK ("practice_sessions"."paused_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "session_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"topic_id" uuid,
	"label" text,
	"planned_seconds" integer NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"paused_seconds" integer DEFAULT 0 NOT NULL,
	"actual_seconds" integer,
	"clean_bpm" smallint,
	"rating" smallint,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_blocks_topic_or_label_check" CHECK ("session_blocks"."topic_id" IS NOT NULL OR coalesce("session_blocks"."label", '') <> ''),
	CONSTRAINT "session_blocks_rating_check" CHECK ("session_blocks"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "session_blocks_clean_bpm_check" CHECK ("session_blocks"."clean_bpm" BETWEEN 20 AND 400),
	CONSTRAINT "session_blocks_seconds_check" CHECK ("session_blocks"."planned_seconds" > 0 AND "session_blocks"."actual_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "practice_days" ADD CONSTRAINT "practice_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blocks" ADD CONSTRAINT "session_blocks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blocks" ADD CONSTRAINT "session_blocks_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blocks" ADD CONSTRAINT "session_blocks_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_sessions_user_id_practice_date_index" ON "practice_sessions" USING btree ("user_id","practice_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "practice_sessions_one_in_progress" ON "practice_sessions" USING btree ("user_id") WHERE "practice_sessions"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "practice_sessions_status_last_activity_at_index" ON "practice_sessions" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_blocks_session_id_position_index" ON "session_blocks" USING btree ("session_id","position");--> statement-breakpoint
CREATE INDEX "session_blocks_topic_id_ended_at_index" ON "session_blocks" USING btree ("topic_id","ended_at" DESC NULLS LAST);