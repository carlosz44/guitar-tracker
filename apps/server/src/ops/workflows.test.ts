import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflowsDir = fileURLToPath(new URL("../../../../.github/workflows/", import.meta.url));

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string | boolean>;
  env?: Record<string, string>;
}
interface Job {
  needs?: string | string[];
  uses?: string;
  permissions?: Record<string, string>;
  services?: Record<string, { image: string }>;
  steps?: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

function load(name: string) {
  return parse(readFileSync(`${workflowsDir}${name}`, "utf8")) as Workflow;
}

const deploy = load("deploy.yml");
const ci = load("ci.yml");

function job(workflow: Workflow, name: string): Job {
  const found = workflow.jobs[name];
  if (!found) throw new Error(`job ${name} missing`);
  return found;
}

function runOf(steps: Step[] | undefined, name: string) {
  const step = steps?.find((candidate) => candidate.name === name);
  if (!step?.run) throw new Error(`step ${name} missing`);
  return step.run;
}

describe("workflows", () => {
  it("AC-9: never run on pull_request_target", () => {
    for (const file of readdirSync(workflowsDir)) {
      expect(Object.keys(load(file).on), file).not.toContain("pull_request_target");
    }
  });

  it("AC-9: deploy runs only on push to main or manual dispatch", () => {
    expect(deploy.on).toEqual({ push: { branches: ["main"] }, workflow_dispatch: null });
  });

  it("AC-9: lint, typecheck and tests (against Postgres 16) gate the build", () => {
    expect(job(deploy, "test").uses).toBe("./.github/workflows/ci.yml");
    expect(ci.on).toHaveProperty("workflow_call");
    const test = job(ci, "test");
    expect(test.services?.postgres?.image).toBe("postgres:16-alpine");
    const commands = test.steps?.map((step) => step.run) ?? [];
    for (const command of ["pnpm lint", "pnpm typecheck", "pnpm test"]) {
      expect(commands).toContain(command);
    }
  });

  it("AC-9: nothing is built or deployed unless the previous job passed", () => {
    expect(job(deploy, "build").needs).toBe("test");
    expect(job(deploy, "deploy").needs).toBe("build");
  });

  it("AC-9: pushes the image to GHCR tagged with the commit SHA and latest", () => {
    const push = job(deploy, "build").steps?.find((step) =>
      step.uses?.startsWith("docker/build-push-action"),
    );
    expect(push?.with?.push).toBe(true);
    const tags = String(push?.with?.tags).trim().split("\n");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions, not JS templates.
    expect(tags).toEqual(["${{ env.IMAGE }}:${{ github.sha }}", "${{ env.IMAGE }}:latest"]);
  });

  it("AC-9: deploys that exact image, migrating before replacing the containers", () => {
    const steps = job(deploy, "deploy").steps;
    expect(runOf(steps, "Write .env from secrets")).toContain('IMAGE_TAG=%s\\n\' "$GITHUB_SHA"');
    const script = runOf(steps, "Pull, migrate and start");
    const lines = script.split("\n").map((line) => line.trim());
    const order = [
      "docker login ghcr.io",
      "docker compose -f compose.prod.yml pull",
      "docker logout ghcr.io",
      "docker compose -f compose.prod.yml up -d --wait db",
      "docker compose -f compose.prod.yml run --rm api node apps/server/dist/migrate.js",
      "docker compose -f compose.prod.yml up -d --remove-orphans",
    ].map((command) => lines.findIndex((line) => line.startsWith(command)));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(script).toContain("set -euo pipefail");
  });

  it("AC-9: finishes only after /api/health answers, with retries", () => {
    const check = runOf(job(deploy, "deploy").steps, "Health check");
    expect(check).toContain('curl -fsS --max-time 5 "$APP_URL/api/health"');
    expect(check).toMatch(/for attempt in \$\(seq 1 10\)/);
    expect(check.trim().endsWith("exit 1")).toBe(true);
  });

  it("scopes tokens: only build can push packages, deploy can only read", () => {
    expect(deploy.permissions).toEqual({ contents: "read" });
    expect(ci.permissions).toEqual({ contents: "read" });
    expect(job(deploy, "build").permissions).toEqual({ contents: "read", packages: "write" });
    expect(job(deploy, "deploy").permissions).toEqual({ contents: "read", packages: "read" });
  });

  it("pins the VPS host key instead of trusting it on first use", () => {
    const ssh = runOf(job(deploy, "deploy").steps, "Configure SSH (pinned host key)");
    expect(ssh).toContain("StrictHostKeyChecking yes");
    expect(ssh).toContain('"$VPS_KNOWN_HOSTS" > ~/.ssh/known_hosts');
    expect(ssh).not.toContain("ssh-keyscan");
  });

  it("writes .env with owner-only permissions and an URL-encoded database password", () => {
    const write = runOf(job(deploy, "deploy").steps, "Write .env from secrets");
    expect(write).toContain("umask 077");
    expect(write).toContain("encodeURIComponent(process.env.POSTGRES_PASSWORD)");
  });

  it("005 AC-16: passes the Claude key from secrets and the monthly budget", () => {
    const step = job(deploy, "deploy").steps?.find((s) => s.name === "Write .env from secrets");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions, not JS templates.
    expect(step?.env?.ANTHROPIC_API_KEY).toBe("${{ secrets.ANTHROPIC_API_KEY }}");
    const write = runOf(job(deploy, "deploy").steps, "Write .env from secrets");
    expect(write).toContain("ANTHROPIC_API_KEY=%s");
    expect(write).toContain("LLM_MONTHLY_BUDGET_USD=%s");
  });
});
