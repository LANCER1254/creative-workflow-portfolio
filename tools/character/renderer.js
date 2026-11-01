(function () {
  "use strict";

  const namespace = (window.CharacterSizeViewer = window.CharacterSizeViewer || {});

  function renderCharacterList(state, elements) {
    elements.characterList.innerHTML = "";
    elements.characterCount.textContent = String(state.characters.length);

    if (state.characters.length === 0) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      row.innerHTML = '<td colspan="6">PNGを読み込むと一覧に追加されます。</td>';
      elements.characterList.appendChild(row);
      return;
    }

    const sortedCharacters = [...state.characters].sort((a, b) => a.order - b.order);

    for (const character of sortedCharacters) {
      const row = document.createElement("tr");
      row.dataset.characterId = character.id;
      const isBaseCharacter = state.base_character_id === character.id;
      row.classList.toggle("is-base-character", isBaseCharacter);

      const nameCell = document.createElement("td");
      nameCell.className = "character-name";
      nameCell.textContent = character.name;

      const fileCell = document.createElement("td");
      fileCell.className = "character-file";
      fileCell.textContent = character.image_file_name;

      const sizeCell = document.createElement("td");
      sizeCell.textContent = `${character.image_width} x ${character.image_height}`;

      const heightCell = document.createElement("td");
      const heightInput = document.createElement("input");
      heightInput.type = "number";
      heightInput.className = "character-height-input";
      heightInput.min = "0";
      heightInput.step = "any";
      heightInput.placeholder = "cm";
      heightInput.setAttribute("aria-label", `${character.name}の身長（cm）`);
      heightInput.value = character.height_cm === null ? "" : String(character.height_cm);
      heightInput.addEventListener("change", () => {
        const heightCm = heightInput.value.trim() === "" ? null : Number(heightInput.value);
        state.setCharacterHeight(character.id, heightCm);
        namespace.Calculator.recalculate(state);
        render(state, elements);
      });
      heightCell.appendChild(heightInput);

      const scaleCell = document.createElement("td");
      scaleCell.className = "character-scale";
      scaleCell.textContent = character.scale === null ? "未計算" : `x${character.scale.toFixed(3)}`;

      const actionCell = document.createElement("td");
      actionCell.className = "character-action";

      const baseButton = document.createElement("button");
      baseButton.type = "button";
      baseButton.className = "base-character-button";
      baseButton.textContent = isBaseCharacter ? "基準キャラ" : "基準に設定";
      baseButton.disabled = isBaseCharacter;
      baseButton.addEventListener("click", () => {
        state.setBaseCharacter(character.id);
        namespace.Calculator.recalculate(state);
        render(state, elements);
      });

      actionCell.appendChild(baseButton);
      row.append(nameCell, fileCell, sizeCell, heightCell, scaleCell, actionCell);
      elements.characterList.appendChild(row);
    }
  }

  function renderWarnings(state, elements) {
    elements.warnings.innerHTML = "";
    const list = document.createElement("ul");

    const characterWarnings = state.characters.flatMap((character) => character.warnings);
    const warnings = [...state.global_warnings, ...characterWarnings];

    elements.warnings.classList.toggle("is-visible", warnings.length > 0);

    if (warnings.length === 0) {
      return;
    }

    for (const warning of warnings) {
      const item = document.createElement("li");
      item.textContent = warning;
      list.appendChild(item);
    }

    elements.warnings.appendChild(list);
  }

  function renderPreview(state, elements) {
    elements.previewList.innerHTML = "";
    elements.previewList.style.setProperty("--preview-view-scale", String(state.preview_view_scale));
    elements.previewScale.value = String(state.preview_view_scale);
    elements.previewScaleValue.value = `${Math.round(state.preview_view_scale * 100)}%`;
    elements.previewScaleValue.textContent = `${Math.round(state.preview_view_scale * 100)}%`;

    if (state.characters.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "preview-empty";
      emptyMessage.textContent = "PNGを読み込み、身長と基準キャラクターを設定してください。";
      elements.previewList.appendChild(emptyMessage);
      return;
    }

    const sortedCharacters = [...state.characters].sort((a, b) => a.order - b.order);

    for (const character of sortedCharacters) {
      const item = document.createElement("article");
      item.className = "preview-character";
      item.dataset.characterId = character.id;
      item.classList.toggle("is-base-character", state.base_character_id === character.id);

      const imageWrap = document.createElement("div");
      imageWrap.className = "preview-image-wrap";
      imageWrap.style.minWidth = `${120 * state.preview_view_scale}px`;

      const hasDisplaySize =
        Number.isFinite(character.display_width) &&
        character.display_width > 0 &&
        Number.isFinite(character.display_height) &&
        character.display_height > 0;

      if (character.image?.url && hasDisplaySize) {
        const image = document.createElement("img");
        image.className = "preview-image";
        image.src = character.image.url;
        image.alt = character.name;
        image.draggable = false;
        image.style.width = `${character.display_width * state.preview_view_scale}px`;
        image.style.height = `${character.display_height * state.preview_view_scale}px`;
        imageWrap.appendChild(image);
      } else {
        const uncalculated = document.createElement("span");
        uncalculated.className = "preview-uncalculated";
        uncalculated.textContent = "未計算";
        imageWrap.appendChild(uncalculated);
      }

      const label = document.createElement("div");
      label.className = "preview-label";

      const name = document.createElement("strong");
      name.textContent = character.name;

      const height = document.createElement("span");
      height.textContent =
        character.height_cm === null ? "身長未入力" : `${character.height_cm}cm`;

      const scale = document.createElement("span");
      scale.textContent = character.scale === null ? "倍率未計算" : `x${character.scale.toFixed(2)}`;

      label.append(name, height, scale);
      item.append(imageWrap, label);
      elements.previewList.appendChild(item);
    }
  }

  function render(state, elements) {
    renderCharacterList(state, elements);
    renderWarnings(state, elements);
    renderPreview(state, elements);
  }

  namespace.Renderer = {
    render,
  };
})();
