const path = require('node:path');

module.exports = (config) => {
  config.set({
    frameworks: ['jasmine'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-coverage'),
    ],
    reporters: ['progress'],
    browsers: ['ChromeHeadless'],
    coverageReporter: {
      dir: path.join(__dirname, 'coverage', 'angular-mflix-frontend'),
      subdir: '.',
      reporters: [{ type: 'text' }, { type: 'text-summary' }],
    },
    restartOnFileChange: true,
  });
};
