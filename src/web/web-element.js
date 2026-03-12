export class WebElementInfoImpl {
    content;
    rect;
    center;
    id;
    indexId;
    attributes;
    xpaths;
    isVisible;
    constructor({ content, rect, id, attributes, indexId, xpaths, isVisible, }) {
        this.content = content;
        this.rect = rect;
        this.center = [
            Math.floor(rect.left + rect.width / 2),
            Math.floor(rect.top + rect.height / 2),
        ];
        this.id = id;
        this.attributes = attributes;
        this.indexId = indexId;
        this.xpaths = xpaths;
        this.isVisible = isVisible;
    }
}
export const limitOpenNewTabScript = `
if (!window.__MIDSCENE_NEW_TAB_INTERCEPTOR_INITIALIZED__) {
  window.__MIDSCENE_NEW_TAB_INTERCEPTOR_INITIALIZED__ = true;

  // Intercept the window.open method (only once)
  window.open = function(url) {
    console.log('Blocked window.open:', url);
    window.location.href = url;
    return null;
  };

  // Block all a tag clicks with target="_blank" (only once)
  document.addEventListener('click', function(e) {
    const target = e.target.closest('a');
    if (target && target.target === '_blank') {
      e.preventDefault();
      console.log('Blocked new tab:', target.href);
      window.location.href = target.href;
      target.removeAttribute('target');
    }
  }, true);
}
`;
