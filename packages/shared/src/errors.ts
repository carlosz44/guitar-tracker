import type { FileErrorKey } from "./files.ts";
import type { LessonErrorKey } from "./lessons.ts";
import type { QuestionErrorKey } from "./questions.ts";
import type { SettingsErrorKey } from "./settings.ts";
import type { TopicErrorKey } from "./topics.ts";

export type ErrorKey =
  | SettingsErrorKey
  | FileErrorKey
  | LessonErrorKey
  | TopicErrorKey
  | QuestionErrorKey;
