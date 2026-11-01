(function () {
  "use strict";

  const namespace = (window.CharacterSizeViewer = window.CharacterSizeViewer || {});

  function init() {
    const state = new namespace.ViewerState();
    const elements = namespace.UI.getElements();

    namespace.UI.bindEvents(state, elements);
    namespace.Renderer.render(state, elements);

    namespace.state = state;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
