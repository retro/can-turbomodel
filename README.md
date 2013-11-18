Can.Turbomodel
==============

THIS LIBRARY DOESN'T WORK YET!

Can.TurboModel is an alternative model layer for CanJS. It separates REST interface from the model, and implements `transports` which are used for the data transport. Default transport is the "REST transport" which should be compatible with the default can.Model implementation.

## Can.TurboModel vs Can.Model

By separating API access from the model Can.TurboModel allows more flexibility while keeping a simple API. Can.TurboModel will provide following. Defining a model with Can.TurboModel looks like this:

    steal('can/turbomodel', function(Model){
      return Model.extend({
        findOne : Model.one('GET /users/{id}'),
        findAll : Model.many('GET /users/{id}'),
        create  : Model.one('POST /users'),
        update  : Model.one('PUT /users/{id}'),
        destroy : Model.one('DELETE /users/{id}')
      })
    })

To keep compatibility with the `can.Model` you can write it like this:


    steal('can/turbomodel', function(Model){
      return Model.extend({
        findOne : 'GET /users/{id}',
        findAll : 'GET /users/{id}',
        create  : 'POST /users',
        update  : 'PUT /users/{id}',
        destroy : 'DELETE /users/{id}'
      })
    })

Can.TurboModel allows an easy way to define custom finder or persistence functions. For instance you could add a `search` function like this:
    
    steal('can/turbomodel', function(Model){
      return Model.extend({
        findOne : Model.one('GET /users/{id}'),
        findAll : Model.many('GET /users/{id}'),
        create  : Model.one('POST /users'),
        update  : Model.one('PUT /users/{id}'),
        destroy : Model.one('DELETE /users/{id}'),
        search  : Model.many('GET /search/endpoint')
      })
    })

## Transports

Real power of `can.TurboModel` comes from the transports. Previous example is equivalent to following:

    steal('can/turbomodel', 'can/turbomodel/transports/rest_transport.js', function(Model, RestTransport){
      return Model.extend({
        findOne : Model.one(new RestTransport({url : 'GET /users/{id}'}),
        findAll : Model.many(new RestTransport({url : 'GET /users/{id}'}),
        create  : Model.one(new RestTransport({url : 'POST /users'}),
        update  : Model.one(new RestTransport({url : 'PUT /users/{id}'}),
        destroy : Model.one(new RestTransport({url : 'DELETE /users/{id}'}),
        search  : Model.many(new RestTransport({url : 'GET /search/endpoint'})
      })
    })

Transport is an object that has defined `req` function. This function will get three arguments:

1. params
2. deferred object
2. next callback

Transport can either resolve / reject the deferred object or call `next()` which will call next transport. For instance, if we wanted to implement a pass-through local cache for the `findAll` function, we could do it like this:


    var LocalTransport = can.Construct.extend({
      init : function(opts){
        this.prefix = opts.prefix
      },
      req : function(params, deferred, next){
        var key = this.prefix + makeKeyFromParams(params); // create some kind of key
        if(localStorage.getItem(key)){
          deferred.resolve(JSON.parse(localStorage.getItem(key)))
        } else {
          deferred.then(function(data){
            localStorage.setItem(key, JSON.stringify(data))
            next();
          })
        }
      }
    })


After we create the transport, we just need to list it in the findAll function:

    steal('can/turbomodel', 'can/turbomodel/transports/rest_transport.js', function(Model, RestTransport){
      var User =  Model.extend({
        findAll : Model.many(new LocalTransport({prefix : 'users-'}), new RestTransport({url : 'GET /users/{id}'}),
      })

      return User;
    })

Now every time you call `User.findAll()` it will first try to load it from the localStorage, and if data doesn't exist it will let `RestTransport` to handle the query, and cache results of the query to the localStorage

