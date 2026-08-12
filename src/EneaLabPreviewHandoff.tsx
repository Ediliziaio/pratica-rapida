import { useEffect } from "react";
import { ENEA_LAB_PREVIEW_PATH, reloadIntoIsolatedEneaShell } from "./appBootstrap";

export default function EneaLabPreviewHandoff({ targetPath = ENEA_LAB_PREVIEW_PATH }: { targetPath?: string }) {
  useEffect(() => reloadIntoIsolatedEneaShell(window.location, targetPath), [targetPath]);
  return null;
}
