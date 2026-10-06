module.exports = ({ config }) => ({
  ...config,
  plugins: (config.plugins || []).filter((plugin) => plugin !== './plugins/withDueCaseSplashFallback'),
});
