/*
  Copyright 2011 Yuriy Bogdanov <chinsay@gmail.com>

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to
  deal in the Software without restriction, including without limitation the
  rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
  sell copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
  IN THE SOFTWARE.
*/

var utils = require('./utils'),
    Redis = require('redis');

function Mutex(config) {
    
    if (typeof config === 'undefined') config = {};
    
    if (typeof config.redis !== 'undefined') {
        utils.extend(config.redis, Mutex.defaults.redis);
    }
    utils.extend(config, Mutex.defaults);
    
    this.config = utils.extend({}, config);
    this.redis = null;
    
    if (this.config.redis instanceof Redis.RedisClient) {
        this.setRedisClient(this.config.redis);
    }
    
    this.events = new process.EventEmitter;
    this.continue = {};
}

Mutex.defaults = {
    prefix : 'lock',
    ns : 'default',
    redis : {
        host : '127.0.0.1',
        port : 6379
    },
    gcLimit : 100
}

Mutex.prototype.lock = function(key, lifetime, callback) {

    var fullKey = this.getKey(key),
        time = +new Date,
        lockExpire = time + lifetime,
        redis = this.getRedisClient();

    redis.setnx(fullKey, lockExpire, function(err, locked){
        if (err) return callback(err);
        if (locked) return callback(null, true);
        redis.get(fullKey, function(err, expireAt){
            if (err) return callback(err);
            var intExpireAt = Number(expireAt);
            if (intExpireAt < time) {
                return redis.getset(fullKey, lockExpire, function(err, value){
                    if (err) return callback(err);
                    callback(null, Number(value) == intExpireAt);
                });
            }
            callback(null, false, intExpireAt - time);
        });
    });
}

Mutex.prototype.free = function(key, callback) {
    
    var fullKey = this.getKey(key),
        freeKey = fullKey + '/free';
    
    this.getRedisClient().multi()
        .del(fullKey)
        .publish(freeKey, '1')
        .exec(callback);
}

Mutex.prototype.isolate = function(key, lifetime, fn, callback) {
    
    var self = this, callback = callback || function(){};
    
    this.lock(key, lifetime, function(err, locked, ttl){
        if (err) return callback(err);
        if (locked) {
            fn(function(){
                var a = arguments;
                self.free(key, function(err){
                    if (err) console.error(err);
                    callback.apply(null, a);
                });
            })
        }
        else {
            callback(null, false);
        }
    })
}

Mutex.prototype.isolateRetry = function(key, lifetime, fn, callback) {
    
    var self = this, callback = callback || function(){};
    
    this.lock(key, lifetime, function(err, locked, ttl){
        if (err) return callback(err);
        if (locked) {
            fn(function(){
                var a = arguments;
                self.free(key, function(err){
                    if (err) console.error(err);
                    callback.apply(null, a);
                });
            })
        }
        else {
            self.waitForKey(key, ttl, function(){
                self.isolateRetry(key, lifetime, fn, callback);
            })
        }
    })
}

// Conditional isolation
Mutex.prototype.isolateCond = function(key, lifetime, checkFn, fn, callback) {
    
    var self = this, callback = callback || function(){};
    
    checkFn(function(err, result){
        if (err) return callback(err);
        if (result === self.continue) return self.isolate(key, lifetime, fn, callback);
        callback(null, result);
    })
}

// Conditional isolation
Mutex.prototype.isolateCondRetry = function(key, lifetime, checkFn, fn, callback) {
    
    var self = this, callback = callback || function(){};
    
    checkFn(function(err, result){
        if (err) return callback(err);
        if (result !== self.continue) return callback(null, result);
        
        self.lock(key, lifetime, function(err, locked, ttl){
            if (err) return callback(err);
            if (locked) {
                fn(function(){
                    var a = arguments;
                    self.free(key, function(err){
                        if (err) console.error(err);
                        callback.apply(null, a);
                    });
                })
            }
            else {
                self.waitForKey(key, ttl, function(){
                    self.isolateCondRetry(key, lifetime, checkFn, fn, callback);
                })
            }
        })
    })
}

Mutex.prototype.cleanDeadlocks = function(callback) {

    var self = this,
        pattern = this.getPrefix() + '/*',
        redis = this.getRedisClient(),
        time = +new Date;
    
    redis.keys(pattern, function(err, keys){
        if (err) return callback(err);
        
        if (!keys.length) return callback();
        redis.mget(keys, function(err, values){
            if (err) return callback(err);
            
            var expired = [];
            values.slice(0, self.config.gcLimit).forEach(function(expireAt, i){
                if (Number(expireAt) <= time) expired.push(keys[i]);
            })
            if (!expired.length) return callback();
            
            redis.del(expired, function(err){
                if (err) return callback(err);
                callback();
            })
        })
        
    })
}

Mutex.prototype.waitForKey = function(key, ttl, callback) {
    
    var keyFree = this.getKey(key) + '/free',
        subscribed = true;
    
    var timeoutId = setTimeout(callback, ttl)
    
    this.getRedisSubClient().subscribe(keyFree);
    
    this.events.once(keyFree, function(value){
        if (timeoutId) clearTimeout(timeoutId);
        callback();
    })
}

Mutex.prototype.getRedisClient = function() {
    if (!this.redis) {
        this.redis = Redis.createClient(this.config.redis.port, this.config.redis.host);
        if (this.config.redis.auth){
            this.redis.auth(this.config.redis.auth, new Function);
        }
    }
    return this.redis;
}

Mutex.prototype.setRedisClient = function(redis) {
    if (!(redis instanceof Redis.RedisClient)) {
        throw new Error('redis object should be instance of RedisClient (node_redis module)');
    }
    this.redis = redis;
}

Mutex.prototype.getRedisSubClient = function() {
    if (!this.redisSub) {
        this.setRedisSubClient(utils.cloneRedisClient(this.getRedisClient()));
    }
    return this.redisSub;
}

Mutex.prototype.setRedisSubClient = function(redis) {
    if (!(redis instanceof Redis.RedisClient)) {
        throw new Error('redisSub object should be instance of RedisClient (node_redis module)');
    }
    
    this.redisSub = redis;
    
    var self = this;
    
    function onConnect() {
        self.redisSub.on('message', function(channel, value) {
            self.events.emit(channel, value);
            self.redisSub.unsubscribe(channel);
        })
    }
    
    this.redisSub.on('connect', onConnect);
    if (this.redisSub.connected) onConnect();
}

Mutex.prototype.getKey = function(key) {
    return this.getPrefix() + '/' + key;
}

Mutex.prototype.getPrefix = function() {
    return this.config.prefix + '/' + this.config.ns;
}

module.exports = Mutex;
