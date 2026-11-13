export type IconName =
  | "icon-wifi"
  | "icon-battery"
  | "icon-stop"
  | "icon-auto"
  | "icon-manual"
  | "icon-arrow-up"
  | "icon-arrow-down"
  | "icon-arrow-left"
  | "icon-arrow-right"
  | "icon-headlight"
  | "icon-taillight"
  | "icon-sliders"
  | "icon-chevron-down"
  | "icon-rotate-phone"
  | "icon-check"
  | "icon-shield";

const ICON_PATHS: Record<IconName, string> = {
  "icon-wifi":
    '<path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>',
  "icon-battery":
    '<rect x="2" y="7" width="16" height="10" rx="2"/><line x1="22" y1="11" x2="22" y2="13"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/>',
  "icon-stop":
    '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>',
  "icon-auto":
    '<path d="M4 19c0-5 16-3 16-9s-16-4-16-8"/><circle cx="12" cy="11" r="2.5" fill="currentColor"/>',
  "icon-manual":
    '<rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 12h4"/><path d="M8 10v4"/><circle cx="15.5" cy="13" r="1" fill="currentColor"/><circle cx="18" cy="11" r="1" fill="currentColor"/>',
  "icon-arrow-up":
    '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  "icon-arrow-down":
    '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  "icon-arrow-left":
    '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  "icon-arrow-right":
    '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "icon-headlight":
    '<path d="M11 6H6a4 4 0 0 0 0 8h5z"/><path d="M15 7h6"/><path d="M15 10h7"/><path d="M15 13h6"/>',
  "icon-taillight":
    '<rect x="3" y="6" width="8" height="8" rx="2"/><path d="M15 7l5-1"/><path d="M15 10h6"/><path d="M15 13l5 1"/>',
  "icon-sliders":
    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/>',
  "icon-chevron-down":
    '<path d="m6 9 6 6 6-6"/>',
  "icon-rotate-phone":
    '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/><path d="M2 12a10 10 0 0 1 10-10"/><path d="m9 5 3-3-3-3"/>',
  "icon-check":
    '<path d="M20 6 9 17l-5-5"/>',
  "icon-shield":
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
};

export function renderIcon(name: IconName, size = 16, extraClass = ""): string {
  const cls = extraClass ? ` class="${extraClass}"` : "";
  return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

export function hydrateIcons(root: ParentNode = document): void {
  const nodes = root.querySelectorAll<HTMLElement>("[data-icon]");
  nodes.forEach((node) => {
    const iconName = node.dataset.icon as IconName | undefined;
    if (!iconName || !(iconName in ICON_PATHS)) {
      return;
    }
    const sizeAttr = Number(node.dataset.iconSize ?? "16");
    const size = Number.isFinite(sizeAttr) && sizeAttr > 0 ? sizeAttr : 16;
    node.innerHTML = renderIcon(iconName, size);
  });
}
