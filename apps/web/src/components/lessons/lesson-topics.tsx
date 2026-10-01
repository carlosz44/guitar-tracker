import {
  LESSON_RELATIONS,
  type LessonRelation,
  TOPIC_CATEGORIES,
  type TopicCategory,
} from "@ds/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { es } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { topicsQuery } from "@/lib/queries";

type LinkedTopic = { id: string; title: string; category: string; status: string };
type Groups = Record<LessonRelation, LinkedTopic[]>;

function linksOf(groups: Groups) {
  return LESSON_RELATIONS.flatMap((relation) =>
    groups[relation].map((topic) => ({ topicId: topic.id, relation })),
  );
}

export function LessonTopics({ lessonId, topics }: { lessonId: string; topics: Groups }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (links: { topicId: string; relation: LessonRelation }[]) =>
      (
        await ensureOk(
          await api.lessons[":id"].topics.$put({ param: { id: lessonId }, json: links }),
        )
      ).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lessons"] }),
    onError: (error) => toast.error(errorMessage(error, es.linking.error)),
  });
  const links = linksOf(topics);
  const groups = LESSON_RELATIONS.filter((relation) => topics[relation].length > 0);

  return (
    <div className="flex flex-col gap-4">
      {groups.length === 0 && <p className="text-muted-foreground">{es.lessonPage.noTopics}</p>}
      {groups.map((relation) => (
        <div key={relation}>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {es.relationGroups[relation]}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {topics[relation].map((topic) => (
              <li
                key={topic.id}
                className="flex items-center rounded-full bg-secondary pl-3 text-sm"
              >
                <Link to="/topics/$topicId" params={{ topicId: topic.id }} className="py-2">
                  {topic.title}
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  aria-label={es.linking.remove(topic.title)}
                  onClick={() => save.mutate(links.filter((link) => link.topicId !== topic.id))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <TopicLinker
        linkedIds={new Set(links.map((link) => link.topicId))}
        onLink={(topicId, relation) => save.mutate([...links, { topicId, relation }])}
      />
    </div>
  );
}

function TopicLinker({
  linkedIds,
  onLink,
}: {
  linkedIds: Set<string>;
  onLink: (topicId: string, relation: LessonRelation) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [relation, setRelation] = useState<LessonRelation>("introduced");
  const [creating, setCreating] = useState<string | null>(null);
  const [category, setCategory] = useState<TopicCategory>("technique");
  const { data } = useQuery({ ...topicsQuery(), enabled: open });
  const candidates = (data?.topics ?? []).filter(
    (topic) => !linkedIds.has(topic.id) && topic.status !== "archived",
  );
  const trimmed = search.trim();
  const exists = (data?.topics ?? []).some(
    (topic) => topic.title.toLowerCase() === trimmed.toLowerCase(),
  );

  const close = () => {
    setOpen(false);
    setSearch("");
    setCreating(null);
  };

  const create = useMutation({
    mutationFn: async (title: string) =>
      (await ensureOk(await api.topics.$post({ json: { title, category } }))).json(),
    onSuccess: async ({ topic }) => {
      await queryClient.invalidateQueries({ queryKey: ["topics"] });
      onLink(topic.id, relation);
      close();
    },
    onError: (error) => toast.error(errorMessage(error, es.topicForm.saveError)),
  });

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="self-start">
          <Plus aria-hidden />
          {es.linking.title}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-3">
        <div className="mb-3 flex flex-col gap-1 text-sm">
          <label htmlFor="link-relation" className="text-muted-foreground">
            {es.linking.relation}
          </label>
          <NativeSelect
            id="link-relation"
            value={relation}
            onChange={(event) => setRelation(event.target.value as LessonRelation)}
          >
            {LESSON_RELATIONS.map((value) => (
              <option key={value} value={value}>
                {es.relations[value]}
              </option>
            ))}
          </NativeSelect>
        </div>
        {creating === null ? (
          <Command>
            <CommandInput
              placeholder={es.linking.search}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{es.linking.noResults}</CommandEmpty>
              <CommandGroup>
                {candidates.map((topic) => (
                  <CommandItem
                    key={topic.id}
                    value={topic.title}
                    onSelect={() => {
                      onLink(topic.id, relation);
                      close();
                    }}
                  >
                    {topic.title}
                  </CommandItem>
                ))}
              </CommandGroup>
              {trimmed && !exists && (
                <CommandGroup forceMount>
                  <CommandItem
                    forceMount
                    value={`create:${trimmed}`}
                    onSelect={() => setCreating(trimmed)}
                  >
                    <Plus aria-hidden />
                    {es.linking.create(trimmed)}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="font-medium">{es.linking.createTitle(creating)}</p>
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor="link-category" className="text-muted-foreground">
                {es.linking.category}
              </label>
              <NativeSelect
                id="link-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as TopicCategory)}
              >
                {TOPIC_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {es.categories[value]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => create.mutate(creating)} disabled={create.isPending}>
                {es.linking.link}
              </Button>
              <Button variant="outline" onClick={() => setCreating(null)}>
                {es.topicForm.cancel}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
