global._ = require('lodash')
global.Debug = _.noop() || global.Debug

const debug = Debug('CORE')
const db = require('./api/db')
const queue = require('./api/queue')

class Mirkobot {
    constructor(config) {
        this.db = db
        this.queue = queue
        this.config = config
        this.modules = {}
        this.isRan = false

        this.loadModules()
    }

    bus(/*...*/) {
        if (arguments.length > 0) {
            queue.on.apply(queue, arguments)
        }
        return queue
    }

    property(/*...*/) {
        var args = _.toArray(arguments)
        if (args.length > 0) {
            return this.config.get.apply(this.config, args)
        }
        return this.config
    }

    isPrepared() {
        return !_.some(this.execute('isPrepared'), function(value) { return value === false })
    }

    isInitialized() {
        return !_.some(this.execute('isInitialized'), function(value) { return value === false })
    }

    isReady() {
        if (!this.isRan) {
            return !_.some(this.execute('isReady'), function(value) { return value === false })
        }
        return true
    }

    isLoadedModule(name) {
        return (name.toLowerCase() in this.modules)
    }

    getModule(name) {
        var module = this.getModuleDescription(name) || {}
        return module.instance !== undefined ? module.instance : module.file
    }

    getModuleDescription(name) {
        if (this.isLoadedModule(name)) {
            return this.modules[name.toLowerCase()]
        }
    }

    hasModule(name) {
        try {
            require.resolve(`./modules/${name}`)
            return true
        } catch(e) {
            debug('No found module: %s', name)
        }
        return false
    }

    initModule(module) {
        if (module instanceof Function) {
            if (module.constructor instanceof Function) {
                return new module(this)
            } else {
                return module(this)
            }
        }
        return module
    }

    loadModule(name) {
        var moduleName = name.replace(new RegExp('.js$'), '')
        if (this.hasModule(name)) {
            if (this.isLoadedModule(moduleName)) {
                return this.getModule(moduleName)
            }

            try {
                var path = `./modules/${name}`
                var file = require(path)
                var module = {
                    name: moduleName,
                    instance: this.initModule(file),
                    path: path,
                    file: file
                }

                this.modules[moduleName.toLowerCase()] = module

                queue.emit('core::modules::register', module)
                debug('Loaded module: %s', moduleName)
                return module
            } catch (e) {
                console.error(`Failed load module: ${moduleName}!`)
                if (e.message) {
                    console.error(e.message)
                }
                debug(e)
            }
        }
        return null
    }

    loadModules() {
        var that = this
        var normalizedPath = require("path").join(__dirname, "modules");
        require("fs").readdirSync(normalizedPath).forEach(function(name) {
            that.loadModule.call(that, name)
        });
    }

    execute(methodName) {
        var args = _.toArray(arguments).splice(1)
        var ret = {}
        for (var name in this.modules) {
            var info = this.getModuleDescription(name)
            var module = this.getModule(name)
            var method = (module || {})[methodName]
            var value

            if (method && method instanceof Function) {
                value = method.apply(module, args)
                debug('Executed method %s on %s', methodName, info.name)
            }

            ret[name] = value
        }
        return ret
    }

    run() {
        if (!this.isRan) {
            this.execute('prepare')
            if (!this.isPrepared()) {
                console.error('Application does not prepared!')
                return false
            }

            this.execute('init')
            if (!this.isInitialized()) {
                console.error('Application does not initialized!')
                return false
            }

            while (!this.isReady()) {
                debug('Waiting on modules readiness')
                sleep(1000)
            }

            this.execute('run')

            console.log('Application successfully started!')
            this.isRan = true
        }
        return this.isRan
    }
}

module.exports = Mirkobot

