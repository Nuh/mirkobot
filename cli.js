global._ = require('lodash');
global.Debug = require('debug');

const Config = require('./cli/config');
const Mirkobot = require('./main.js');

var config = new Config({
    server: "ws://mirkoczat.pl/socket/websocket"
});

var bot = new Mirkobot(config)
if (!bot.run()) {
    process.exit()
}

;(function wait() {
   setTimeout(wait, 1000);
})();