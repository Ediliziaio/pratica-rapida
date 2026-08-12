import type { ComponentType } from "react";

type RootModule = { default: ComponentType };
type RootLoaders = {
  app: () => Promise<RootModule>;
  preview: () => Promise<RootModule>;
};

export const ENEA_LAB_PREVIEW_PATH = "/admin/enea-lab-preview";

type PreviewLocation = Pick<Location, "search" | "hash" | "replace">;

const DEFAULT_LOADERS: RootLoaders = {
  app: () => import("./App.tsx"),
  preview: () => import("./EneaLabPreviewApp.tsx"),
};

export function isIsolatedEneaPreview(isDev: boolean, pathname: string): boolean {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return isDev && normalizedPathname === ENEA_LAB_PREVIEW_PATH;
}

export function reloadIntoIsolatedEneaPreview(location: PreviewLocation): void {
  location.replace(`${ENEA_LAB_PREVIEW_PATH}${location.search}${location.hash}`);
}

export function loadRootComponent(
  isDev: boolean,
  pathname: string,
  loaders: RootLoaders = DEFAULT_LOADERS,
): Promise<RootModule> {
  return isIsolatedEneaPreview(isDev, pathname) ? loaders.preview() : loaders.app();
}
