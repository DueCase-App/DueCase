const fs = require('node:fs');
module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_FILE;
  return {
    ...config,
    plugins: (config.plugins || []).filter((plugin) => plugin !== './plugins/withDueCaseSplashFallback'),
    android: {
      ...config.android,
      ...(googleServicesFile && fs.existsSync(googleServicesFile) ? { googleServicesFile } : {}),
    },
  };
};
