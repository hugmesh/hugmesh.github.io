// Karma configuration for the documentation site.
//
// ChromeHeadlessCI adds --no-sandbox because CI runners (and the container this
// repo is developed in) have no user namespaces for Chrome's sandbox to use.
module.exports = function (config) {
  config.set({
    basePath: '',
    // '@angular/build:karma', not the webpack builder: the deprecated one loads
    // zone-testing in an order jasmine 7 rejects ("Cannot assign to read only
    // property 'describe'"), because jasmine now freezes its global interface.
    frameworks: ['jasmine'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
    ],
    client: {
      jasmine: {
        // Randomised order is the default and is what catches specs that leak
        // state into each other; keep it.
        random: true,
      },
      clearContext: false,
    },
    jasmineHtmlReporter: { suppressAll: true },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }, { type: 'lcovonly' }],
    },
    reporters: ['progress', 'kjhtml'],
    browsers: ['ChromeHeadlessCI'],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
    restartOnFileChange: true,
  });
};
