import { Hono } from "hono";
import type { SessionVariables } from "../auth/require-session";
import type { Clock } from "../clock";
import type { Database } from "../db/client";
import { activePlanDay } from "../planner/queries";
import { dayTarget } from "../planner/rules";
import { getOrCreateSettings } from "../settings";
import {
  activeSessionId,
  dayTotals,
  latestLessonWithTopics,
  openQuestionsCount,
  topicsWithStats,
} from "./queries";
import { isMet, practiceDate, streak, suggestBlocks } from "./rules";

export function createTodayRoutes(deps: { db: Database; clock: Clock; defaultTimezone: string }) {
  const { db } = deps;
  return new Hono<{ Variables: SessionVariables }>().get("/", async (c) => {
    const userId = c.get("user").id;
    const settings = await getOrCreateSettings(db, userId, deps.defaultTimezone);
    const today = practiceDate(deps.clock.now(), settings.timezone);
    const [days, lesson, questions, activeId, allTopics] = await Promise.all([
      dayTotals(db, userId),
      latestLessonWithTopics(db, userId),
      openQuestionsCount(db, userId),
      activeSessionId(db, userId),
      topicsWithStats(db, userId),
    ]);
    const seconds = days.get(today)?.seconds ?? 0;
    const planDay = await activePlanDay(db, userId, today);
    const targetMinutes = planDay?.day.targetMinutes ?? dayTarget(settings, today);
    const stats = new Map(allTopics.map((topic) => [topic.id, topic.stats]));
    const suggestion = suggestBlocks({
      targetMinutes,
      latestLesson: lesson ? { date: lesson.date, topicIds: lesson.topicIds } : null,
      topics: allTopics.map((topic) => ({
        ...topic,
        lastPracticedDate: topic.stats.lastPracticedDate,
      })),
    });

    return c.json(
      {
        date: today,
        seconds,
        minutes: Math.floor(seconds / 60),
        targetMinutes,
        met: isMet(seconds, targetMinutes),
        streak: streak(days, today, targetMinutes),
        latestLesson: lesson
          ? { id: lesson.id, title: lesson.title, date: lesson.date, status: lesson.status }
          : null,
        openQuestionsCount: questions,
        activeSession: activeId ? { id: activeId } : null,
        plan: planDay
          ? {
              id: planDay.plan.id,
              dayId: planDay.day.id,
              focusNote: planDay.day.focusNote,
              blocks: planDay.items.map((item) => ({
                topicId: item.topicId,
                label: item.label,
                title: item.title ?? item.label ?? "",
                minutes: item.minutes,
                targetBpm: item.targetBpm ?? null,
                lastCleanBpm: item.topicId
                  ? (stats.get(item.topicId)?.latestCleanBpm ?? null)
                  : null,
              })),
            }
          : null,
        suggestion: {
          warmUpMinutes: suggestion.warmUpMinutes,
          topics: suggestion.topics.map(({ topic, minutes }) => ({
            topicId: topic.id,
            title: topic.title,
            minutes,
            targetBpm: topic.targetBpm,
            lastCleanBpm: topic.stats.latestCleanBpm,
          })),
        },
      },
      200,
    );
  });
}
