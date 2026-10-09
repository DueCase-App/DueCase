const fs = require('node:fs');
const path = require('node:path');

const notificationIconBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABmklEQVR4nO3aUZKCMBBF0cfsf8/M11RZDkoInbzucM8CsMMliqgEAAAAAAAAAAAAAAAAAAH2fd/dMxxxzPUz+wX/FpktgmuuqQHeF5clgnOuaQE+LcodwT3XlABni3FFyDDXNvLgPQvYtm3oTFKuuYbtgN6rZ/RVl22uIQHuDjtqsRnnCg8QNWT0YrPOFRrgKSct8nhhAZ70thF53JAAT/vgjDz+7QCz7uGvvk7Wud7durd1fYH6dk+ecaZvuneA8xGC+/FB5GtfruZ+dvPq9arLOteZSzsg0yKl/I+2WzSXyrbIClp2QtMOyHzyZzy869Vy3k4DVDj5lSOUfQs6OunZZpTOL46Sd0EZvwccadmZ3Vs3y0Iz7oRht6EZOX9QP3L186h8ACnP94Gem4ElAkj+k99rmQBVEcCMAGYEMCOAGQHMCGBGADMCmBHArFyAzD++9CgXQForQskA0joRygZYRekAK+yC0gGk/xGqRSkfQKrx95RPlggg1Tz50kIBqiKAGQHMCGBGADMCAAAAAAAAAAAAAAAAYIBf0j8vpxvwOGcAAAAASUVORK5CYII=';

module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_FILE || './google-services.json';
  const androidPushConfigured = fs.existsSync(googleServicesFile);

  const generatedNotificationIcon = path.join(
    __dirname,
    'assets',
    'notification-icon.generated.png'
  );
  fs.writeFileSync(
    generatedNotificationIcon,
    Buffer.from(notificationIconBase64, 'base64')
  );

  const plugins = (config.plugins || [])
    .filter((plugin) => plugin !== './plugins/withDueCaseSplashFallback')
    .map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === 'expo-notifications') {
        return [
          'expo-notifications',
          {
            ...(plugin[1] || {}),
            icon: './assets/notification-icon.generated.png',
          },
        ];
      }
      return plugin;
    });

  return {
    ...config,
    extra: {
      ...config.extra,
      androidPushConfigured,
    },
    plugins,
    android: {
      ...config.android,
      ...(androidPushConfigured ? { googleServicesFile } : {}),
    },
  };
};
