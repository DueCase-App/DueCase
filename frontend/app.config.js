const fs = require('fs');
const path = require('path');

const splashBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAEyUlEQVR42u3d3VEbMRQFYEtDFdRAQzThAiggBdAEDVFD2hAvDOMJMWP8t9I93/ccJl7tPWelneDsdgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOzGGMMq5OqWQPiVgAIg/MmvBDI1S2DL/20oWjMXdgCknvftBhQAoeFXAo4AhId/pePAeHk8em3tz992659XAJQM/uxF8FNwTwnypT/vCEBM+Gc7EvwmvP/785f+vB0AUeGfZScwQxCr7QbsAIR/2Z0ACoANwrlFCcyyDa92HHAEEPzpjwQzhq7KUcAOQPgdCRwBEP45P8esW+4qRwEFIPx2AnYACL8SSPRgCQT/Fp/RbxTaARD8dLUbUACEh0kJKADCQ6QE5uacJjj3G7Yz3wv4h0B2AMLvulAAwp94fbM9bSv9RqACEH4lEBp+BSD8rjecl4CCsP0Q/vLl4BYvBat+LZgdgPAvtw73DqPvBET4Q0ug+jcDKwDhty7BFIAhX3Z9bv109v8CIPhbDueJLwdv8VIwIfx2AMJfYt2uHdaU8CsA4bd+3gFgeNdfx2s9tZOe/t4BCH659wKXvA9IC78dgPBbX0cADGeddT73KZ749FcAwq8EgsOvAIR/6W/vVbpXuP+WIHcAD8Nf6Vq+rumEF4LJT38F4Klf/rp+KoH08DsCCL8jgQJA+OuWwLGnvKe/I0DseT/xmg+PAsJvByD8xXcCjgR2ALb8VwxwhXUYL4/D018BCL/1wBHAsCeFyHHADsB53xrZDdgBGOz0ANkN2AHY8ls3OwE7AEPsvYACEH7hVwKOAIIv/NZUAQi/IbW+jgDCbzgdCRSA8AuVEnAEEHxhsvZ2AAbQAIZ9/uq7gSb8guN+5O4EuvAbNteVuxPowi8kri+3BJrgC4d7lXuvuoEyUK43dzfQhF8Q3L/c+9cNj+GxDrk7gS78ht56BM+hBTfs7m3uve0GxIBYn9z5bBbXYLvfufe7GwbDYN1y59WXS0BwkXXhh9w57hYNcud52gJwbsYxIPwIoAQQ/uACUAIIf3gBKAGEP7wAlADCH14AQHgB2AVgTsN3AEoA8xl+BFACmMvwdwBKAPMYXABKAHMYXgBKAPMXXgBKAHMXXgBKAPMWXgBKAHMWXgBKAPMVXgBAeAHYBWCuwncASgDzFH4EOHbTlAPmJeQdwL83T/gxL0EFcHgThR/zElgAwo95CS8AQAEACgBQAKAAAAUAKABAAQAKAFAAgAIAFACgAAAFACzrwRLU8fT8ete/7/1tb9HtAEgM/1Z/JwqAiYKoBBQAoeFXAgoAUACAAgAUAKAAAAUAKABAAQAKAFAAgAIAFACgAAAFACgAQAEACgBQAIACABQAoAAABQAoAEABAAoAUACAAgAUACgAQAEACgBQAIACABQAoAAABQAoAEABAAoAUACAAgAUAKAAAAUAKABAAQAKAFAAgAIAFACgAAAFACgAQAEACgBQAIACOENrrbn9pM+DHQDYAWh9zIECABSA9sf9VwCGAPddARiGmb2/7X0G4T9/HSzBd2OMsdpnfnp+FX7BVwDJRXDvElgp/IIPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8+gCMorHgLYLW+gAAAABJRU5ErkJggg==';

module.exports = ({ config }) => {
  const splashPath = path.join(__dirname, 'assets', 'splash-generated.png');
  fs.mkdirSync(path.dirname(splashPath), { recursive: true });
  fs.writeFileSync(splashPath, Buffer.from(splashBase64, 'base64'));

  const plugins = (config.plugins || [])
    .filter((plugin) => plugin !== './plugins/withDueCaseSplashFallback')
    .map((plugin) => {
      if (!Array.isArray(plugin) || plugin[0] !== 'expo-splash-screen') return plugin;
      const options = plugin[1] || {};
      return [
        'expo-splash-screen',
        {
          ...options,
          image: './assets/splash-generated.png',
          imageWidth: 128,
          dark: {
            ...(options.dark || {}),
            image: './assets/splash-generated.png',
          },
        },
      ];
    });

  return {
    ...config,
    plugins,
  };
};
