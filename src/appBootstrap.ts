import type { ComponentType } from "react";

type RootModule = { default: ComponentType };
type RootLoaders = {
  app: () => Promise<RootModule>;
  preview: () => Promise<RootModule>;
  fatturaRapida?: () => Promise<RootModule>;
};

export const ENEA_LAB_PREVIEW_PATH = "/admin/enea-lab-preview";
export const ENEA_SHADOW_CRM_PATH = "/admin/enea-crm-ombra";
export const FATTURA_RAPIDA_PATH = "/fattura-rapida";

type PreviewLocation = Pick<Location, "search" | "hash" | "replace">;

const DEFAULT_LOADERS: RootLoaders = {
  app: () => import("./App.tsx"),
  preview: () => import("./EneaLabPreviewApp.tsx"),
  fatturaRapida: () => import.meta.env.DEV
    ? import("./FatturaRapidaApp.tsx")
    : import("./App.tsx"),
};

export function isIsolatedFatturaRapida(isDev: boolean, pathname: string): boolean {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return isDev && normalizedPathname === FATTURA_RAPIDA_PATH;
}

export function isIsolatedEneaPreview(isDev: boolean, pathname: string): boolean {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return isDev && normalizedPathname === ENEA_LAB_PREVIEW_PATH;
}

export function isIsolatedEneaShell(isDev: boolean, pathname: string): boolean {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return isDev && (normalizedPathname === ENEA_LAB_PREVIEW_PATH || normalizedPathname === ENEA_SHADOW_CRM_PATH);
}

export function reloadIntoIsolatedEneaPreview(location: PreviewLocation): void {
  location.replace(`${ENEA_LAB_PREVIEW_PATH}${location.search}${location.hash}`);
}

export function reloadIntoIsolatedEneaShell(location: PreviewLocation, pathname: string): void {
  if (pathname !== ENEA_LAB_PREVIEW_PATH && pathname !== ENEA_SHADOW_CRM_PATH) return;
  location.replace(`${pathname}${location.search}${location.hash}`);
}

export function loadRootComponent(
  isDev: boolean,
  pathname: string,
  loaders: RootLoaders = DEFAULT_LOADERS,
): Promise<RootModule> {
  if (isIsolatedFatturaRapida(isDev, pathname)) return (loaders.fatturaRapida ?? DEFAULT_LOADERS.fatturaRapida!)();
  return isIsolatedEneaShell(isDev, pathname) ? loaders.preview() : loaders.app();
}
