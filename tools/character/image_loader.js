(function () {
  "use strict";

  const namespace = (window.CharacterSizeViewer = window.CharacterSizeViewer || {});

  function isPngFile(file) {
    return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  }

  function nameFromFile(fileName) {
    return fileName.replace(/\.png$/i, "");
  }

  function loadPngFile(file, state, order) {
    return new Promise((resolve, reject) => {
      if (!isPngFile(file)) {
        reject(new Error(`${file.name} はPNGではないためスキップしました。`));
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        const character = new namespace.Character({
          id: state.createCharacterId(),
          name: nameFromFile(file.name),
          image: {
            element: image,
            url: objectUrl,
          },
          image_file_name: file.name,
          image_width: image.naturalWidth,
          image_height: image.naturalHeight,
          scale: 1.0,
          display_width: image.naturalWidth,
          display_height: image.naturalHeight,
          order,
          warnings: [],
        });

        resolve(character);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`${file.name} の画像読み込みに失敗しました。`));
      };

      image.src = objectUrl;
    });
  }

  async function loadPngFiles(fileList, state) {
    const files = Array.from(fileList);
    const characters = [];
    const warnings = [];

    for (const file of files) {
      try {
        const character = await loadPngFile(file, state, state.characters.length + characters.length);
        characters.push(character);
      } catch (error) {
        warnings.push(error.message);
      }
    }

    return { characters, warnings };
  }

  namespace.ImageLoader = {
    loadPngFiles,
  };
})();
