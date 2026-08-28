import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PlaybookVars = {
  request: string;
  requester: string;
  app: string;
  id: string;
};

export function loadPlaybook(name: string): string {
  const path = join(process.cwd(), "playbooks", `${name}.md`);
  return readFileSync(path, "utf8");
}

export function interpolate(template: string, vars: PlaybookVars): string {
  return template
    .replaceAll("{{request}}", vars.request)
    .replaceAll("{{requester}}", vars.requester)
    .replaceAll("{{app}}", vars.app)
    .replaceAll("{{id}}", vars.id);
}
