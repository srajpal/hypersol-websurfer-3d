/**
 * Entries for the right-click menu on a web page, from what was clicked.
 * Pure, so it can be unit tested; main/guests.ts turns it into a menu.
 */

export interface MenuParams {
  linkURL: string;
  selectionText: string;
  isEditable: boolean;
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
}

export interface MenuNav {
  canGoBack: boolean;
  canGoForward: boolean;
}

export type MenuAction =
  | 'open-link-new-tab'
  | 'copy-link'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'select-all'
  | 'back'
  | 'forward'
  | 'reload';

export type MenuEntry = { action: MenuAction; label: string; enabled: boolean } | { separator: true };

const isWebLink = (url: string) => /^https?:\/\//i.test(url);

export function contextMenuEntries(params: MenuParams, nav: MenuNav): MenuEntry[] {
  const groups: MenuEntry[][] = [];
  const link = isWebLink(params.linkURL);
  if (link) {
    groups.push([
      { action: 'open-link-new-tab', label: 'Open link in new tab', enabled: true },
      { action: 'copy-link', label: 'Copy link address', enabled: true },
    ]);
  }
  if (params.isEditable) {
    const f = params.editFlags;
    groups.push([
      { action: 'cut', label: 'Cut', enabled: f.canCut },
      { action: 'copy', label: 'Copy', enabled: f.canCopy },
      { action: 'paste', label: 'Paste', enabled: f.canPaste },
      { action: 'select-all', label: 'Select all', enabled: f.canSelectAll },
    ]);
  } else if (params.selectionText.trim() !== '') {
    groups.push([{ action: 'copy', label: 'Copy', enabled: true }]);
  }
  if (!link && !params.isEditable && params.selectionText.trim() === '') {
    groups.push([
      { action: 'back', label: 'Back', enabled: nav.canGoBack },
      { action: 'forward', label: 'Forward', enabled: nav.canGoForward },
      { action: 'reload', label: 'Reload', enabled: true },
    ]);
  }
  const entries: MenuEntry[] = [];
  groups.forEach((group, i) => {
    if (i > 0) entries.push({ separator: true });
    entries.push(...group);
  });
  return entries;
}
