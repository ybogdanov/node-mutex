
var Redis = require('redis');

/**
 * Extend _obj_ with _props_, where all _props_
 *
 * @param  {mixed} obj
 * @param  {hash} props
 * @api public
 */
exports.extend = function(obj, props) {
    for (var i = 1; i < arguments.length; i++) {
        (function(props) {
            Object.getOwnPropertyNames(props).forEach(function(prop) {
                if (!obj.hasOwnProperty(prop)) {
                    Object.defineProperty(obj, prop, Object.getOwnPropertyDescriptor(props, prop))
                }
            })
        })(arguments[i])
    }
    return obj;
}

exports.cloneRedisClient = function(redis) {
    if (!(redis instanceof Redis.RedisClient)) {
        throw new Error('redisSub object should be instance of RedisClient (node_redis module)');
    }
    
    // TODO: clone other settins also
    return Redis.createClient(redis.port, redis.host);
}

