const cluster = require('cluster');
if (cluster.isMaster) {
    cluster.fork();
    cluster.on('exit', function(worker, code, signal) {
        console.log(arguments);
        setTimeout(() => cluster.fork(), 1000);
    });
}
if (cluster.isWorker) {
    require('./cli')
}