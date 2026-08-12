import { useEffect } from "react";
import { reloadIntoIsolatedEneaPreview } from "./appBootstrap";

export default function EneaLabPreviewHandoff() {
  useEffect(() => reloadIntoIsolatedEneaPreview(window.location), []);
  return null;
}
