const fs = require('node:fs');

module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_FILE || './google-services.json';
  const androidPushConfigured = fs.existsSync(googleServicesFile);

  return {
    ...config,
    extra: {
      ...config.extra,
      androidPushConfigured,
    },
    plugins: (config.plugins || []).filter(
      (plugin) => plugin !== './plugins/withDueCaseSplashFallback'
    ),
    android: {
      ...config.android,
      ...(androidPushConfigured ? { googleServicesFile } : {}),
    },
  };
};
