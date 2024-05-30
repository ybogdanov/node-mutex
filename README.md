# Deprecation Notice

This project has been archived and will no longer receive maintenance or updates. I want to express my gratitude to the entire community for your usage and contributions.

# Mutex.lock(key, lifetime, callback) / Mutex.free(key, callback)
    
```javascript
// Initialize mutex object
var Mutex = require('mutex');
var mutex = new Mutex();

// Acquire 'foo' for 10 secods (maximum)
mutex.lock('foo', 10000, function(err, locked, ttl){
    if (locked) {
        // do something with 'foo' ...
        
        // free 'foo'
        mutex.free('foo');
    }
    else {
        // 'foo' is locked at the moment
    }
})
```

# Mutex.isolate(key, lifetime, fn, callback)

```javascript
// Acquire 'foo' for 10 secods (maximum)
mutex.isolate('foo', 10000, function isolated(callback){
    
    // do something with 'foo' ...
    
    // 'foo' will be freed atomatically
    callback(null, 'some result');
    
}, function after(err, result) {
    
    // failed to acquire 'foo'
    if (result === false) {
        
    }
    // 'foo' was acquired and processed
    else {
        console.log(result); // 'some result'
    }
    
})
```
    
# Mutex.isolateRetry(key, lifetime, fn, callback)
Same as isolate() but it will retry to lock again and again until it will be freed.

```javascript
// Acquire 'foo' for 10 secods (maximum)
mutex.isolateRetry('foo', 10000, function isolated(callback){
    
    // do something with 'foo' ...
    
    // 'foo' will be freed atomatically
    callback(null, 'some result');
    
}, function after(err, result) {
    
    console.log(result); // 'some result'
})
```    
    
# Mutex.isolateCondRetry(key, lifetime, checkFn, fn, callback)
Conditional isolation. If checkFn() returns 'mutex.continue' it will isolate, else it will not lock.

```javascript
var a = true; // or 'false'

// Acquire 'foo' for 10 secods (maximum)
mutex.isolateCondRetry('foo', 10000, function check(callback) {
    
    // If some condition
    if (a) {
        // We need to isolate
        callback(null, mutex.continue);
    }
    else {
        callback(null, 'cached')
    }
    
}, function isolated(callback){
    
    // do something with 'foo' ...
    
    // 'foo' will be freed atomatically
    callback(null, 'some result');
    
}, function after(err, result) {
    
    // if a == true --> 'some result'
    // if a == false --> 'cached'
    console.log(result); 
})
```

# Installation

```bash
$ npm install mutex
```