global._ = require('lodash');
global.utils = require('./lib/utils');
global.CronJob = require('cron').CronJob;
global.Debug = require('debug');

const Config = require('./cli/config');
const Mirkobot = require('./main');

// Prepare configuration module
let config = new Config({
    server: "ws://mirkoczat.pl/socket/websocket"
});

// Initialize application
let bot = new Mirkobot(config)
if (!bot.run()) {
    process.exit(1)
}

// User Input loop
;(function wait() {
   setTimeout(wait, 1000);
})();