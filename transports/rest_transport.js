steal('can/construct', function(Construct){
	return Construct.extend({
		init : function(opts){
			var url = opts.url,
				parts = url.split(/\s+/);

			this.model = opts.model;

			this.url   = parts.pop();
			this.type  = parts.length ? parts.pop().toUpperCase() : 'GET';
		},
		req : function(data, deferred, next){
			Q($.ajax(this.params(data))).then(deferred.resolve, deferred.reject);
		},
		params : function(data){
			var url = can.sub(this.getUrl(), data, true);
			return {
				url : url,
				data : data,
				type : this.type,
				dataType : 'JSON'
			}
		},
		getUrl : function(){
			if(this.model.id !== 'id'){
				return this.url.replace(/\{\s*id\s*\}/g, '{' + this.model.id + '}');
			}
			return this.url;
		}
	})
})