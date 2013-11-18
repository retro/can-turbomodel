steal('can/construct', function(Construct){
	return Construct.extend({
		init : function(opts){
			var url = opts.url,
				parts = url.split(/\s+/);

			this.url  = parts.pop();
			this.type = parts.length ? parts.pop().toUpperCase() : 'GET';
		},
		req : function(data, deferred, next){
			Q($.ajax(this.params(data))).then(deferred.resolve, deferred.reject);
		},
		params : function(data){
			var url = can.sub(this.url, data, true);
			return {
				url : url,
				data : data,
				type : this.type,
				dataType : 'JSON'
			}
		}
	})
})