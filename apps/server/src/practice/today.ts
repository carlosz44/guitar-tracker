import { Hono } from "hono";
import type { SessionVariables } from "../auth/require-session";
import type { Clock } from "../clock";
import type { Database } from "../db/client";
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
    const suggestion = suggestBlocks({
      targetMinutes: settings.dailyTargetMinutes,
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
        targetMinutes: settings.dailyTargetMinutes,
        met: isMet(seconds, settings.dailyTargetMinutes),
        streak: streak(days, today, settings.dailyTargetMinutes),
        latestLesson: lesson
          ? { id: lesson.id, title: lesson.title, date: lesson.date, status: lesson.status }
          : null,
        openQuestionsCount: questions,
        activeSession: activeId ? { id: activeId } : null,
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
