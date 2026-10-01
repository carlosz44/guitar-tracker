import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

interface Service {
  image: string;
  command: string[];
  mem_limit: string;
  environment?: Record<string, string>;
  logging: { driver: string; options: Record<string, string> };
  networks?: Record<string, unknown> | string[];
  ports?: unknown[];
  depends_on?: Record<string, { condition: string }>;
}

const compose = parse(readFileSync(`${repoRoot}deploy/compose.prod.yml`, "utf8"), {
  merge: true,
}) as { name: string; services: Record<string, Service>; networks: Record<string, unknown> };
const { api, worker, db } = compose.services as Record<"api" | "worker" | "db", Service>;

function networksOf(service: Service) {
  const networks = service.networks ?? ["default"];
  return Array.isArray(networks) ? networks : Object.keys(networks);
}

describe("deploy/compose.prod.yml", () => {
  it("runs the guitar-tracker project with api, worker and db", () => {
    expect(compose.name).toBe("guitar-tracker");
    expect(Object.keys(compose.services).sort()).toEqual(["api", "db", "worker"]);
  });

  it("AC-11: caps memory at api 256 MiB, worker 384 MiB and db 256 MiB", () => {
    expect([api?.mem_limit, worker?.mem_limit, db?.mem_limit]).toEqual(["256m", "384m", "256m"]);
  });

  it("AC-11: sizes the Node heaps below the container limits", () => {
    expect(api?.environment?.NODE_OPTIONS).toBe("--max-old-space-size=192");
    expect(worker?.environment?.NODE_OPTIONS).toBe("--max-old-space-size=160");
  });

  it("AC-11: every container logs to json-file with max-size 10m and max-file 3", () => {
    for (const [name, service] of Object.entries(compose.services)) {
      expect(service.logging, name).toEqual({
        driver: "json-file",
        options: { "max-size": "10m", "max-file": "3" },
      });
    }
  });

  it("AC-12: only api joins the external edge network", () => {
    expect(compose.networks).toEqual({ edge: { external: true } });
    expect(networksOf(api as Service)).toEqual(["default", "edge"]);
    expect(networksOf(worker as Service)).toEqual(["default"]);
    expect(networksOf(db as Service)).toEqual(["default"]);
  });

  it("AC-12: no container publishes ports to the host", () => {
    for (const [name, service] of Object.entries(compose.services)) {
      expect(service.ports, name).toBeUndefined();
    }
  });

  it("starts api and worker from the same image, after the database is healthy", () => {
    expect(api?.image).toBe(worker?.image);
    expect(api?.command).toEqual(["node", "apps/server/dist/api.js"]);
    expect(worker?.command).toEqual(["node", "apps/server/dist/worker.js"]);
    for (const service of [api, worker]) {
      expect(service?.depends_on).toEqual({ db: { condition: "service_healthy" } });
    }
  });
});
