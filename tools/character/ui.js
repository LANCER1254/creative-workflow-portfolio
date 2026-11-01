(function () {
  "use strict";

  const namespace = (window.CharacterSizeViewer = window.CharacterSizeViewer || {});

  function getElements() {
    return {
      pngInput: document.getElementById("png-input"),
      characterList: document.getElementById("character-list"),
      characterCount: document.getElementById("character-count"),
      warnings: document.getElementById("warnings"),
      previewList: document.getElementById("preview-list"),
      previewScale: document.getElementById("preview-scale"),
      previewScaleValue: document.getElementById("preview-scale-value"),
    };
  }

  function bindEvents(state, elements) {
    elements.previewScale.addEventListener("change", () => {
      state.setPreviewViewScale(Number(elements.previewScale.value));
      namespace.Renderer.render(state, elements);
    });

    elements.pngInput.addEventListener("change", async (event) => {
      state.clearWarnings();

      const result = await namespace.ImageLoader.loadPngFiles(event.target.files, state);

      for (const character of result.characters) {
        state.addCharacter(character);
      }

      for (const warning of result.warnings) {
        state.addWarning(warning);
      }

      namespace.Calculator.recalculate(state);
      namespace.Renderer.render(state, elements);
      event.target.value = "";
    });
  }

  namespace.UI = {
    getElements,
    bindEvents,
  };
})();
