steal('can/construct', function(Construct){
	return Construct.extend({
		init : function(opts){
			this.fn    = opts.fn;
			this.model = opts.model;
		},
		req : function(params, deferred, next){
			Q(this.fn.call(this.model, params)).then(deferred.resolve, deferred.reject);
		}
	})
})