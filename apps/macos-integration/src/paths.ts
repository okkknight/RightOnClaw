import path from "node:path";

export function getProjectRoot(): string {
  return path.resolve(__dirname, "../../..");
}

export function getPackageRoot(): string {
  return path.resolve(__dirname, "..");
}

export function getWorkspaceRoot(): string {
  return path.resolve(getProjectRoot(), "../..");
}

export function getRuntimeTmpDir(): string {
  return path.join(getWorkspaceRoot(), "runtime", "tmp", "rightonclaw");
}

export function getRuntimeLogDir(): string {
  return path.join(getWorkspaceRoot(), "runtime", "logs", "rightonclaw");
}
