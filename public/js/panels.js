// Original 64px artwork stays square; only the inner content scrolls.
export function applyPanels(root, selector, kind) {
  for (const panel of root.querySelectorAll(selector)) {
    if (panel.classList.contains('village-panel')) continue;
    panel.classList.remove('pixel-panel');
    panel.classList.add('village-panel'); panel.dataset.kind = kind;
    const content = document.createElement('div');
    content.className = 'village-panel__content';
    while (panel.firstChild) content.append(panel.firstChild);
    const frame = document.createElement('img');
    frame.className = 'village-panel__frame'; frame.src = `/village/panels/${kind}.png`;
    frame.alt = ''; frame.width = 64; frame.height = 64;
    panel.append(frame, content);
  }
}
