CREATE TABLE "lesson_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"r2_key" text NOT NULL,
	"sha256" text,
	"upload_status" text DEFAULT 'uploading' NOT NULL,
	"extraction_status" text DEFAULT 'pending' NOT NULL,
	"extraction_error" text,
	"extracted_text" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_files_r2Key_unique" UNIQUE("r2_key"),
	CONSTRAINT "lesson_files_kind_check" CHECK ("lesson_files"."kind" IN ('guitar_pro', 'pdf', 'docx', 'image', 'other')),
	CONSTRAINT "lesson_files_upload_status_check" CHECK ("lesson_files"."upload_status" IN ('uploading', 'uploaded')),
	CONSTRAINT "lesson_files_extraction_status_check" CHECK ("lesson_files"."extraction_status" IN ('pending', 'done', 'failed', 'not_applicable'))
);
--> statement-breakpoint
CREATE TABLE "lesson_topics" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_topics_lesson_id_topic_id_pk" PRIMARY KEY("lesson_id","topic_id"),
	CONSTRAINT "lesson_topics_relation_check" CHECK ("lesson_topics"."relation" IN ('introduced', 'extended', 'reviewed'))
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"raw_notes" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"practice_points" text[] DEFAULT '{}' NOT NULL,
	"homework" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'final' NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_status_check" CHECK ("lessons"."status" IN ('draft', 'final')),
	CONSTRAINT "lessons_source_check" CHECK ("lessons"."source" IN ('web', 'telegram'))
);
--> statement-breakpoint
CREATE TABLE "teacher_questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"topic_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"answer" text,
	"answered_in_lesson_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_questions_status_check" CHECK ("teacher_questions"."status" IN ('open', 'answered', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"parent_id" uuid,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" smallint DEFAULT 2 NOT NULL,
	"practice_points" text[] DEFAULT '{}' NOT NULL,
	"success_criteria" text DEFAULT '' NOT NULL,
	"target_bpm" smallint,
	"default_block_minutes" smallint DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_category_check" CHECK ("topics"."category" IN ('technique', 'scales_modes', 'chords_arpeggios', 'rhythm', 'repertoire', 'ear', 'theory', 'other')),
	CONSTRAINT "topics_status_check" CHECK ("topics"."status" IN ('new', 'active', 'maintenance', 'archived')),
	CONSTRAINT "topics_priority_check" CHECK ("topics"."priority" BETWEEN 1 AND 3),
	CONSTRAINT "topics_target_bpm_check" CHECK ("topics"."target_bpm" BETWEEN 20 AND 400),
	CONSTRAINT "topics_default_block_minutes_check" CHECK ("topics"."default_block_minutes" BETWEEN 5 AND 60),
	CONSTRAINT "topics_parent_not_self_check" CHECK ("topics"."parent_id" <> "topics"."id")
);
--> statement-breakpoint
ALTER TABLE "lesson_files" ADD CONSTRAINT "lesson_files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_files" ADD CONSTRAINT "lesson_files_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_topics" ADD CONSTRAINT "lesson_topics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_topics" ADD CONSTRAINT "lesson_topics_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_topics" ADD CONSTRAINT "lesson_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_questions" ADD CONSTRAINT "teacher_questions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_questions" ADD CONSTRAINT "teacher_questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_questions" ADD CONSTRAINT "teacher_questions_answered_in_lesson_id_lessons_id_fk" FOREIGN KEY ("answered_in_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_id_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_files_lesson_id_index" ON "lesson_files" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_files_upload_status_created_at_index" ON "lesson_files" USING btree ("upload_status","created_at");--> statement-breakpoint
CREATE INDEX "lesson_topics_topic_id_index" ON "lesson_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "lessons_user_id_date_index" ON "lessons" USING btree ("user_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "teacher_questions_user_id_status_index" ON "teacher_questions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "topics_user_id_status_index" ON "topics" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "topics_parent_id_index" ON "topics" USING btree ("parent_id");