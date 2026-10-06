const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * Expo's Android splash theme always references @drawable/splashscreen_logo.
 * When the splash plugin is configured with a background colour only, that
 * drawable is not generated. Create a small native vector mark so release
 * builds always have a valid resource without depending on a raster asset.
 */
module.exports = function withDueCaseSplashFallback(config) {
  return withDangerousMod(config, [
    'android',
    async (androidConfig) => {
      const drawableDir = path.join(
        androidConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable',
      );

      await fs.promises.mkdir(drawableDir, { recursive: true });

      const vector = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="96dp"
    android:height="96dp"
    android:viewportWidth="100"
    android:viewportHeight="100">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M16,44 L50,16 L84,44 L78,51 L74,48 L74,82 L58,82 L58,60 L42,60 L42,82 L26,82 L26,48 L22,51 Z" />
    <path
        android:fillColor="#FF7A1A"
        android:pathData="M68,27 C68,20 73,16 79,16 C83,16 87,18 89,22 C91,18 95,16 99,16 C105,16 110,20 110,27 C110,37 89,49 89,49 C89,49 68,37 68,27 Z" />
</vector>
`;

      await fs.promises.writeFile(
        path.join(drawableDir, 'splashscreen_logo.xml'),
        vector,
        'utf8',
      );

      return androidConfig;
    },
  ]);
};
