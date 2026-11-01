(function () {
  "use strict";

  const namespace = (window.CharacterSizeViewer = window.CharacterSizeViewer || {});

  const WARNING_PREFIX = "[身長比計算]";

  function isPositiveFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }

  function clearCalculationWarnings(state) {
    state.global_warnings = state.global_warnings.filter(
      (warning) => !warning.startsWith(WARNING_PREFIX),
    );

    for (const character of state.characters) {
      character.warnings = character.warnings.filter(
        (warning) => !warning.startsWith(WARNING_PREFIX),
      );
    }
  }

  function resetCalculation(character) {
    character.target_display_height = null;
    character.scale = null;
    character.display_width = null;
    character.display_height = null;
  }

  function addCharacterWarning(character, message) {
    character.warnings.push(`${WARNING_PREFIX} ${message}`);
  }

  function recalculate(state) {
    clearCalculationWarnings(state);

    for (const character of state.characters) {
      resetCalculation(character);
    }

    if (state.base_character_id === null) {
      return false;
    }

    const baseCharacter = state.characters.find(
      (character) => character.id === state.base_character_id,
    );

    if (!baseCharacter) {
      state.global_warnings.push(
        `${WARNING_PREFIX} 基準キャラクターが見つからないため計算できません。`,
      );
      return false;
    }

    if (!isPositiveFiniteNumber(baseCharacter.height_cm)) {
      state.global_warnings.push(
        `${WARNING_PREFIX} 基準キャラクターの身長は0より大きい数値で入力してください。`,
      );
      return false;
    }

    if (!isPositiveFiniteNumber(baseCharacter.image_height)) {
      state.global_warnings.push(
        `${WARNING_PREFIX} 基準キャラクターの画像高さが不正なため計算できません。`,
      );
      return false;
    }

    for (const character of state.characters) {
      if (character.id === baseCharacter.id) {
        character.target_display_height = baseCharacter.image_height;
        character.scale = 1.0;
        character.display_width = baseCharacter.image_width;
        character.display_height = baseCharacter.image_height;
        continue;
      }

      if (!isPositiveFiniteNumber(character.height_cm)) {
        addCharacterWarning(
          character,
          `${character.name}の身長は0より大きい数値で入力してください。`,
        );
        continue;
      }

      if (
        !isPositiveFiniteNumber(character.image_width) ||
        !isPositiveFiniteNumber(character.image_height)
      ) {
        addCharacterWarning(character, `${character.name}の画像サイズが不正です。`);
        continue;
      }

      const heightRatio = character.height_cm / baseCharacter.height_cm;
      const targetDisplayHeight = baseCharacter.image_height * heightRatio;
      const scale = targetDisplayHeight / character.image_height;

      if (!isPositiveFiniteNumber(scale)) {
        addCharacterWarning(character, `${character.name}の倍率を計算できません。`);
        continue;
      }

      character.target_display_height = targetDisplayHeight;
      character.scale = scale;
      character.display_width = character.image_width * scale;
      character.display_height = character.image_height * scale;
    }

    return true;
  }

  namespace.Calculator = {
    isPositiveFiniteNumber,
    recalculate,
  };
})();
