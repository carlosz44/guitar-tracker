import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";

const ZOOM_KEY = "ds.tabZoom";
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;

type StaveProfile = "Tab" | "ScoreTab";

interface AlphaTabInstance {
  settings: { display: { scale: number; staveProfile: unknown } };
  load(data: unknown): boolean;
  updateSettings(): void;
  render(): void;
  destroy(): void;
  error: { on(handler: (error: Error) => void): void };
  renderFinished: { on(handler: () => void): void };
}

export function readZoom() {
  try {
    const stored = Number(localStorage.getItem(ZOOM_KEY));
    return stored >= ZOOM_MIN && stored <= ZOOM_MAX ? stored : 1;
  } catch {
    return 1;
  }
}

function storeZoom(zoom: number) {
  try {
    localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {}
}

export function GuitarProViewer({ fileId }: { fileId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<AlphaTabInstance | null>(null);
  const [zoom, setZoom] = useState(readZoom);
  const [profile, setProfile] = useState<StaveProfile>("Tab");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // biome-ignore lint/correctness/useExhaustiveDependencies: alphaTab is created once per file; zoom and profile changes go through updateSettings.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [alphaTab, { url }] = await Promise.all([
          import("@coderline/alphatab"),
          (
            await ensureOk(await api.files[":id"].url.$get({ param: { id: fileId }, query: {} }))
          ).json(),
        ]);
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        if (cancelled || !container.current) return;
        const tab = new alphaTab.AlphaTabApi(container.current, {
          core: { useWorkers: true },
          display: { staveProfile: profile, scale: zoom, layoutMode: "Page" },
          player: { enablePlayer: false },
        }) as unknown as AlphaTabInstance;
        instance.current = tab;
        tab.error.on(() => setStatus("error"));
        tab.renderFinished.on(() => setStatus("ready"));
        if (!tab.load(bytes)) setStatus("error");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      instance.current?.destroy();
      instance.current = null;
    };
  }, [fileId]);

  const apply = (next: { zoom?: number; profile?: StaveProfile }) => {
    const tab = instance.current;
    if (!tab) return;
    if (next.zoom !== undefined) tab.settings.display.scale = next.zoom;
    if (next.profile !== undefined) tab.settings.display.staveProfile = next.profile;
    tab.updateSettings();
    tab.render();
  };

  const changeZoom = (delta: number) => {
    const next = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta)) * 10) / 10;
    setZoom(next);
    storeZoom(next);
    apply({ zoom: next });
  };

  const toggleNotation = () => {
    const next: StaveProfile = profile === "Tab" ? "ScoreTab" : "Tab";
    setProfile(next);
    apply({ profile: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={toggleNotation} aria-pressed={profile === "ScoreTab"}>
          {profile === "Tab" ? es.viewer.showNotation : es.viewer.tabOnly}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={es.viewer.zoomOut}
            onClick={() => changeZoom(-ZOOM_STEP)}
          >
            <Minus aria-hidden />
          </Button>
          <span className="w-14 text-center tabular-nums" data-testid="zoom">
            {es.viewer.zoomValue(Math.round(zoom * 100))}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={es.viewer.zoomIn}
            onClick={() => changeZoom(ZOOM_STEP)}
          >
            <Plus aria-hidden />
          </Button>
        </div>
      </div>
      {status === "loading" && <p className="text-muted-foreground">{es.viewer.loading}</p>}
      {status === "error" && (
        <p role="alert" className="text-destructive">
          {es.viewer.error}
        </p>
      )}
      <div
        ref={container}
        className="-mx-4 overflow-x-hidden bg-white text-black lg:mx-0 lg:rounded-xl"
      />
    </div>
  );
}
