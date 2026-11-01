(function () {
  "use strict";

  const namespace = (window.CharacterSizeViewer = window.CharacterSizeViewer || {});

  class Character {
    constructor({
      id,
      name,
      height_cm = null,
      image = null,
      image_file_name,
      image_width,
      image_height,
      target_display_height = null,
      scale = 1.0,
      display_width = image_width,
      display_height = image_height,
      order,
      warnings = [],
    }) {
      this.id = id;
      this.name = name;
      this.height_cm = height_cm;
      this.image = image;
      this.image_file_name = image_file_name;
      this.image_width = image_width;
      this.image_height = image_height;
      this.target_display_height = target_display_height;
      this.scale = scale;
      this.display_width = display_width;
      this.display_height = display_height;
      this.order = order;
      this.warnings = warnings;
    }
  }

  class ViewerState {
    constructor({
      characters = [],
      base_character_id = null,
      max_preview_height = 720,
      foot_line_y = 680,
      preview_view_scale = 1,
      global_warnings = [],
    } = {}) {
      this.characters = characters;
      this.base_character_id = base_character_id;
      this.max_preview_height = max_preview_height;
      this.foot_line_y = foot_line_y;
      this.preview_view_scale = preview_view_scale;
      this.global_warnings = global_warnings;
      this.nextCharacterNumber = characters.length + 1;
    }

    addCharacter(character) {
      this.characters.push(character);
    }

    setBaseCharacter(characterId) {
      const characterExists = this.characters.some(
        (character) => character.id === characterId,
      );

      if (characterExists) {
        this.base_character_id = characterId;
      }
    }

    setCharacterHeight(characterId, heightCm) {
      const character = this.characters.find((item) => item.id === characterId);

      if (character) {
        character.height_cm = heightCm;
      }
    }

    setPreviewViewScale(scale) {
      if (Number.isFinite(scale) && scale > 0) {
        this.preview_view_scale = scale;
      }
    }

    createCharacterId() {
      const id = `char_${String(this.nextCharacterNumber).padStart(3, "0")}`;
      this.nextCharacterNumber += 1;
      return id;
    }

    clearWarnings() {
      this.global_warnings = [];
    }

    addWarning(message) {
      this.global_warnings.push(message);
    }
  }

  namespace.Character = Character;
  namespace.ViewerState = ViewerState;
})();
