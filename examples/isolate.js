
var Mutex = require('../');
var mutex = new Mutex();

//require('redis').debug_mode = true;

test();

function test() {
    
    doSomethingWithFoo('xxx', function(err, result) {
        if (err) return console.error(err.stack || err);
        console.log('result 1', result); // xxx
    })
    
    doSomethingWithFoo('yyy', function(err, result) {
        if (err) return console.error(err.stack || err);
        console.log('result 2', result); // yyy
    })
}

function doSomethingWithFoo(arg, callback) {
    
    mutex.isolateCondRetry('foo', 10000, function check(callback){
        
        console.log('check', arg);
        
        callback(null, mutex.continue);
        
    }, function isolated(callback) {
        
        console.log('isolated', arg);
        
        setTimeout(function(){
            callback(null, arg);
        }, 1000)
        
    }, callback)
}

