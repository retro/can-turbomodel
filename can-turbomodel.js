steal(
'can/util',
'can/map',
'can/list',
'./transports/rest_transport.js',
'./transports/function_transport.js',
'./lodash.js',
'./q.js',
'can/construct/proxy',
function(can, Map, List, RestTransport, FunctionTransport){

	var getTransports = function(args, model){
		var transports = _.toArray(args);
		return _.map(transports, function(transport){
			if(_.isString(transport)){
				return new RestTransport({
					url : transport,
					model : model
				});
			} else if(_.isFunction(transport)){
				return new FunctionTransport({
					fn    : transport,
					model : model
				});
			}
			return transport;
		})
	}

	var modelNum = 0,
		ignoreHookup = /change.observe\d+/,
		getId = function( inst ) {
			if(!inst.__get) return;
			// Instead of using attr, use __get for performance.
			// Need to set reading
			can.__reading && can.__reading(inst, inst.constructor.id)
			return inst.__get(inst.constructor.id);
		};

	var ML = can.List.extend({
		setup: function(params){
			if( can.isPlainObject(params) && ! can.isArray(params) ){
				can.List.prototype.setup.apply(this);
				this.replace(this.constructor.Map.findAll(params))
			} else {
				can.List.prototype.setup.apply(this,arguments);
			}
		},
		_changes: function(ev, attr){
			can.List.prototype._changes.apply(this, arguments);
			if(/\w+\.destroyed/.test(attr)){
				var index = this.indexOf(ev.target);
				if (index != -1) {
					this.splice(index, 1);
				}
			}
		}
	})

	var Model = Map.extend({
		id : 'id',
		fullName : 'can.TurboModel',
		setup : function(base){
			var self = this;
			// create store here if someone wants to use model without inheriting from it
			this.store = {};
			can.Map.setup.apply(this, arguments);
			// Set default list as model list
			
			this.List = ML({Map: this},{});

			if(this.fullName == "can.TurboModel" || !this.fullName){
				this.fullName = "TurboModel"+(++modelNum);
			}

			can.each(['findAll', 'findOne', 'create', 'update', 'destroy'], function(fn){
				var transportFn = fn === 'findAll' ? 'many' : 'one';
				if(_.isString(self[fn]) || (_.isFunction(self[fn]) && !self[fn]._isTransport)){
					self[fn] = Model[transportFn].call(self, self[fn]);
				}
			})
		},
		model : function(data){
			return data.attr ? data : new this(data)
		},
		models : function(data){
			var self = this;
			return data.attr ? data : new this.List(_.map(data, function(item){
				return new self(item)
			}))
		}
	}, {
		setup: function(attrs){
			// try to add things as early as possible to the store (#457)
			// we add things to the store before any properties are even set
			var id = attrs && attrs[this.constructor.id];
			if( id != null ){ 
				this.constructor.store[id] = this;
			}
			can.Map.prototype.setup.apply(this, arguments)
		},
		_bindsetup: function(){
			this.constructor.store[this.__get(this.constructor.id)] = this;
			return can.Map.prototype._bindsetup.apply( this, arguments );
		},
		_bindteardown: function(){
			delete this.constructor.store[getId(this)];
			return can.Map.prototype._bindteardown.apply( this, arguments );;
		},
		// Change `id`.
		___set: function( prop, val ) {
			can.Map.prototype.___set.call(this,prop, val)
			// If we add an `id`, move it to the store.
			if(prop === this.constructor.id && this._bindings){
				this.constructor.store[getId(this)] = this;
			}
		},
		isNew: function() {
			var id = getId(this);
			return ! ( id || id === 0 ); // If `null` or `undefined`
		},
		save : function(success, error){
			var fn   = this.isNew() ? 'create' : 'update',
				def  = this.constructor[fn](this),
				self = this;

			def.then(function(){
				self.proxy(fn + 'd');
				success && success.apply(success, arguments);
			}, error);

			return def;
		},
		destroy : function(success, error){
			var def  = this.constructor.destroy(this),
				self = this;

			def.then(function(){
				self.proxy('destroyed');
				success && success.apply(success, arguments);
			}, error);

			return def;
		}
	});

	can.each([
	/**
	 * @function can.Model.prototype.created created
	 * @hide
	 * Called by save after a new instance is created.  Publishes 'created'.
	 * @param {Object} attrs
	 */
	"created",
	/**
	 * @function can.Model.prototype.updated updated
	 * @hide
	 * Called by save after an instance is updated.  Publishes 'updated'.
	 * @param {Object} attrs
	 */
	"updated",
	/**
	 * @function can.Model.prototype.destroyed destroyed
	 * @hide
	 * Called after an instance is destroyed.  
	 *   - Publishes "shortName.destroyed".
	 *   - Triggers a "destroyed" event on this model.
	 *   - Removes the model from the global list if its used.
	 * 
	 */
	"destroyed"], function( funcName ) {
		Model.prototype[funcName] = function( attrs ) {
			var stub, 
				constructor = this.constructor;

			// Update attributes if attributes have been passed
			stub = attrs && typeof attrs == 'object' && this.attr(attrs.attr ? attrs.attr() : attrs);
			
			// triggers change event that bubble's like
			// handler( 'change','1.destroyed' ). This is used
			// to remove items on destroyed from Model Lists.
			// but there should be a better way.
			can.trigger(this,"change",funcName)
			//!steal-remove-start
			steal.dev.log("Model.js - "+ constructor.shortName+" "+ funcName);
			//!steal-remove-end

			// Call event on the instance's Class
			can.trigger(constructor,funcName, this);
		};
	});

	can.each(['one', 'many'], function(type){
		Model[type] = function(){
			var transports = getTransports(arguments, this), 
				self       = this,
				store, transportFn;

			store = new Model.Store({
				type       : type,
				transports : transports,
				model      : this
			})

			transportFn = function(params, success, error){
				params = _.isFunction(params.serialize) ? params.serialize() : params;
				return store.req(params, success, error);
			}
			transportFn._isTransport = true;
			return transportFn;
		}
	});
	

	Model.Store = can.Construct({
		init : function(opts){
			this.options = opts;
		},
		req : function(params, success, error){
			var deferred          = Q.defer(),
				transportDeferred = Q.defer(),
				self              = this,
				transportIndex    = -1;


			var callTransport = function(){
				transportIndex++;

				if(self.options.transports[transportIndex]){
					self.options.transports[transportIndex].req(params, transportDeferred, function(){
						transportDeferred.notify('next');
					})
				} else {
					transportDeferred.reject('Transport not available!');
				}
			}

			transportDeferred.promise.progress(function(what){
				if(what === 'next'){
					callTransport();
				}
			});

			Q.when(transportDeferred.promise, function(data){
				var resolved;
				if(self.options.type === 'one'){
					resolved = self.getModel(data);
				} else {
					resolved = new self.options.model.List(_.map(data, function(item){
						return self.getModel(item);
					}));
				}
				deferred.resolve(resolved);
			}, deferred.reject);

			callTransport();

			deferred.promise.then(success, error);

			return deferred.promise;
		},
		getModel : function( attributes ) {
			var modelKlass = this.options.model, 
				id, model;

			if ( ! attributes ) {
				return;
			}
			if ( typeof attributes.serialize === 'function' ) {
				attributes = attributes.serialize();
			}
			
			id    = attributes[ modelKlass.id ];

			model = (id || id === 0) && modelKlass.store[id] ?
					modelKlass.store[id].attr(attributes, modelKlass.removeAttr || false) : 
					new modelKlass( attributes );
			
			return model;
		}
	})
	
	can.TurboModel = Model;

	return Model;
})