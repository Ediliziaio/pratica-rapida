export interface AprInfissiPortalProbePreparation {
  script: string;
  writesPortal: false;
  clicksControls: false;
}

/**
 * Probe read-only della pagina ENEA aperta.
 * Raccoglie struttura/label/opzioni dei controlli senza impostare value,
 * dispatchare eventi, cliccare pulsanti o navigare. Serve a congelare il
 * contratto tecnico Infissi direttamente dall'interfaccia 2026 osservata.
 */
export function buildAprInfissiPortalProbeScript(): AprInfissiPortalProbePreparation {
  const script = `(() => {
  const text = (node) => String(node?.textContent ?? "").replace(/\\s+/g, " ").trim();
  const labelFor = (element) => {
    if (element.id) {
      const explicit = document.querySelector('label[for="' + CSS.escape(element.id) + '"]');
      if (explicit) return text(explicit);
    }
    const parentLabel = element.closest('label');
    if (parentLabel) return text(parentLabel);
    const group = element.closest('.form-group, .mb-3, .row, fieldset, .input-group');
    if (group) {
      const candidate = group.querySelector('label, legend, .form-label');
      if (candidate) return text(candidate);
    }
    return '';
  };
  const controls = Array.from(document.querySelectorAll('input, select, textarea, button')).map((element) => ({
    tag: element.tagName,
    id: element.id || '',
    name: element.getAttribute('name') || '',
    type: element.getAttribute('type') || (element.tagName === 'SELECT' ? 'select-one' : ''),
    label: labelFor(element) || (element.tagName === 'BUTTON' ? text(element) : ''),
    required: Boolean(element.required),
    disabled: Boolean(element.disabled),
    choices: element.tagName === 'SELECT'
      ? Array.from(element.options).map((option) => ({ value: option.value, text: text(option) }))
      : undefined,
  }));
  return {
    title: document.title,
    path: location.pathname,
    headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,legend')).map(text).filter(Boolean),
    controls,
  };
})()`;

  return { script, writesPortal: false, clicksControls: false };
}
