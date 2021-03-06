(function(undefined) {
  // The Opal object that is exposed globally
  var Opal = this.Opal = {};

  // Very root class
  function BasicObject(){}

  // Core Object class
  function Object(){}

  // Class' class
  function Class(){}

  // the class of nil
  function NilClass(){}

  // TopScope is used for inheriting constants from the top scope
  var TopScope = function(){};

  // Opal just acts as the top scope
  TopScope.prototype = Opal;

  // To inherit scopes
  Opal.constructor  = TopScope;

  // This is a useful reference to global object inside ruby files
  Opal.global = this;

  // Minify common function calls
  var __hasOwn = Opal.hasOwnProperty;
  var __slice  = Opal.slice = Array.prototype.slice;

  // Generates unique id for every ruby object
  var unique_id = 0;

  // Return next unique id
  Opal.uid = function() {
    return unique_id++;
  };

  // Table holds all class variables
  Opal.cvars = {};

  // Globals table
  Opal.gvars = {};

  /*
   * Create a new constants scope for the given class with the given
   * base. Constants are looked up through their parents, so the base
   * scope will be the outer scope of the new klass.
   */
  function create_scope(base, klass, id) {
    var const_alloc   = function() {};
    var const_scope   = const_alloc.prototype = new base.constructor();
    klass._scope      = const_scope;
    const_scope.base  = klass;
    const_scope.constructor = const_alloc;

    if (id) {
      base[id] = base.constructor[id] = klass;
    }
  }

  /*
    Define a bridged class. Bridged classes will always be in the top level
    scope, and will always be a subclass of Object.
  */
  Opal.bridge = function(name, constructor) {
    var klass = bridge_class(constructor);

    klass._name = name;

    create_scope(Opal, klass, name);

    return klass;
  };

  Opal.klass = function(base, superklass, id, constructor) {
    var klass;
    if (typeof(base) !== 'function') {
      base = base._klass;
    }

    if (superklass === null) {
      superklass = Object;
    }

    if (__hasOwn.call(base._scope, id)) {
      klass = base._scope[id];
    }
    else {
      if (!superklass._methods) {
        var bridged = superklass;
        superklass  = Object;
        klass       = bridge_class(bridged);
      }
      else {
        klass = boot_class(superklass, constructor);
      }

      klass._name = (base === Object ? id : base._name + '::' + id);

      create_scope(base._scope, klass);

      base[id] = base._scope[id] = klass;

      if (superklass.$inherited) {
        superklass.$inherited(klass);
      }
    }

    return klass;
  };

  // Define new module (or return existing module)
  Opal.module = function(base, id, constructor) {
    var klass;
    if (typeof(base) !== 'function') {
      base = base._klass;
    }

    if (__hasOwn.call(base._scope, id)) {
      klass = base._scope[id];
    }
    else {
      klass = boot_class(Class, constructor);
      klass._name = (base === Object ? id : base._name + '::' + id);

      klass.$included_in = [];

      create_scope(base._scope, klass, id);
    }

    return klass;
  }

  // Utility function to raise a "no block given" error
  var no_block_given = function() {
    throw new Error('no block given');
  };

  // Boot a base class (makes instances).
  var boot_defclass = function(id, constructor, superklass) {
    if (superklass) {
      var ctor           = function() {};
          ctor.prototype = superklass.prototype;

      constructor.prototype = new ctor();
    }

    var prototype = constructor.prototype;

    prototype.constructor = constructor;
    prototype._klass      = constructor;

    constructor._inherited    = [];
    constructor._included_in  = [];
    constructor._name         = id;
    constructor._super        = superklass;
    constructor._methods      = [];
    constructor._smethods     = [];

    constructor['$==='] = module_eqq;
    constructor.$to_s = module_to_s;
    constructor.toString = module_to_s;

    Opal[id] = constructor;

    return constructor;
  };

  // Create generic class with given superclass.
  var boot_class = Opal.boot = function(superklass, constructor) {
    var ctor = function() {};
        ctor.prototype = superklass.prototype;

    constructor.prototype = new ctor();
    var prototype = constructor.prototype;

    prototype._klass      = constructor;
    prototype.constructor = constructor;

    constructor._inherited    = [];
    constructor._included_in  = [];
    constructor._super        = superklass;
    constructor._methods      = [];
    constructor._klass        = Class;

    constructor['$==='] = module_eqq;
    constructor.$to_s = module_to_s;
    constructor.toString = module_to_s;

    constructor['$[]'] = undefined;
    constructor['$call'] = undefined;

    var smethods;

    smethods = superklass._smethods.slice();

    constructor._smethods = smethods;
    for (var i = 0, length = smethods.length; i < length; i++) {
      var m = smethods[i];
      constructor[m] = superklass[m];
    }

    superklass._inherited.push(constructor);

    return constructor;
  };

  var bridge_class = function(constructor) {
    constructor.prototype._klass = constructor;

    constructor._inherited    = [];
    constructor._included_in  = [];
    constructor._super        = Object;
    constructor._klass        = Class;
    constructor._methods      = [];
    constructor._smethods     = [];

    constructor['$==='] = module_eqq;
    constructor.$to_s = module_to_s;
    constructor.toString = module_to_s;

    var smethods = constructor._smethods = Class._methods.slice();
    for (var i = 0, length = smethods.length; i < length; i++) {
      var m = smethods[i];
      constructor[m] = Object[m];
    }

    bridged_classes.push(constructor);

    var table = Object.prototype, methods = Object._methods;

    for (var i = 0, length = methods.length; i < length; i++) {
      var m = methods[i];
      constructor.prototype[m] = table[m];
    }

    constructor._smethods.push('$allocate');

    return constructor;
  };

  Opal.puts = function(a) { console.log(a); };

  // Method missing dispatcher
  Opal.mm = function(mid) {
    var dispatcher = function() {
      var args = __slice.call(arguments);

      if (this.$method_missing) {
        this.$method_missing._p = dispatcher._p;
        return this.$method_missing.apply(this, [mid].concat(args));
      }
      else {
        return native_send(this, mid, args);
      }
    };

    return dispatcher;
  };

  // send a method to a native object
  var native_send = function(obj, mid, args) {
    var prop, block = native_send._p;
    native_send._p = null;

    if (prop = native_methods[mid]) {
      return prop(obj, args, block);
    }

    prop = obj[mid];

    if (typeof(prop) === "function") {
      prop = prop.apply(obj, args.$to_native());
    }
    else if (mid.charAt(mid.length - 1) === "=") {
      prop = mid.slice(0, mid.length - 1);
      return obj[prop] = args[0];
    }

    if (prop != null) {
      return prop;
    }

    return nil;
  };

  var native_methods = {
    "==": function(obj, args) {
      return obj === args[0];
    },

    "[]": function(obj, args) {
      var prop = obj[args[0]];

      if (prop != null) {
        return prop;
      }

      return nil;
    },

    "respond_to?": function(obj, args) {
      return obj[args[0]] != null;
    },

    "each": function(obj, args, block) {
      var prop;

      if (obj.length === +obj.length) {
        for (var i = 0, len = obj.length; i < len; i++) {
          prop = obj[i];

          if (prop == null) {
            prop = nil;
          }

          block(prop);
        }
      }
      else {
        for (var key in obj) {
          prop = obj[key];

          if (prop == null) {
            prop = nil;
          }

          block(key, prop);
        }
      }

      return obj;
    },

    "to_a": function(obj, args) {
      var result = [];

      for (var i = 0, length = obj.length; i < length; i++) {
        result.push(obj[i]);
      }

      return result;
    }
  };

  // Const missing dispatcher
  Opal.cm = function(name) {
    return this.base.$const_missing(name);
  };

  // Arity count error dispatcher
  Opal.ac = function(actual, expected, object, meth) {
    var inspect = ((typeof(object) !== 'function') ? object._klass._name + '#' : object._name + '.') + meth;
    var msg = '[' + inspect + '] wrong number of arguments(' + actual + ' for ' + expected + ')'
    throw Opal.ArgumentError.$new(msg);
  };

  /*
    Call a ruby method on a ruby object with some arguments:

      var my_array = [1, 2, 3, 4]
      Opal.send(my_array, 'length')     # => 4
      Opal.send(my_array, 'reverse!')   # => [4, 3, 2, 1]

    A missing method will be forwarded to the object via
    method_missing.

    The result of either call with be returned.

    @param [Object] recv the ruby object
    @param [String] mid ruby method to call
  */
  Opal.send = function(recv, mid) {
    var args = __slice.call(arguments, 2),
        func = recv['$' + mid];

    if (func) {
      return func.apply(recv, args);
    }

    return recv.$method_missing.apply(recv, [mid].concat(args));
  };

  // Implementation of Class#===
  function module_eqq(object) {
    if (object == null) {
      return false;
    }

    var search = object._klass;

    while (search) {
      if (search === this) {
        return true;
      }

      search = search._super;
    }

    return false;
  }

  // Implementation of Class#to_s
  function module_to_s() {
    return this._name;
  }

  /**
   * Donate methods for a class/module
   */
  Opal.donate = function(klass, defined, indirect) {
    var methods = klass._methods, included_in = klass.$included_in;

    // if (!indirect) {
      klass._methods = methods.concat(defined);
    // }

    if (included_in) {
      for (var i = 0, length = included_in.length; i < length; i++) {
        var includee = included_in[i];
        var dest = includee.prototype;

        for (var j = 0, jj = defined.length; j < jj; j++) {
          var method = defined[j];
          dest[method] = klass.prototype[method];
        }

        if (includee.$included_in) {
          Opal.donate(includee, defined, true);
        }
      }
    }
  };

  /*
    Define a singleton method on the given klass

        Opal.defs(Array, '$foo', function() {})

    @param [Function] klass
    @param [String] mid the method_id
    @param [Function] body function body
  */
  Opal.defs = function(klass, mid, body) {
    klass._smethods.push(mid);
    klass[mid] = body;

    var inherited = klass._inherited;
    if (inherited.length) {
      for (var i = 0, length = inherited.length, subclass; i < length; i++) {
        subclass = inherited[i];
        if (!subclass[mid]) {
          Opal.defs(subclass, mid, body);
        }
      }
    }
  };

  // Defines methods onto Object (which are then donated to bridged classes)
  Object._defn = function (mid, body) {
    this.prototype[mid] = body;
    Opal.donate(this, [mid]);
  };

  // Initialization
  // --------------

  boot_defclass('BasicObject', BasicObject)
  boot_defclass('Object', Object, BasicObject);
  boot_defclass('Class', Class, Object);

  Class.prototype = Function.prototype;

  BasicObject._klass = Object._klass = Class._klass = Class;


  var bridged_classes = Object.$included_in = [];

  Opal.base = Object;
  BasicObject._scope = Object._scope = Opal;
  Opal.Module = Opal.Class;
  Opal.Kernel = Object;

  create_scope(Opal, Class);

  Object.prototype.toString = function() {
    return this.$to_s();
  };

  Opal.top = new Object;

  Opal.klass(Object, Object, 'NilClass', NilClass)
  var nil = Opal.nil = new NilClass;
  nil.call = nil.apply = function() { throw Opal.LocalJumpError.$new('no block given'); };

  Opal.breaker  = new Error('unexpected break');

  Opal.bridge('Array', Array);
  Opal.bridge('Boolean', Boolean);
  Opal.bridge('Numeric', Number);
  Opal.bridge('String', String);
  Opal.bridge('Proc', Function);
  Opal.bridge('Exception', Error);
  Opal.bridge('Regexp', RegExp);
  Opal.bridge('Time', Date);
}).call(this);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  return (function(__base, __super){
    function Class() {};
    Class = __klass(__base, __super, "Class", Class);

    var def = Class.prototype, __scope = Class._scope, TMP_1, TMP_2, TMP_3, TMP_4;

    __opal.defs(Class, '$new', TMP_1 = function(sup) {
      var $a, block;
      block = TMP_1._p || nil, TMP_1._p = null;
      if (sup == null) {
        sup = (($a = __scope.Object) == null ? __opal.cm("Object") : $a)
      }
      
      function AnonClass(){};
      var klass   = Opal.boot(sup, AnonClass)
      klass._name = nil;
      klass._scope = sup._scope;

      sup.$inherited(klass);

      if (block !== nil) {
        var block_self = block._s;
        block._s = null;
        block.call(klass);
        block._s = block_self;
      }

      return klass;
    
    });

    def.$allocate = function() {
      
      
      var obj = new this;
      obj._id = Opal.uid();
      return obj;
    
    };

    def.$alias_method = function(newname, oldname) {
      
      this.prototype['$' + newname] = this.prototype['$' + oldname];
      return this;
    };

    def.$ancestors = function() {
      
      
      var parent = this,
          result = [];

      while (parent) {
        result.push(parent);
        parent = parent._super;
      }

      return result;
    
    };

    def.$append_features = function(klass) {
      
      
      var module = this;

      if (!klass.$included_modules) {
        klass.$included_modules = [];
      }

      for (var idx = 0, length = klass.$included_modules.length; idx < length; idx++) {
        if (klass.$included_modules[idx] === module) {
          return;
        }
      }

      klass.$included_modules.push(module);

      if (!module.$included_in) {
        module.$included_in = [];
      }

      module.$included_in.push(klass);

      var donator   = module.prototype,
          prototype = klass.prototype,
          methods   = module._methods;

      for (var i = 0, length = methods.length; i < length; i++) {
        var method = methods[i];
        prototype[method] = donator[method];
      }

      if (prototype._smethods) {
        prototype._smethods.push.apply(prototype._smethods, methods);  
      }

      if (klass.$included_in) {
        __opal.donate(klass, methods.slice(), true);
      }
    
      return this;
    };

    def.$attr_accessor = function(names) {
      var $a, $b;names = __slice.call(arguments, 0);
      (($a = this).$attr_reader || $mm('attr_reader')).apply($a, [].concat(names));
      return (($b = this).$attr_writer || $mm('attr_writer')).apply($b, [].concat(names));
    };

    def.$attr_reader = function(names) {
      names = __slice.call(arguments, 0);
      
      var proto = this.prototype, cls = this;
      for (var i = 0, length = names.length; i < length; i++) {
        (function(name) {
          proto[name] = nil;
          var func = function() { return this[name] };

          if (cls._isSingleton) {
            __opal.defs(proto, '$' + name, func);
          }
          else {
            proto['$' + name] = func;
          }
        })(names[i]);
      }
    
      return nil;
    };

    def.$attr_writer = function(names) {
      names = __slice.call(arguments, 0);
      
      var proto = this.prototype, cls = this;
      for (var i = 0, length = names.length; i < length; i++) {
        (function(name) {
          proto[name] = nil;
          var func = function(value) { return this[name] = value; };

          if (cls._isSingleton) {
            __opal.defs(proto, '$' + name + '=', func);
          }
          else {
            proto['$' + name + '='] = func;
          }
        })(names[i]);
      }
    
      return nil;
    };

    def.$attr = def.$attr_accessor;

    def.$constants = function() {
      
      
      var result = [];
      var name_re = /^[A-Z][A-Za-z0-9_]+$/;
      var scopes = [this._scope];
      var own_only;
      if (this === Opal.Class) {
        own_only = false;
      }
      else {
        own_only = true;
        var parent = this._super;
        while (parent !== Opal.Object) {
          scopes.push(parent._scope);
          parent = parent._super;
        }
      }
      for (var i = 0, len = scopes.length; i < len; i++) {
        var scope = scopes[i]; 
        for (name in scope) {
          if ((!own_only || scope.hasOwnProperty(name)) && name_re.test(name)) {
            result.push(name);
          }
        }
      }

      return result;
    
    };

    def['$const_defined?'] = function(name, inherit) {
      var $a, $b, $c;if (inherit == null) {
        inherit = true
      }
      if (($a = (($b = name)['$=~'] || $mm('=~')).call($b, /^[A-Z]\w+$/)) === false || $a === nil) {
        (($a = this).$raise || $mm('raise')).call($a, (($c = __scope.NameError) == null ? __opal.cm("NameError") : $c), "wrong constant name " + (name))
      };
      
      scopes = [this._scope];
      if (inherit || this === Opal.Object) {
        var parent = this._super;
        while (parent !== Opal.BasicObject) {
          scopes.push(parent._scope);
          parent = parent._super;
        }
      }

      for (var i = 0, len = scopes.length; i < len; i++) {
        if (scopes[i].hasOwnProperty(name)) {
          return true;
        }
      }

      return false;
    
    };

    def.$const_get = function(name, inherit) {
      var $a, $b, $c;if (inherit == null) {
        inherit = true
      }
      if (($a = (($b = name)['$=~'] || $mm('=~')).call($b, /^[A-Z]\w+$/)) === false || $a === nil) {
        (($a = this).$raise || $mm('raise')).call($a, (($c = __scope.NameError) == null ? __opal.cm("NameError") : $c), "wrong constant name " + (name))
      };
      
      var scopes = [this._scope];
      if (inherit || this == Opal.Object) {
        var parent = this._super;
        while (parent !== Opal.BasicObject) {
          scopes.push(parent._scope);
          parent = parent._super;
        }
      }

      for (var i = 0, len = scopes.length; i < len; i++) {
        if (scopes[i].hasOwnProperty(name)) {
          return scopes[i][name];
        }
       }
 
      return (($c = this).$const_missing || $mm('const_missing')).call($c, name);
    
    };

    def.$const_missing = function(const$) {
      var name = nil, $a, $b;
      name = this._name;
      return (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.NameError) == null ? __opal.cm("NameError") : $b), "uninitialized constant " + (name) + "::" + (const$));
    };

    def.$const_set = function(name, value) {
      var $a, $b, $c, $d, $e;
      if (($a = (($b = name)['$=~'] || $mm('=~')).call($b, /^[A-Z]\w+$/)) === false || $a === nil) {
        (($a = this).$raise || $mm('raise')).call($a, (($c = __scope.NameError) == null ? __opal.cm("NameError") : $c), "wrong constant name " + (name))
      };
      try {
        name = (($c = name).$to_str || $mm('to_str')).call($c)
      } catch ($err) {
      if (true) {
        (($d = this).$raise || $mm('raise')).call($d, (($e = __scope.TypeError) == null ? __opal.cm("TypeError") : $e), "conversion with #to_str failed")}
      else { throw $err; }
      };
      
      this._scope[name] = value;
      return value
    
    };

    def.$define_method = TMP_2 = function(name, method) {
      var block;
      block = TMP_2._p || nil, TMP_2._p = null;
      
      
      if (method) {
        block = method;
      }

      if (block === nil) {
        no_block_given();
      }

      var jsid    = '$' + name;
      block._jsid = jsid;
      block._sup  = this.prototype[jsid];
      block._s    = null;

      this.prototype[jsid] = block;
      __opal.donate(this, [jsid]);

      return nil;
    
    };

    def.$include = function(mods) {
      var $a, $b;mods = __slice.call(arguments, 0);
      
      var i = mods.length - 1, mod;
      while (i >= 0) {
        mod = mods[i];
        i--;

        if (mod === this) {
          continue;
        }

        (($a = (mod)).$append_features || $mm('append_features')).call($a, this);
        (($b = (mod)).$included || $mm('included')).call($b, this);
      }

      return this;
    
    };

    def.$instance_methods = function(include_super) {
      if (include_super == null) {
        include_super = false
      }
      
      var methods = [], proto = this.prototype;

      for (var prop in this.prototype) {
        if (!include_super && !proto.hasOwnProperty(prop)) {
          continue;
        }

        if (prop.charAt(0) === '$') {
          methods.push(prop.substr(1));
        }
      }

      return methods;
    
    };

    def.$included = function(mod) {
      
      return nil;
    };

    def.$inherited = function(cls) {
      
      return nil;
    };

    def.$module_eval = TMP_3 = function() {
      var block;
      block = TMP_3._p || nil, TMP_3._p = null;
      
      
      if (block === nil) {
        no_block_given();
      }

      var block_self = block._s, result;

      block._s = null;
      result = block.call(this);
      block._s = block_self;

      return result;
    
    };

    def.$class_eval = def.$module_eval;

    def['$method_defined?'] = function(method) {
      
      
      if (typeof(this.prototype['$' + method]) === 'function') {
        return true;
      }

      return false;
    
    };

    def.$module_function = function(methods) {
      methods = __slice.call(arguments, 0);
      
      for (var i = 0, length = methods.length; i < length; i++) {
        var meth = methods[i], func = this.prototype['$' + meth];

        this['$' + meth] = func;
      }

      return this;
    
    };

    def.$name = function() {
      
      return this._name;
    };

    def.$new = TMP_4 = function(args) {
      var block;
      block = TMP_4._p || nil, TMP_4._p = null;
      args = __slice.call(arguments, 0);
      
      if (this.prototype.$initialize) {
        var obj = new this;
        obj._id = Opal.uid();

        obj.$initialize._p = block;
        obj.$initialize.apply(obj, args);
        return obj;
      }
      else {
        var cons = function() {};
        cons.prototype = this.prototype;
        var obj = new cons;
        this.apply(obj, args);
        return obj;
      }
    
    };

    def.$public = function() {
      
      return nil;
    };

    def.$private = def.$public;

    def.$protected = def.$public;

    def.$superclass = function() {
      
      return this._super || nil;
    };

    def.$undef_method = function(symbol) {
      
      this.prototype['$' + symbol] = undefined;
      return this;
    };

    return nil;
  })(self, null)
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  return (function(__base, __super){
    function BasicObject() {};
    BasicObject = __klass(__base, __super, "BasicObject", BasicObject);

    var def = BasicObject.prototype, __scope = BasicObject._scope, TMP_1, TMP_2, TMP_3, TMP_4;

    def.$initialize = function() {
      
      return nil;
    };

    def['$=='] = function(other) {
      
      return this === other;
    };

    def.$__send__ = TMP_1 = function(symbol, args) {
      var block;
      block = TMP_1._p || nil, TMP_1._p = null;
      args = __slice.call(arguments, 1);
      
      var func = this['$' + symbol]

      if (func) {
        if (block !== nil) { func._p = block; }
        return func.apply(this, args);
      }

      if (block !== nil) { this.$method_missing._p = block; }
      return this.$method_missing.apply(this, [symbol].concat(args));
    
    };

    def['$eql?'] = def['$=='];

    def['$equal?'] = def['$=='];

    def.$instance_eval = TMP_2 = function() {
      var block;
      block = TMP_2._p || nil, TMP_2._p = null;
      
      
      if (block === nil) {
        no_block_given();
      }

      var block_self = block._s, result;

      block._s = null;
      result = block.call(this, this);
      block._s = block_self;

      return result;
    
    };

    def.$instance_exec = TMP_3 = function(args) {
      var block;
      block = TMP_3._p || nil, TMP_3._p = null;
      args = __slice.call(arguments, 0);
      
      if (block === nil) {
        no_block_given();
      }

      var block_self = block._s, result;

      block._s = null;
      result = block.apply(this, args);
      block._s = block_self;

      return result;
    
    };

    def.$method_missing = TMP_4 = function(symbol, args) {
      var $a, $b, block;
      block = TMP_4._p || nil, TMP_4._p = null;
      args = __slice.call(arguments, 1);
      return (($a = (($b = __scope.Kernel) == null ? __opal.cm("Kernel") : $b)).$raise || $mm('raise')).call($a, (($b = __scope.NoMethodError) == null ? __opal.cm("NoMethodError") : $b), "undefined method `" + (symbol) + "' for BasicObject instance");
    };

    return nil;
  })(self, null)
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __module = __opal.module;
  return (function(__base){
    function Kernel() {};
    Kernel = __module(__base, "Kernel", Kernel);
    var def = Kernel.prototype, __scope = Kernel._scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6;

    def.$initialize = def.$initialize;

    def['$=='] = def['$=='];

    def.$__send__ = def.$__send__;

    def['$eql?'] = def['$eql?'];

    def['$equal?'] = def['$equal?'];

    def.$instance_eval = def.$instance_eval;

    def.$instance_exec = def.$instance_exec;

    def.$method_missing = TMP_1 = function(symbol, args) {
      var $a, $b, block;
      block = TMP_1._p || nil, TMP_1._p = null;
      args = __slice.call(arguments, 1);
      return (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.NoMethodError) == null ? __opal.cm("NoMethodError") : $b), "undefined method `" + (symbol) + "' for " + ((($b = this).$inspect || $mm('inspect')).call($b)));
    };

    def['$=~'] = function(obj) {
      
      return false;
    };

    def['$==='] = function(other) {
      
      return this == other;
    };

    def.$as_json = function() {
      
      return nil;
    };

    def.$method = function(name) {
      var $a, $b;
      
      var recv = this,
          meth = recv['$' + name],
          func = function() {
            return meth.apply(recv, __slice.call(arguments, 0));
          };

      if (!meth) {
        (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.NameError) == null ? __opal.cm("NameError") : $b));
      }

      func._klass = (($b = __scope.Method) == null ? __opal.cm("Method") : $b);
      return func;
    
    };

    def.$methods = function(all) {
      if (all == null) {
        all = true
      }
      
      var methods = [];
      for(var k in this) {
        if(k[0] == "$" && typeof (this)[k] === "function") {
          if(all === false || all === nil) {
            if(!Object.hasOwnProperty.call(this, k)) {
              continue;
            }
          }
          methods.push(k.substr(1));
        }
      }
      return methods;
    
    };

    def.$Array = function(object) {
      var $a, $b;
      
      if (object.$to_ary) {
        return (($a = object).$to_ary || $mm('to_ary')).call($a);
      }
      else if (object.$to_a) {
        return (($b = object).$to_a || $mm('to_a')).call($b);
      }

      return [object];
    
    };

    def.$class = function() {
      
      return this._klass;
    };

    def.$define_singleton_method = TMP_2 = function(name) {
      var body;
      body = TMP_2._p || nil, TMP_2._p = null;
      
      
      if (body === nil) {
        no_block_given();
      }

      var jsid   = '$' + name;
      body._jsid = jsid;
      body._sup  = this[jsid];
      body._s    = null;

      this[jsid] = body;

      return this;
    
    };

    def.$dup = function() {
      var $a, $b;
      return (($a = (($b = this).$class || $mm('class')).call($b)).$allocate || $mm('allocate')).call($a);
    };

    def.$enum_for = function(method, args) {
      var $a, $b;if (method == null) {
        method = "each"
      }args = __slice.call(arguments, 1);
      return (($a = (($b = __scope.Enumerator) == null ? __opal.cm("Enumerator") : $b)).$new || $mm('new')).apply($a, [this, method].concat(args));
    };

    def['$equal?'] = function(other) {
      
      return this === other;
    };

    def.$extend = function(mods) {
      var $a, $b;mods = __slice.call(arguments, 0);
      
      for (var i = 0, length = mods.length; i < length; i++) {
        (($a = (($b = this).$singleton_class || $mm('singleton_class')).call($b)).$include || $mm('include')).call($a, mods[i]);
      }

      return this;
    
    };

    def.$format = function(format, args) {
      var $a, $b, $c, $d, $e, $f, $g, $h, $i, $j, $k, $l, $m, $n;args = __slice.call(arguments, 1);
      
      var idx = 0;
      return format.replace(/%(\d+\$)?([-+ 0]*)(\d*|\*(\d+\$)?)(?:\.(\d*|\*(\d+\$)?))?([cspdiubBoxXfgeEG])|(%%)/g, function(str, idx_str, flags, width_str, w_idx_str, prec_str, p_idx_str, spec, escaped) {
        if (escaped) {
          return '%';
        }

        var width,
        prec,
        is_integer_spec = ("diubBoxX".indexOf(spec) != -1),
        is_float_spec = ("eEfgG".indexOf(spec) != -1),
        prefix = '',
        obj;

        if (width_str === undefined) {
          width = undefined;
        } else if (width_str.charAt(0) == '*') {
          var w_idx = idx++;
          if (w_idx_str) {
            w_idx = parseInt(w_idx_str, 10) - 1;
          }
          width = (($a = (args[w_idx])).$to_i || $mm('to_i')).call($a);
        } else {
          width = parseInt(width_str, 10);
        }
        if (!prec_str) {
          prec = is_float_spec ? 6 : undefined;
        } else if (prec_str.charAt(0) == '*') {
          var p_idx = idx++;
          if (p_idx_str) {
            p_idx = parseInt(p_idx_str, 10) - 1;
          }
          prec = (($b = (args[p_idx])).$to_i || $mm('to_i')).call($b);
        } else {
          prec = parseInt(prec_str, 10);
        }
        if (idx_str) {
          idx = parseInt(idx_str, 10) - 1;
        }
        switch (spec) {
        case 'c':
          obj = args[idx];
          if (obj._isString) {
            str = obj.charAt(0);
          } else {
            str = String.fromCharCode((($c = (obj)).$to_i || $mm('to_i')).call($c));
          }
          break;
        case 's':
          str = (($d = (args[idx])).$to_s || $mm('to_s')).call($d);
          if (prec !== undefined) {
            str = str.substr(0, prec);
          }
          break;
        case 'p':
          str = (($e = (args[idx])).$inspect || $mm('inspect')).call($e);
          if (prec !== undefined) {
            str = str.substr(0, prec);
          }
          break;
        case 'd':
        case 'i':
        case 'u':
          str = (($f = (args[idx])).$to_i || $mm('to_i')).call($f).toString();
          break;
        case 'b':
        case 'B':
          str = (($g = (args[idx])).$to_i || $mm('to_i')).call($g).toString(2);
          break;
        case 'o':
          str = (($h = (args[idx])).$to_i || $mm('to_i')).call($h).toString(8);
          break;
        case 'x':
        case 'X':
          str = (($i = (args[idx])).$to_i || $mm('to_i')).call($i).toString(16);
          break;
        case 'e':
        case 'E':
          str = (($j = (args[idx])).$to_f || $mm('to_f')).call($j).toExponential(prec);
          break;
        case 'f':
          str = (($k = (args[idx])).$to_f || $mm('to_f')).call($k).toFixed(prec);
          break;
        case 'g':
        case 'G':
          str = (($l = (args[idx])).$to_f || $mm('to_f')).call($l).toPrecision(prec);
          break;
        }
        idx++;
        if (is_integer_spec || is_float_spec) {
          if (str.charAt(0) == '-') {
            prefix = '-';
            str = str.substr(1);
          } else {
            if (flags.indexOf('+') != -1) {
              prefix = '+';
            } else if (flags.indexOf(' ') != -1) {
              prefix = ' ';
            }
          }
        }
        if (is_integer_spec && prec !== undefined) {
          if (str.length < prec) {
            str = ($m = "0", $n = prec - str.length, typeof($m) === 'number' ? $m * $n : $m['$*']($n)) + str;
          }
        }
        var total_len = prefix.length + str.length;
        if (width !== undefined && total_len < width) {
          if (flags.indexOf('-') != -1) {
            str = str + ($m = " ", $n = width - total_len, typeof($m) === 'number' ? $m * $n : $m['$*']($n));
          } else {
            var pad_char = ' ';
            if (flags.indexOf('0') != -1) {
              str = ($m = "0", $n = width - total_len, typeof($m) === 'number' ? $m * $n : $m['$*']($n)) + str;
            } else {
              prefix = ($m = " ", $n = width - total_len, typeof($m) === 'number' ? $m * $n : $m['$*']($n)) + prefix;
            }
          }
        }
        var result = prefix + str;
        if ('XEG'.indexOf(spec) != -1) {
          result = result.toUpperCase();
        }
        return result;
      });
    
    };

    def.$hash = function() {
      
      return this._id;
    };

    def.$inspect = function() {
      var $a;
      return (($a = this).$to_s || $mm('to_s')).call($a);
    };

    def['$instance_of?'] = function(klass) {
      
      return this._klass === klass;
    };

    def['$instance_variable_defined?'] = function(name) {
      
      return __hasOwn.call(this, name.substr(1));
    };

    def.$instance_variable_get = function(name) {
      
      
      var ivar = this[name.substr(1)];

      return ivar == null ? nil : ivar;
    
    };

    def.$instance_variable_set = function(name, value) {
      
      return this[name.substr(1)] = value;
    };

    def.$instance_variables = function() {
      
      
      var result = [];

      for (var name in this) {
        if (name.charAt(0) !== '$') {
          result.push(name);
        }
      }

      return result;
    
    };

    def['$is_a?'] = function(klass) {
      
      
      var search = this._klass;

      while (search) {
        if (search === klass) {
          return true;
        }

        search = search._super;
      }

      return false;
    
    };

    def['$kind_of?'] = def['$is_a?'];

    def.$lambda = TMP_3 = function() {
      var block;
      block = TMP_3._p || nil, TMP_3._p = null;
      
      return block;
    };

    def.$loop = TMP_4 = function() {
      var block;
      block = TMP_4._p || nil, TMP_4._p = null;
      
      while (true) {;
      if (block.call(null) === __breaker) return __breaker.$v;
      };
      return this;
    };

    def['$nil?'] = function() {
      
      return false;
    };

    def.$object_id = function() {
      
      return this._id || (this._id = Opal.uid());
    };

    def.$printf = function(args) {
      var fmt = nil, $a, $b, $c, $d, $e;args = __slice.call(arguments, 0);
      if ((($a = (($b = args).$length || $mm('length')).call($b))['$>'] || $mm('>')).call($a, 0)) {
        fmt = (($c = args).$shift || $mm('shift')).call($c);
        (($d = this).$print || $mm('print')).call($d, (($e = this).$format || $mm('format')).apply($e, [fmt].concat(args)));
      };
      return nil;
    };

    def.$proc = TMP_5 = function() {
      var $a, $b, block;
      block = TMP_5._p || nil, TMP_5._p = null;
      
      
      if (block === nil) {
        (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.ArgumentError) == null ? __opal.cm("ArgumentError") : $b), "no block given");
      }
      block.is_lambda = false;
      return block;
    
    };

    def.$puts = function(strs) {
      var $a, $b;strs = __slice.call(arguments, 0);
      
      for (var i = 0; i < strs.length; i++) {
        if(strs[i] instanceof Array) {
          (($a = this).$puts || $mm('puts')).apply($a, [].concat((strs[i])))
        } else {
          __opal.puts((($b = (strs[i])).$to_s || $mm('to_s')).call($b));
        }
      }
    
      return nil;
    };

    def.$p = function(args) {
      var $a, $b, $c;args = __slice.call(arguments, 0);
      console.log.apply(console, args);
      if ((($a = (($b = args).$length || $mm('length')).call($b))['$<='] || $mm('<=')).call($a, 1)) {
        return (($c = args)['$[]'] || $mm('[]')).call($c, 0)
        } else {
        return args
      };
    };

    def.$print = def.$puts;

    def.$raise = function(exception, string) {
      var $a, $b, $c;if (exception == null) {
        exception = ""
      }
      
      if (typeof(exception) === 'string') {
        exception = (($a = (($b = __scope.RuntimeError) == null ? __opal.cm("RuntimeError") : $b)).$new || $mm('new')).call($a, exception);
      }
      else if (!(($b = exception)['$is_a?'] || $mm('is_a?')).call($b, (($c = __scope.Exception) == null ? __opal.cm("Exception") : $c))) {
        exception = (($c = exception).$new || $mm('new')).call($c, string);
      }

      throw exception;
    
    };

    def.$rand = function(max) {
      
      return max == null ? Math.random() : Math.floor(Math.random() * max);
    };

    def['$respond_to?'] = function(name) {
      
      return !!this['$' + name];
    };

    def.$send = def.$__send__;

    def.$singleton_class = function() {
      
      
      if (typeof(this) === 'function') {
        if (this._singleton) {
          return this._singleton;
        }

        var meta = new __opal.Class;
        meta._klass = __opal.Class;
        this._singleton = meta;
        meta.prototype = this;
        meta._isSingleton = true;

        return meta;
      }

      if (typeof(this) === 'function') {
        return this._klass;
      }

      if (this._singleton) {
        return this._singleton;
      }

      else {
        var orig_class = this._klass,
            class_id   = "#<Class:#<" + orig_class._name + ":" + orig_class._id + ">>";

        var Singleton = function () {};
        var meta = Opal.boot(orig_class, Singleton);
        meta._name = class_id;

        meta.prototype = this;
        this._singleton = meta;
        meta._klass = orig_class._klass;

        return meta;
      }
    
    };

    def.$sprintf = def.$format;

    def.$String = function(str) {
      
      return String(str);
    };

    def.$tap = TMP_6 = function() {
      var block;
      block = TMP_6._p || nil, TMP_6._p = null;
      
      if (block.call(null, this) === __breaker) return __breaker.$v;
      return this;
    };

    def.$to_json = function() {
      var $a, $b;
      return (($a = (($b = this).$to_s || $mm('to_s')).call($b)).$to_json || $mm('to_json')).call($a);
    };

    def.$to_proc = function() {
      
      return this;
    };

    def.$to_s = function() {
      
      return "#<" + this._klass._name + ":" + this._id + ">";
    };
        ;__opal.donate(Kernel, ["$initialize", "$==", "$__send__", "$eql?", "$equal?", "$instance_eval", "$instance_exec", "$method_missing", "$=~", "$===", "$as_json", "$method", "$methods", "$Array", "$class", "$define_singleton_method", "$dup", "$enum_for", "$equal?", "$extend", "$format", "$hash", "$inspect", "$instance_of?", "$instance_variable_defined?", "$instance_variable_get", "$instance_variable_set", "$instance_variables", "$is_a?", "$kind_of?", "$lambda", "$loop", "$nil?", "$object_id", "$printf", "$proc", "$puts", "$p", "$print", "$raise", "$rand", "$respond_to?", "$send", "$singleton_class", "$sprintf", "$String", "$tap", "$to_json", "$to_proc", "$to_s"]);
  })(self)
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  return (function(__base, __super){
    function NilClass() {};
    NilClass = __klass(__base, __super, "NilClass", NilClass);

    var def = NilClass.prototype, __scope = NilClass._scope;

    def['$&'] = function(other) {
      
      return false;
    };

    def['$|'] = function(other) {
      
      return other !== false && other !== nil;
    };

    def['$^'] = function(other) {
      
      return other !== false && other !== nil;
    };

    def['$=='] = function(other) {
      
      return other === nil;
    };

    def.$as_json = function() {
      
      return this;
    };

    def.$dup = function() {
      var $a, $b;
      return (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.TypeError) == null ? __opal.cm("TypeError") : $b));
    };

    def.$inspect = function() {
      
      return "nil";
    };

    def['$nil?'] = function() {
      
      return true;
    };

    def.$singleton_class = function() {
      var $a;
      return (($a = __scope.NilClass) == null ? __opal.cm("NilClass") : $a);
    };

    def.$to_a = function() {
      
      return [];
    };

    def.$to_h = function() {
      
      return __opal.hash();
    };

    def.$to_i = function() {
      
      return 0;
    };

    def.$to_f = def.$to_i;

    def.$to_json = function() {
      
      return "null";
    };

    def.$to_native = function() {
      
      return null;
    };

    def.$to_s = function() {
      
      return "";
    };

    return nil;
  })(self, null)
})(Opal);
(function(__opal) {
  var $a, self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  (function(__base, __super){
    function Boolean() {};
    Boolean = __klass(__base, __super, "Boolean", Boolean);

    var def = Boolean.prototype, __scope = Boolean._scope;

    def._isBoolean = true;

    def['$&'] = function(other) {
      
      return (this == true) ? (other !== false && other !== nil) : false;
    };

    def['$|'] = function(other) {
      
      return (this == true) ? true : (other !== false && other !== nil);
    };

    def['$^'] = function(other) {
      
      return (this == true) ? (other === false || other === nil) : (other !== false && other !== nil);
    };

    def['$=='] = function(other) {
      
      return (this == true) === other.valueOf();
    };

    def.$as_json = function() {
      
      return this;
    };

    def.$singleton_class = def.$class;

    def.$to_json = function() {
      
      return (this == true) ? 'true' : 'false';
    };

    def.$to_s = function() {
      
      return (this == true) ? 'true' : 'false';
    };

    return nil;
  })(self, null);
  __scope.TrueClass = (($a = __scope.Boolean) == null ? __opal.cm("Boolean") : $a);
  return __scope.FalseClass = (($a = __scope.Boolean) == null ? __opal.cm("Boolean") : $a);
})(Opal);
(function(__opal) {
  var $a, self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  (function(__base, __super){
    function Exception() {};
    Exception = __klass(__base, __super, "Exception", Exception);

    var def = Exception.prototype, __scope = Exception._scope;
    def.message = nil;

    def.$message = function() {
      
      return this.message
    }, nil;

    __opal.defs(Exception, '$new', function(message) {
      if (message == null) {
        message = ""
      }
      
      var err = new Error(message);
      err._klass = this;
      err.name = this._name;
      return err;
    
    });

    def.$backtrace = function() {
      
      
      var backtrace = this.stack;

      if (typeof(backtrace) === 'string') {
        return backtrace.split("\n").slice(0, 15);
      }
      else if (backtrace) {
        return backtrace.slice(0, 15);
      }

      return [];
    
    };

    def.$inspect = function() {
      var $a, $b;
      return "#<" + ((($a = (($b = this).$class || $mm('class')).call($b)).$name || $mm('name')).call($a)) + ": '" + (this.message) + "'>";
    };

    return def.$to_s = def.$message;
  })(self, null);
  (function(__base, __super){
    function StandardError() {};
    StandardError = __klass(__base, __super, "StandardError", StandardError);

    var def = StandardError.prototype, __scope = StandardError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function RuntimeError() {};
    RuntimeError = __klass(__base, __super, "RuntimeError", RuntimeError);

    var def = RuntimeError.prototype, __scope = RuntimeError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function LocalJumpError() {};
    LocalJumpError = __klass(__base, __super, "LocalJumpError", LocalJumpError);

    var def = LocalJumpError.prototype, __scope = LocalJumpError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function TypeError() {};
    TypeError = __klass(__base, __super, "TypeError", TypeError);

    var def = TypeError.prototype, __scope = TypeError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function NameError() {};
    NameError = __klass(__base, __super, "NameError", NameError);

    var def = NameError.prototype, __scope = NameError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function NoMethodError() {};
    NoMethodError = __klass(__base, __super, "NoMethodError", NoMethodError);

    var def = NoMethodError.prototype, __scope = NoMethodError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function ArgumentError() {};
    ArgumentError = __klass(__base, __super, "ArgumentError", ArgumentError);

    var def = ArgumentError.prototype, __scope = ArgumentError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function IndexError() {};
    IndexError = __klass(__base, __super, "IndexError", IndexError);

    var def = IndexError.prototype, __scope = IndexError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function KeyError() {};
    KeyError = __klass(__base, __super, "KeyError", KeyError);

    var def = KeyError.prototype, __scope = KeyError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function RangeError() {};
    RangeError = __klass(__base, __super, "RangeError", RangeError);

    var def = RangeError.prototype, __scope = RangeError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function StopIteration() {};
    StopIteration = __klass(__base, __super, "StopIteration", StopIteration);

    var def = StopIteration.prototype, __scope = StopIteration._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  (function(__base, __super){
    function SyntaxError() {};
    SyntaxError = __klass(__base, __super, "SyntaxError", SyntaxError);

    var def = SyntaxError.prototype, __scope = SyntaxError._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
  return (function(__base, __super){
    function SystemExit() {};
    SystemExit = __klass(__base, __super, "SystemExit", SystemExit);

    var def = SystemExit.prototype, __scope = SystemExit._scope;

    return nil
  })(self, (($a = __scope.Exception) == null ? __opal.cm("Exception") : $a));
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass, __gvars = __opal.gvars;
  return (function(__base, __super){
    function Regexp() {};
    Regexp = __klass(__base, __super, "Regexp", Regexp);

    var def = Regexp.prototype, __scope = Regexp._scope;

    __opal.defs(Regexp, '$escape', function(string) {
      
      return string.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\^\$\|]/g, '\\$&');
    });

    __opal.defs(Regexp, '$new', function(regexp, options) {
      
      return new RegExp(regexp, options);
    });

    def['$=='] = function(other) {
      
      return other.constructor == RegExp && this.toString() === other.toString();
    };

    def['$==='] = def.test;

    def['$=~'] = function(string) {
      var $a, $b;
      
      var re = this;
      if (re.global) {
        // should we clear it afterwards too?
        re.lastIndex = 0;
      }
      else {
        // rewrite regular expression to add the global flag to capture pre/post match
        re = new RegExp(re.source, 'g' + (re.multiline ? 'm' : '') + (re.ignoreCase ? 'i' : ''));
      }

      var result = re.exec(string);

      if (result) {
        __gvars["~"] = (($a = (($b = __scope.MatchData) == null ? __opal.cm("MatchData") : $b)).$new || $mm('new')).call($a, re, result);
      }
      else {
        __gvars["~"] = __gvars["`"] = __gvars["'"] = nil;
      }

      return result ? result.index : nil;
    
    };

    def['$eql?'] = def['$=='];

    def.$inspect = def.toString;

    def.$match = function(string, pos) {
      var $a, $b;
      
      var re = this;
      if (re.global) {
        // should we clear it afterwards too?
        re.lastIndex = 0;
      }
      else {
        re = new RegExp(re.source, 'g' + (this.multiline ? 'm' : '') + (this.ignoreCase ? 'i' : ''));
      }

      var result = re.exec(string);

      if (result) {
        return __gvars["~"] = (($a = (($b = __scope.MatchData) == null ? __opal.cm("MatchData") : $b)).$new || $mm('new')).call($a, re, result);
      }
      else {
        return __gvars["~"] = __gvars["`"] = __gvars["'"] = nil;
      }
    
    };

    def.$source = function() {
      
      return this.source;
    };

    return def.$to_s = def.$source;
  })(self, null)
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __module = __opal.module;
  return (function(__base){
    function Comparable() {};
    Comparable = __module(__base, "Comparable", Comparable);
    var def = Comparable.prototype, __scope = Comparable._scope;

    def['$<'] = function(other) {
      var $a, $b;
      return (($a = (($b = this)['$<=>'] || $mm('<=>')).call($b, other))['$=='] || $mm('==')).call($a, -1);
    };

    def['$<='] = function(other) {
      var $a, $b;
      return (($a = (($b = this)['$<=>'] || $mm('<=>')).call($b, other))['$<='] || $mm('<=')).call($a, 0);
    };

    def['$=='] = function(other) {
      var $a, $b;
      return (($a = (($b = this)['$<=>'] || $mm('<=>')).call($b, other))['$=='] || $mm('==')).call($a, 0);
    };

    def['$>'] = function(other) {
      var $a, $b;
      return (($a = (($b = this)['$<=>'] || $mm('<=>')).call($b, other))['$=='] || $mm('==')).call($a, 1);
    };

    def['$>='] = function(other) {
      var $a, $b;
      return (($a = (($b = this)['$<=>'] || $mm('<=>')).call($b, other))['$>='] || $mm('>=')).call($a, 0);
    };

    def['$between?'] = function(min, max) {
      var $a, $b, $c;
      return (($a = (($b = this)['$>'] || $mm('>')).call($b, min)) ? (($c = this)['$<'] || $mm('<')).call($c, max) : $a);
    };
        ;__opal.donate(Comparable, ["$<", "$<=", "$==", "$>", "$>=", "$between?"]);
  })(self)
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __module = __opal.module;
  return (function(__base){
    function Enumerable() {};
    Enumerable = __module(__base, "Enumerable", Enumerable);
    var def = Enumerable.prototype, __scope = Enumerable._scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_17, TMP_18;

    def['$all?'] = TMP_1 = function() {
      var block;
      block = TMP_1._p || nil, TMP_1._p = null;
      
      
      var result = true, proc;

      if (block !== nil) {
        proc = function(obj) {
          var value;
          var args = [];
          for(var i = 0; i < arguments.length; i ++) {
            args[i] = arguments[i];
          }
          
          if ((value = block.apply(this, args)) === __breaker) {
            return __breaker.$v;
          }
             
          if (value === false || value === nil) {
            result = false;
            __breaker.$v = nil;

            return __breaker;
          }
        }
      }
      else {
        proc = function(obj) {
          if ((obj === false || obj === nil) && arguments.length < 2) {  
            result = false;
            __breaker.$v = nil;

            return __breaker;
          }
        }
      }

      this.$each._p = proc;
      this.$each();

      return result;
    
    };

    def['$any?'] = TMP_2 = function() {
      var block;
      block = TMP_2._p || nil, TMP_2._p = null;
      
      
      var result = false, proc;

      if (block !== nil) {
        proc = function(obj) {
          var value;
          var args = [];
          for(var i = 0; i < arguments.length; i ++) {
            args[i] = arguments[i];
          }
          
          if ((value = block.apply(this, args)) === __breaker) {
            return __breaker.$v;
          }

          if (value !== false && value !== nil) {
            result       = true;
            __breaker.$v = nil;

            return __breaker;
          }
        }
      }
      else {
        proc = function(obj) {
          if ((obj !== false && obj !== nil) || arguments.length >= 2) {
            result      = true;
            __breaker.$v = nil;
            
            return __breaker;
          }
        }
      }

      this.$each._p = proc;
      this.$each();

      return result;
    
    };

    def.$collect = TMP_3 = function() {
      var block;
      block = TMP_3._p || nil, TMP_3._p = null;
      
      
      var result = [];

      var proc = function() {
        var obj = __slice.call(arguments), value;

        if ((value = block.apply(null, obj)) === __breaker) {
          return __breaker.$v;
        }

        result.push(value);
      };

      this.$each._p = proc;
      this.$each();

      return result;
    
    };

    def.$reduce = TMP_4 = function(object) {
      var block;
      block = TMP_4._p || nil, TMP_4._p = null;
      
      
      var result = object == undefined ? 0 : object;

      var proc = function() {
        var obj = __slice.call(arguments), value;

        if ((value = block.apply(null, [result].concat(obj))) === __breaker) {
          result = __breaker.$v;
          __breaker.$v = nil;

          return __breaker;
        }

        result = value;
      };

      this.$each._p = proc;
      this.$each();

      return result;
    
    };

    def.$count = TMP_5 = function(object) {
      var $a, block;
      block = TMP_5._p || nil, TMP_5._p = null;
      
      
      var result = 0;

      if (object != null) {
        block = function(obj) { return (($a = (obj))['$=='] || $mm('==')).call($a, object); };
      }
      else if (block === nil) {
        block = function() { return true; };
      }

      var proc = function(obj) {
        var value;

        if ((value = block(obj)) === __breaker) {
          return __breaker.$v;
        }

        if (value !== false && value !== nil) {
          result++;
        }
      }

      this.$each._p = proc;
      this.$each();

      return result;
    
    };

    def.$detect = TMP_6 = function(ifnone) {
      var $a, block;
      block = TMP_6._p || nil, TMP_6._p = null;
      
      
      var result = nil;

      this.$each._p = function(obj) {
        var value;

        if ((value = block(obj)) === __breaker) {
          return __breaker.$v;
        }

        if (value !== false && value !== nil) {
          result      = obj;
          __breaker.$v = nil;

          return __breaker;
        }
      };

      this.$each();

      if (result !== nil) {
        return result;
      }

      if (typeof(ifnone) === 'function') {
        return (($a = ifnone).$call || $mm('call')).call($a);
      }

      return ifnone == null ? nil : ifnone;
    
    };

    def.$drop = function(number) {
      
      
      var result  = [],
          current = 0;

      this.$each._p = function(obj) {
        if (number < current) {
          result.push(e);
        }

        current++;
      };

      this.$each()

      return result;
    
    };

    def.$drop_while = TMP_7 = function() {
      var block;
      block = TMP_7._p || nil, TMP_7._p = null;
      
      
      var result = [];

      this.$each._p = function(obj) {
        var value;

        if ((value = block(obj)) === __breaker) {
          return __breaker;
        }

        if (value === false || value === nil) {
          result.push(obj);
          return value;
        }

        return __breaker;
      };

      this.$each();

      return result;
    
    };

    def.$each_slice = TMP_8 = function(n) {
      var block;
      block = TMP_8._p || nil, TMP_8._p = null;
      
      
      var all = [];

      this.$each._p = function(obj) {
        all.push(obj);

        if (all.length == n) {
          block(all.slice(0));
          all = [];
        }
      };

      this.$each();

      // our "last" group, if smaller than n then wont have been yielded
      if (all.length > 0) {
        block(all.slice(0));
      }

      return nil;
    
    };

    def.$each_with_index = TMP_9 = function() {
      var block;
      block = TMP_9._p || nil, TMP_9._p = null;
      
      
      var index = 0;

      this.$each._p = function(obj) {
        var value;

        if ((value = block(obj, index)) === __breaker) {
          return __breaker.$v;
        }

        index++;
      };
      this.$each();

      return nil;
    
    };

    def.$each_with_object = TMP_10 = function(object) {
      var block;
      block = TMP_10._p || nil, TMP_10._p = null;
      
      
      this.$each._p = function(obj) {
        var value;

        if ((value = block(obj, object)) === __breaker) {
          return __breaker.$v;
        }
      };

      this.$each();

      return object;
    
    };

    def.$entries = function() {
      
      
      var result = [];

      this.$each._p = function(obj) {
        result.push(obj);
      };

      this.$each();

      return result;
    
    };

    def.$find = def.$detect;

    def.$find_all = TMP_11 = function() {
      var block;
      block = TMP_11._p || nil, TMP_11._p = null;
      
      
      var result = [];

      this.$each._p = function(obj) {
        var value;

        if ((value = block(obj)) === __breaker) {
          return __breaker.$v;
        }

        if (value !== false && value !== nil) {
          result.push(obj);
        }
      };

      this.$each();

      return result;
    
    };

    def.$find_index = TMP_12 = function(object) {
      var $a, block;
      block = TMP_12._p || nil, TMP_12._p = null;
      
      
      var proc, result = nil, index = 0;

      if (object != null) {
        proc = function (obj) {
          if ((($a = (obj))['$=='] || $mm('==')).call($a, object)) {
            result = index;
            return __breaker;
          }
          index += 1;
        };
      }
      else {
        proc = function(obj) {
          var value;

          if ((value = block(obj)) === __breaker) {
            return __breaker.$v;
          }

          if (value !== false && value !== nil) {
            result     = index;
            __breaker.$v = index;

            return __breaker;
          }
          index += 1;
        };
      }

      this.$each._p = proc;
      this.$each();

      return result;
    
    };

    def.$first = function(number) {
      
      
      var result = [],
          current = 0,
          proc;

      if (number == null) {
        result = nil;
        proc = function(obj) {
            result = obj; return __breaker;
          };
      } else {
        proc = function(obj) {
            if (number <= current) {
              return __breaker;
            }

            result.push(obj);

            current++;
          };
      }

      this.$each._p = proc;
      this.$each();

      return result;
    
    };

    def.$grep = TMP_13 = function(pattern) {
      var $a, $b, block;
      block = TMP_13._p || nil, TMP_13._p = null;
      
      
      var result = [];

      this.$each._p = (block !== nil
        ? function(obj) {
            var value = (($a = pattern)['$==='] || $mm('===')).call($a, obj);

            if (value !== false && value !== nil) {
              if ((value = block(obj)) === __breaker) {
                return __breaker.$v;
              }

              result.push(value);
            }
          }
        : function(obj) {
            var value = (($b = pattern)['$==='] || $mm('===')).call($b, obj);

            if (value !== false && value !== nil) {
              result.push(obj);
            }
          });

      this.$each();

      return result;
    
    };

    def.$group_by = TMP_14 = function() {
      var hash = nil, TMP_15, $a, $b, $c, TMP_16, block;
      block = TMP_14._p || nil, TMP_14._p = null;
      
      hash = ($a = (($b = (($c = __scope.Hash) == null ? __opal.cm("Hash") : $c)).$new || $mm('new')), $a._p = (TMP_15 = function(h, k) {

        var self = TMP_15._s || this, $a;
        if (h == null) h = nil;
if (k == null) k = nil;

        return (($a = h)['$[]='] || $mm('[]=')).call($a, k, [])
      }, TMP_15._s = this, TMP_15), $a).call($b);
      ($a = (($c = this).$each || $mm('each')), $a._p = (TMP_16 = function(el) {

        var self = TMP_16._s || this, $a, $b, $c;
        if (el == null) el = nil;

        return (($a = (($b = hash)['$[]'] || $mm('[]')).call($b, (($c = block).$call || $mm('call')).call($c, el)))['$<<'] || $mm('<<')).call($a, el)
      }, TMP_16._s = this, TMP_16), $a).call($c);
      return hash;
    };

    def.$map = def.$collect;

    def.$max = TMP_17 = function() {
      var $a, $b, block;
      block = TMP_17._p || nil, TMP_17._p = null;
      
      
      var proc, result;
      var arg_error = false;
      if (block !== nil) {
        proc = function(obj) {
          if (result == undefined) {
            result = obj;
          }
          else if ((value = block(obj, result)) === __breaker) {
            result = __breaker.$v;
            return __breaker;
          }
          else {
            if (value > 0) {
              result = obj;
            }
            __breaker.$v = nil;
          }
        }
      }
      else {
        proc = function(obj) {
          var modules = obj.$class().$included_modules;
          if (modules == undefined || modules.length == 0 || modules.indexOf(Opal.Comparable) == -1) {
            arg_error = true;
            return __breaker;
          }
          if (result == undefined || obj > result) {
            result = obj;
          }
        }
      }

      this.$each._p = proc;
      this.$each();

      if (arg_error) {
        (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.ArgumentError) == null ? __opal.cm("ArgumentError") : $b), "Array#max");
      }

      return (result == undefined ? nil : result);
    
    };

    def.$min = TMP_18 = function() {
      var $a, $b, block;
      block = TMP_18._p || nil, TMP_18._p = null;
      
      
      var proc, result;
      var arg_error = false;
      if (block !== nil) {
        proc = function(obj) {
          if (result == undefined) {
            result = obj;
          }
          else if ((value = block(obj, result)) === __breaker) {
            result = __breaker.$v;
            return __breaker;
          }
          else {
            if (value < 0) {
              result = obj;
            }
            __breaker.$v = nil;
          }
        }
      }
      else {
        proc = function(obj) {
          var modules = obj.$class().$included_modules;
          if (modules == undefined || modules.length == 0 || modules.indexOf(Opal.Comparable) == -1) {
            arg_error = true;
            return __breaker;
          }
          if (result == undefined || obj < result) {
            result = obj;
          }
        }
      }

      this.$each._p = proc;
      this.$each();

      if (arg_error) {
        (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.ArgumentError) == null ? __opal.cm("ArgumentError") : $b), "Array#min");
      }

      return (result == undefined ? nil : result);
    
    };

    def.$select = def.$find_all;

    def.$take = def.$first;

    def.$to_a = def.$entries;

    def.$inject = def.$reduce;
        ;__opal.donate(Enumerable, ["$all?", "$any?", "$collect", "$reduce", "$count", "$detect", "$drop", "$drop_while", "$each_slice", "$each_with_index", "$each_with_object", "$entries", "$find", "$find_all", "$find_index", "$first", "$grep", "$group_by", "$map", "$max", "$min", "$select", "$take", "$to_a", "$inject"]);
  })(self)
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  return (function(__base, __super){
    function Enumerator() {};
    Enumerator = __klass(__base, __super, "Enumerator", Enumerator);

    var def = Enumerator.prototype, __scope = Enumerator._scope, $a, $b, TMP_1;
    def.object = def.method = def.args = def.cache = nil;

    (($a = Enumerator).$include || $mm('include')).call($a, (($b = __scope.Enumerable) == null ? __opal.cm("Enumerable") : $b));

    def.$initialize = function(obj, method, args) {
      if (method == null) {
        method = "each"
      }args = __slice.call(arguments, 2);
      this.object = obj;
      this.method = method;
      return this.args = args;
    };

    def.$each = TMP_1 = function() {
      var $a, TMP_2, $b, $c, block;
      block = TMP_1._p || nil, TMP_1._p = null;
      
      if (block === nil) {
        return (($a = this).$enum_for || $mm('enum_for')).call($a, "each")
      };
      return ($b = (($c = this.object).$__send__ || $mm('__send__')), $b._p = (TMP_2 = function(e) {

        var self = TMP_2._s || this, $a;
        if (e == null) e = nil;

        return (($a = block).$call || $mm('call')).call($a, e)
      }, TMP_2._s = this, TMP_2), $b).apply($c, [this.method].concat(this.args));
    };

    def.$next = function() {
      var $a, $b, $c, $d;
      (($a = this.cache), $a !== false && $a !== nil ? $a : this.cache = (($b = this).$to_a || $mm('to_a')).call($b));
      if (($a = (($c = this.cache)['$empty?'] || $mm('empty?')).call($c)) !== false && $a !== nil) {
        (($a = this).$raise || $mm('raise')).call($a, (($d = __scope.StopIteration) == null ? __opal.cm("StopIteration") : $d), "end of enumeration")
      };
      return (($d = this.cache).$shift || $mm('shift')).call($d);
    };

    def.$rewind = function() {
      
      this.cache = nil;
      return this;
    };

    return nil;
  })(self, null)
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  return (function(__base, __super){
    function Array() {};
    Array = __klass(__base, __super, "Array", Array);

    var def = Array.prototype, __scope = Array._scope, $a, $b, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20;

    (($a = Array).$include || $mm('include')).call($a, (($b = __scope.Enumerable) == null ? __opal.cm("Enumerable") : $b));

    def._isArray = true;

    __opal.defs(Array, '$[]', function(objects) {
      objects = __slice.call(arguments, 0);
      return objects
    });

    __opal.defs(Array, '$new', TMP_1 = function(size, obj) {
      var block;
      block = TMP_1._p || nil, TMP_1._p = null;
      if (obj == null) {
        obj = nil
      }
      
      var arr = [];

      if (size && size._isArray) {
        for (var i = 0; i < size.length; i++) {
          arr[i] = size[i];
        }
      }
      else {
        if (block === nil) {
          for (var i = 0; i < size; i++) {
            arr[i] = obj;
          }
        }
        else {
          for (var i = 0; i < size; i++) {
            arr[i] = block(i);
          }
        }
      }

      return arr;
    
    });

    __opal.defs(Array, '$try_convert', function(obj) {
      
      
      if (obj._isArray) {
        return obj;
      }

      return nil;
    
    });

    def['$&'] = function(other) {
      
      
      var result = [],
          seen   = {};

      for (var i = 0, length = this.length; i < length; i++) {
        var item = this[i];
        if (item._isString) {
          item = item.toString();
        }

        if (!seen[item]) {
          for (var j = 0, length2 = other.length; j < length2; j++) {
            var item2 = other[j];
            if (item2._isString) {
              item2 = item2.toString();
            }

            if (item === item2 && !seen[item]) {
              seen[item] = true;

              result.push(item);
            }
          }
        }
      }

      return result;
    
    };

    def['$*'] = function(other) {
      
      
      if (typeof(other) === 'string') {
        return this.join(other);
      }

      var result = [];

      for (var i = 0; i < other; i++) {
        result = result.concat(this);
      }

      return result;
    
    };

    def['$+'] = function(other) {
      
      return this.concat(other);
    };

    def['$-'] = function(other) {
      var $a, $b, $c, $d, $e;
      
      var a = this,
          b = other,
          tmp = [],
          result = [];
      
     if (typeof(b) == "object" && !(b instanceof Array))  {
        if (b['$to_ary'] && typeof(b['$to_ary']) == "function") {
          b = b['$to_ary']();
        } else {
          (($a = this).$raise || $mm('raise')).call($a, (($b = (($c = __scope.TypeError) == null ? __opal.cm("TypeError") : $c)).$new || $mm('new')).call($b, "can't convert to Array. Array#-"));
        }
      }else if ((typeof(b) != "object")) {
        (($c = this).$raise || $mm('raise')).call($c, (($d = (($e = __scope.TypeError) == null ? __opal.cm("TypeError") : $e)).$new || $mm('new')).call($d, "can't convert to Array. Array#-")); 
      }      

      if (a.length == 0)
        return [];
      if (b.length == 0)
        return a;    
          
      for(var i = 0, length = b.length; i < length; i++) { 
        tmp[b[i]] = true;
      }
      for(var i = 0, length = a.length; i < length; i++) {
        if (!tmp[a[i]]) { 
          result.push(a[i]);
        }  
     }
     
      return result; 
    
    };

    def['$<<'] = function(object) {
      
      this.push(object);
      return this;
    };

    def['$<=>'] = function(other) {
      var $a, $b, $c;
      
      if ((($a = this).$hash || $mm('hash')).call($a) === (($b = other).$hash || $mm('hash')).call($b)) {
        return 0;
      }

      if (this.length != other.length) {
        return (this.length > other.length) ? 1 : -1;
      }

      for (var i = 0, length = this.length, tmp; i < length; i++) {
        if ((tmp = (($c = (this[i]))['$<=>'] || $mm('<=>')).call($c, other[i])) !== 0) {
          return tmp;
        }
      }

      return 0;
    
    };

    def['$=='] = function(other) {
      var $a;
      
      if (!other || (this.length !== other.length)) {
        return false;
      }

      for (var i = 0, length = this.length, tmp1, tmp2; i < length; i++) {
        tmp1 = this[i];
        tmp2 = other[i];
        
        //recursive
        if ((typeof(tmp1.indexOf) == "function") &&
            (typeof(tmp2.indexOf) == "function") &&  
            (tmp1.indexOf(tmp2) == tmp2.indexOf(tmp1))) {
          if (tmp1.indexOf(tmp1) == tmp2.indexOf(tmp2)) {
            continue;
          }
        }
        
        if (!(($a = (this[i]))['$=='] || $mm('==')).call($a, other[i])) {
          return false;
        }
        
      }
      

      return true;
    
    };

    def['$[]'] = function(index, length) {
      var $a;
      
      var size = this.length;

      if (typeof index !== 'number' && !index._isNumber) {
        if (index._isRange) {
          var exclude = index.exclude;
          length      = index.end;
          index       = index.begin;

          if (index > size) {
            return nil;
          }

          if (length < 0) {
            length += size;
          }

          if (!exclude) length += 1;
          return this.slice(index, length);
        }
        else {
          (($a = this).$raise || $mm('raise')).call($a, "bad arg for Array#[]");
        }
      }

      if (index < 0) {
        index += size;
      }

      if (length !== undefined) {
        if (length < 0 || index > size || index < 0) {
          return nil;
        }

        return this.slice(index, index + length);
      }
      else {
        if (index >= size || index < 0) {
          return nil;
        }

        return this[index];
      }
    
    };

    def['$[]='] = function(index, value) {
      
      
      var size = this.length;

      if (index < 0) {
        index += size;
      }

      return this[index] = value;
    
    };

    def.$assoc = function(object) {
      var $a;
      
      for (var i = 0, length = this.length, item; i < length; i++) {
        if (item = this[i], item.length && (($a = (item[0]))['$=='] || $mm('==')).call($a, object)) {
          return item;
        }
      }

      return nil;
    
    };

    def.$at = function(index) {
      
      
      if (index < 0) {
        index += this.length;
      }

      if (index < 0 || index >= this.length) {
        return nil;
      }

      return this[index];
    
    };

    def.$clear = function() {
      
      this.splice(0, this.length);
      return this;
    };

    def.$clone = function() {
      
      return this.slice();
    };

    def.$collect = TMP_2 = function() {
      var block;
      block = TMP_2._p || nil, TMP_2._p = null;
      
      
      var result = [];

      for (var i = 0, length = this.length, value; i < length; i++) {
        if ((value = block(this[i])) === __breaker) {
          return __breaker.$v;
        }

        result.push(value);
      }

      return result;
    
    };

    def['$collect!'] = TMP_3 = function() {
      var block;
      block = TMP_3._p || nil, TMP_3._p = null;
      
      
      for (var i = 0, length = this.length, val; i < length; i++) {
        if ((val = block(this[i])) === __breaker) {
          return __breaker.$v;
        }

        this[i] = val;
      }
    
      return this;
    };

    def.$compact = function() {
      
      
      var result = [];

      for (var i = 0, length = this.length, item; i < length; i++) {
        if ((item = this[i]) !== nil) {
          result.push(item);
        }
      }

      return result;
    
    };

    def['$compact!'] = function() {
      
      
      var original = this.length;

      for (var i = 0, length = this.length; i < length; i++) {
        if (this[i] === nil) {
          this.splice(i, 1);

          length--;
          i--;
        }
      }

      return this.length === original ? nil : this;
    
    };

    def.$concat = function(other) {
      
      
      for (var i = 0, length = other.length; i < length; i++) {
        this.push(other[i]);
      }
    
      return this;
    };

    def.$count = function(object) {
      var $a;
      
      if (object == null) {
        return this.length;
      }

      var result = 0;

      for (var i = 0, length = this.length; i < length; i++) {
        if ((($a = (this[i]))['$=='] || $mm('==')).call($a, object)) {
          result++;
        }
      }

      return result;
    
    };

    def.$delete = function(object) {
      var $a;
      
      var original = this.length;

      for (var i = 0, length = original; i < length; i++) {
        if ((($a = (this[i]))['$=='] || $mm('==')).call($a, object)) {
          this.splice(i, 1);

          length--;
          i--;
        }
      }

      return this.length === original ? nil : object;
    
    };

    def.$delete_at = function(index) {
      
      
      if (index < 0) {
        index += this.length;
      }

      if (index < 0 || index >= this.length) {
        return nil;
      }

      var result = this[index];

      this.splice(index, 1);

      return result;
    
    };

    def.$delete_if = TMP_4 = function() {
      var block;
      block = TMP_4._p || nil, TMP_4._p = null;
      
      
      for (var i = 0, length = this.length, value; i < length; i++) {
        if ((value = block(this[i])) === __breaker) {
          return __breaker.$v;
        }

        if (value !== false && value !== nil) {
          this.splice(i, 1);

          length--;
          i--;
        }
      }
    
      return this;
    };

    def.$drop = function(number) {
      
      return this.slice(number);
    };

    def.$dup = def.$clone;

    def.$each = TMP_5 = function() {
      var $a, $b, $c, block;
      block = TMP_5._p || nil, TMP_5._p = null;
      
      if (block === nil) {
        return (($a = this).$enum_for || $mm('enum_for')).call($a, "each")
      };
      if ((($b = (($c = block).$arity || $mm('arity')).call($c))['$>'] || $mm('>')).call($b, 0)) {
        
        for (var i = 0, length = this.length; i < length; i++) {
          if (block.apply(null, this[i]._isArray ? this[i] : [this[i]]) === __breaker) return __breaker.$v;
        }
      
        } else {
        
        for (var i = 0, length = this.length; i < length; i++) {
          if (block.call(null, this[i]) === __breaker) return __breaker.$v;
        }
      
      };
      return this;
    };

    def.$each_index = TMP_6 = function() {
      var block;
      block = TMP_6._p || nil, TMP_6._p = null;
      
      for (var i = 0, length = this.length; i < length; i++) {
      if (block.call(null, i) === __breaker) return __breaker.$v;
      };
      return this;
    };

    def['$empty?'] = function() {
      
      return !this.length;
    };

    def.$fetch = TMP_7 = function(index, defaults) {
      var $a, $b, block;
      block = TMP_7._p || nil, TMP_7._p = null;
      
      
      var original = index;

      if (index < 0) {
        index += this.length;
      }

      if (index >= 0 && index < this.length) {
        return this[index];
      }

      if (defaults != null) {
        return defaults;
      }

      if (block !== nil) {
        return block(original);
      }

      (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.IndexError) == null ? __opal.cm("IndexError") : $b), "Array#fetch");
    
    };

    def.$fill = TMP_8 = function(obj) {
      var block;
      block = TMP_8._p || nil, TMP_8._p = null;
      
      
      if (block !== nil) {
        for (var i = 0, length = this.length; i < length; i++) {
          this[i] = block(i);
        }
      }
      else {
        for (var i = 0, length = this.length; i < length; i++) {
          this[i] = obj;
        }
      }
    
      return this;
    };

    def.$first = function(count) {
      
      
      if (count != null) {
        return this.slice(0, count);
      }

      return this.length === 0 ? nil : this[0];
    
    };

    def.$flatten = function(level) {
      var $a, $b;
      
      var result = [];

      for (var i = 0, length = this.length, item; i < length; i++) {
        item = this[i];

        if (item._isArray) {
          if (level == null) {
            result = result.concat((($a = (item)).$flatten || $mm('flatten')).call($a));
          }
          else if (level === 0) {
            result.push(item);
          }
          else {
            result = result.concat((($b = (item)).$flatten || $mm('flatten')).call($b, level - 1));
          }
        }
        else {
          result.push(item);
        }
      }

      return result;
    
    };

    def['$flatten!'] = function(level) {
      var $a, $b;
      
      var size = this.length;
      (($a = this).$replace || $mm('replace')).call($a, (($b = this).$flatten || $mm('flatten')).call($b, level));

      return size === this.length ? nil : this;
    
    };

    def.$hash = function() {
      
      return this._id || (this._id = Opal.uid());
    };

    def['$include?'] = function(member) {
      var $a;
      
      for (var i = 0, length = this.length; i < length; i++) {
        if ((($a = (this[i]))['$=='] || $mm('==')).call($a, member)) {
          return true;
        }
      }

      return false;
    
    };

    def.$index = TMP_9 = function(object) {
      var $a, block;
      block = TMP_9._p || nil, TMP_9._p = null;
      
      
      if (object != null) {
        for (var i = 0, length = this.length; i < length; i++) {
          if ((($a = (this[i]))['$=='] || $mm('==')).call($a, object)) {
            return i;
          }
        }
      }
      else if (block !== nil) {
        for (var i = 0, length = this.length, value; i < length; i++) {
          if ((value = block(this[i])) === __breaker) {
            return __breaker.$v;
          }

          if (value !== false && value !== nil) {
            return i;
          }
        }
      }

      return nil;
    
    };

    def.$insert = function(index, objects) {
      var $a, $b;objects = __slice.call(arguments, 1);
      
      if (objects.length > 0) {
        if (index < 0) {
          index += this.length + 1;

          if (index < 0) {
            (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.IndexError) == null ? __opal.cm("IndexError") : $b), "" + (index) + " is out of bounds");
          }
        }
        if (index > this.length) {
          for (var i = this.length; i < index; i++) {
            this.push(nil);
          }
        }

        this.splice.apply(this, [index, 0].concat(objects));
      }
    
      return this;
    };

    def.$inspect = function() {
      var $a, $b, $c, $d;
      
      var i, inspect, el, el_insp, length, object_id;

      inspect = [];
      object_id = (($a = this).$object_id || $mm('object_id')).call($a);
      length = this.length;

      for (i = 0; i < length; i++) {
        el = (($b = this)['$[]'] || $mm('[]')).call($b, i);

        // Check object_id to ensure it's not the same array get into an infinite loop
        el_insp = (($c = (el)).$object_id || $mm('object_id')).call($c) === object_id ? '[...]' : (($d = (el)).$inspect || $mm('inspect')).call($d);

        inspect.push(el_insp);
      }
      return '[' + inspect.join(', ') + ']';
    
    };

    def.$join = function(sep) {
      var $a;if (sep == null) {
        sep = ""
      }
      
      var result = [];

      for (var i = 0, length = this.length; i < length; i++) {
        result.push((($a = (this[i])).$to_s || $mm('to_s')).call($a));
      }

      return result.join(sep);
    
    };

    def.$keep_if = TMP_10 = function() {
      var block;
      block = TMP_10._p || nil, TMP_10._p = null;
      
      
      for (var i = 0, length = this.length, value; i < length; i++) {
        if ((value = block(this[i])) === __breaker) {
          return __breaker.$v;
        }

        if (value === false || value === nil) {
          this.splice(i, 1);

          length--;
          i--;
        }
      }
    
      return this;
    };

    def.$last = function(count) {
      var $a, $b, $c, $d;
      
      var length = this.length;
      
      if (count === nil || typeof(count) == 'string') { 
        (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.TypeError) == null ? __opal.cm("TypeError") : $b), "no implicit conversion to integer");
      }
        
      if (typeof(count) == 'object') {
        if (typeof(count['$to_int']) == 'function') {
          count = count['$to_int']();
        } 
        else {
          (($b = this).$raise || $mm('raise')).call($b, (($c = __scope.TypeError) == null ? __opal.cm("TypeError") : $c), "no implicit conversion to integer");
        }
      }
      
      if (count == null) {
        return length === 0 ? nil : this[length - 1];
      }
      else if (count < 0) {
        (($c = this).$raise || $mm('raise')).call($c, (($d = __scope.ArgumentError) == null ? __opal.cm("ArgumentError") : $d), "negative count given");
      }

      if (count > length) {
        count = length;
      }

      return this.slice(length - count, length);
    
    };

    def.$length = function() {
      
      return this.length;
    };

    def.$map = def.$collect;

    def['$map!'] = def['$collect!'];

    def.$pop = function(count) {
      var $a;
      
      var length = this.length;

      if (count == null) {
        return length === 0 ? nil : this.pop();
      }

      if (count < 0) {
        (($a = this).$raise || $mm('raise')).call($a, "negative count given");
      }

      return count > length ? this.splice(0, this.length) : this.splice(length - count, length);
    
    };

    def.$push = function(objects) {
      objects = __slice.call(arguments, 0);
      
      for (var i = 0, length = objects.length; i < length; i++) {
        this.push(objects[i]);
      }
    
      return this;
    };

    def.$rassoc = function(object) {
      var $a;
      
      for (var i = 0, length = this.length, item; i < length; i++) {
        item = this[i];

        if (item.length && item[1] !== undefined) {
          if ((($a = (item[1]))['$=='] || $mm('==')).call($a, object)) {
            return item;
          }
        }
      }

      return nil;
    
    };

    def.$reject = TMP_11 = function() {
      var block;
      block = TMP_11._p || nil, TMP_11._p = null;
      
      
      var result = [];

      for (var i = 0, length = this.length, value; i < length; i++) {
        if ((value = block(this[i])) === __breaker) {
          return __breaker.$v;
        }

        if (value === false || value === nil) {
          result.push(this[i]);
        }
      }
      return result;
    
    };

    def['$reject!'] = TMP_12 = function() {
      var $a, $b, $c, block;
      block = TMP_12._p || nil, TMP_12._p = null;
      
      
      var original = this.length;
      ($b = (($c = this).$delete_if || $mm('delete_if')), $b._p = (($a = block).$to_proc || $mm('to_proc')).call($a), $b).call($c);
      return this.length === original ? nil : this;
    
    };

    def.$replace = function(other) {
      
      
      this.splice(0, this.length);
      this.push.apply(this, other);
      return this;
    
    };

    def.$reverse = function() {
      
      return this.slice(0).reverse();
    };

    def['$reverse!'] = def.reverse;

    def.$reverse_each = TMP_13 = function() {
      var $a, $b, $c, $d, block;
      block = TMP_13._p || nil, TMP_13._p = null;
      
      ($b = (($c = (($d = this).$reverse || $mm('reverse')).call($d)).$each || $mm('each')), $b._p = (($a = block).$to_proc || $mm('to_proc')).call($a), $b).call($c);
      return this;
    };

    def.$rindex = TMP_14 = function(object) {
      var $a, block;
      block = TMP_14._p || nil, TMP_14._p = null;
      
      
      if (block !== nil) {
        for (var i = this.length - 1, value; i >= 0; i--) {
          if ((value = block(this[i])) === __breaker) {
            return __breaker.$v;
          }

          if (value !== false && value !== nil) {
            return i;
          }
        }
      }
      else {
        for (var i = this.length - 1; i >= 0; i--) {
          if ((($a = (this[i]))['$=='] || $mm('==')).call($a, object)) {
            return i;
          }
        }
      }

      return nil;
    
    };

    def.$select = TMP_15 = function() {
      var block;
      block = TMP_15._p || nil, TMP_15._p = null;
      
      
      var result = [];

      for (var i = 0, length = this.length, item, value; i < length; i++) {
        item = this[i];

        if ((value = block(item)) === __breaker) {
          return __breaker.$v;
        }

        if (value !== false && value !== nil) {
          result.push(item);
        }
      }

      return result;
    
    };

    def['$select!'] = TMP_16 = function() {
      var $a, $b, $c, block;
      block = TMP_16._p || nil, TMP_16._p = null;
      
      
      var original = this.length;
      ($b = (($c = this).$keep_if || $mm('keep_if')), $b._p = (($a = block).$to_proc || $mm('to_proc')).call($a), $b).call($c);
      return this.length === original ? nil : this;
    
    };

    def.$shift = function(count) {
      
      
      if (this.length === 0) {
        return nil;
      }

      return count == null ? this.shift() : this.splice(0, count)
    
    };

    def.$size = def.$length;

    def.$shuffle = function() {
      
      
        for (var i = this.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = this[i];
          this[i] = this[j];
          this[j] = tmp;
        }

        return this;
    
    };

    def.$slice = def['$[]'];

    def['$slice!'] = function(index, length) {
      
      
      if (index < 0) {
        index += this.length;
      }

      if (length != null) {
        return this.splice(index, length);
      }

      if (index < 0 || index >= this.length) {
        return nil;
      }

      return this.splice(index, 1)[0];
    
    };

    def.$sort = TMP_17 = function() {
      var $a, $b, $c, block;
      block = TMP_17._p || nil, TMP_17._p = null;
      
      
      var copy = this.slice();
      var t_arg_error = false;
      var t_break = [];
        
      if (block !== nil) {
        var result = copy.sort(function(x, y) {
          var result = block(x, y);
          if (result === __breaker) {
            t_break.push(__breaker.$v);
          }
          if (result === nil) {
            t_arg_error = true;  
          }
          if (result['$<=>'] && typeof(result['$<=>']) == "function") {
            result = result['$<=>'](0);
          }
          if ([-1, 0, 1].indexOf(result) == -1) {
            t_arg_error = true;
          }
          return result;
        });

        if (t_break.length > 0)
          return t_break[0];
        if (t_arg_error)
          (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.ArgumentError) == null ? __opal.cm("ArgumentError") : $b), "Array#sort");

        return result;
      }
      
      var result = copy.sort(function(a, b){ 
        if (typeof(a) !== typeof(b)) {
          t_arg_error = true;
        }
        
        if (a['$<=>'] && typeof(a['$<=>']) == "function") {
          var result = a['$<=>'](b);
          if (result === nil) {
            t_arg_error = true;
          } 
          return result; 
        }  
        if (a > b)
          return 1;
        if (a < b)
          return -1;
        return 0;  
      });
      
      if (t_arg_error)
        (($b = this).$raise || $mm('raise')).call($b, (($c = __scope.ArgumentError) == null ? __opal.cm("ArgumentError") : $c), "Array#sort");

      return result;
    
    };

    def['$sort!'] = TMP_18 = function() {
      var block;
      block = TMP_18._p || nil, TMP_18._p = null;
      
      
      var result;
      if (block !== nil) {
        //strangely
        result = this.slice().sort(block);
      } else {
        result = this.slice()['$sort']();
      }
      this.length = 0;
      for(var i = 0; i < result.length; i++) {
        this.push(result[i]);
      }
      return this;
    
    };

    def.$take = function(count) {
      
      return this.slice(0, count);
    };

    def.$take_while = TMP_19 = function() {
      var block;
      block = TMP_19._p || nil, TMP_19._p = null;
      
      
      var result = [];

      for (var i = 0, length = this.length, item, value; i < length; i++) {
        item = this[i];

        if ((value = block(item)) === __breaker) {
          return __breaker.$v;
        }

        if (value === false || value === nil) {
          return result;
        }

        result.push(item);
      }

      return result;
    
    };

    def.$to_a = function() {
      
      return this;
    };

    def.$to_ary = def.$to_a;

    def.$to_json = function() {
      var $a;
      
      var result = [];

      for (var i = 0, length = this.length; i < length; i++) {
        result.push((($a = (this[i])).$to_json || $mm('to_json')).call($a));
      }

      return '[' + result.join(', ') + ']';
    
    };

    def.$to_native = function() {
      var $a;
      
      var result = [], obj

      for (var i = 0, len = this.length; i < len; i++) {
        obj = this[i];

        if (obj.$to_native) {
          result.push((($a = (obj)).$to_native || $mm('to_native')).call($a));
        }
        else {
          result.push(obj);
        }
      }

      return result;
    
    };

    def.$to_s = def.$inspect;

    def.$uniq = function() {
      
      
      var result = [],
          seen   = {};

      for (var i = 0, length = this.length, item, hash; i < length; i++) {
        item = this[i];
        hash = item;

        if (!seen[hash]) {
          seen[hash] = true;

          result.push(item);
        }
      }

      return result;
    
    };

    def['$uniq!'] = function() {
      
      
      var original = this.length,
          seen     = {};

      for (var i = 0, length = original, item, hash; i < length; i++) {
        item = this[i];
        hash = item;

        if (!seen[hash]) {
          seen[hash] = true;
        }
        else {
          this.splice(i, 1);

          length--;
          i--;
        }
      }

      return this.length === original ? nil : this;
    
    };

    def.$unshift = function(objects) {
      objects = __slice.call(arguments, 0);
      
      for (var i = objects.length - 1; i >= 0; i--) {
        this.unshift(objects[i]);
      }

      return this;
    
    };

    def.$zip = TMP_20 = function(others) {
      var block;
      block = TMP_20._p || nil, TMP_20._p = null;
      others = __slice.call(arguments, 0);
      
      var result = [], size = this.length, part, o;

      for (var i = 0; i < size; i++) {
        part = [this[i]];

        for (var j = 0, jj = others.length; j < jj; j++) {
          o = others[j][i];

          if (o == null) {
            o = nil;
          }

          part[j + 1] = o;
        }

        result[i] = part;
      }

      if (block !== nil) {
        for (var i = 0; i < size; i++) {
          block(result[i]);
        }

        return nil;
      }

      return result;
    
    };

    return nil;
  })(self, null)
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  return (function(__base, __super){
    function Hash() {};
    Hash = __klass(__base, __super, "Hash", Hash);

    var def = Hash.prototype, __scope = Hash._scope, $a, $b, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12;
    def.proc = def.none = nil;

    (($a = Hash).$include || $mm('include')).call($a, (($b = __scope.Enumerable) == null ? __opal.cm("Enumerable") : $b));

    
    var __hash = Opal.hash = function() {
      var hash   = new Hash,
          args   = __slice.call(arguments),
          keys   = [],
          assocs = {};

      hash.map   = assocs;
      hash.keys  = keys;

      for (var i = 0, length = args.length, key; i < length; i++) {
        var key = args[i], obj = args[++i];

        if (assocs[key] == null) {
          keys.push(key);
        }

        assocs[key] = obj;
      }

      return hash;
    };
  

    
    var __hash2 = Opal.hash2 = function(keys, map) {
      var hash = new Hash;
      hash.keys = keys;
      hash.map = map;
      return hash;
    };
  

    var __hasOwn = {}.hasOwnProperty;

    __opal.defs(Hash, '$[]', function(objs) {
      objs = __slice.call(arguments, 0);
      return __hash.apply(null, objs);
    });

    __opal.defs(Hash, '$allocate', function() {
      
      return __hash();
    });

    __opal.defs(Hash, '$from_native', function(obj) {
      
      
      var hash = __hash(), map = hash.map, keys = hash.keys;

      for (var key in obj) {
        keys.push(key);
        map[key] = obj[key];
      }

      return hash;
    
    });

    __opal.defs(Hash, '$new', TMP_1 = function(defaults) {
      var block;
      block = TMP_1._p || nil, TMP_1._p = null;
      
      
      var hash = __hash();

      if (defaults != null) {
        hash.none = defaults;
      }
      else if (block !== nil) {
        hash.proc = block;
      }

      return hash;
    
    });

    def['$=='] = function(other) {
      var $a, $b;
      
      if (this === other) {
        return true;
      }

      if (!other.map || !other.keys) {
        return false;
      }

      if (this.keys.length !== other.keys.length) {
        return false;
      }

      var map  = this.map,
          map2 = other.map;

      for (var i = 0, length = this.keys.length; i < length; i++) {
        var key = this.keys[i], obj = map[key], obj2 = map2[key];

        if (($a = (($b = (obj))['$=='] || $mm('==')).call($b, obj2), ($a === nil || $a === false))) {
          return false;
        }
      }

      return true;
    
    };

    def['$[]'] = function(key) {
      var $a;
      
      var bucket = this.map[key];

      if (bucket != null) {
        return bucket;
      }

      var proc = this.proc;

      if (proc !== nil) {
        return (($a = (proc)).$call || $mm('call')).call($a, this, key);
      }

      return this.none;
    
    };

    def['$[]='] = function(key, value) {
      
      
      var map = this.map;

      if (!__hasOwn.call(map, key)) {
        this.keys.push(key);
      }

      map[key] = value;

      return value;
    
    };

    def.$assoc = function(object) {
      var $a;
      
      var keys = this.keys, key;

      for (var i = 0, length = keys.length; i < length; i++) {
        key = keys[i];

        if ((($a = (key))['$=='] || $mm('==')).call($a, object)) {
          return [key, this.map[key]];
        }
      }

      return nil;
    
    };

    def.$clear = function() {
      
      
      this.map = {};
      this.keys = [];
      return this;
    
    };

    def.$clone = function() {
      
      
      var result = __hash(),
          map    = this.map,
          map2   = result.map,
          keys2  = result.keys;

      for (var i = 0, length = this.keys.length; i < length; i++) {
        keys2.push(this.keys[i]);
        map2[this.keys[i]] = map[this.keys[i]];
      }

      return result;
    
    };

    def.$default = function(val) {
      
      return this.none;
    };

    def['$default='] = function(object) {
      
      return this.none = object;
    };

    def.$default_proc = function() {
      
      return this.proc;
    };

    def['$default_proc='] = function(proc) {
      
      return this.proc = proc;
    };

    def.$delete = function(key) {
      
      
      var map  = this.map, result = map[key];

      if (result != null) {
        delete map[key];
        this.keys.$delete(key);

        return result;
      }

      return nil;
    
    };

    def.$delete_if = TMP_2 = function() {
      var block;
      block = TMP_2._p || nil, TMP_2._p = null;
      
      
      var map = this.map, keys = this.keys, value;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        if ((value = block(key, obj)) === __breaker) {
          return __breaker.$v;
        }

        if (value !== false && value !== nil) {
          keys.splice(i, 1);
          delete map[key];

          length--;
          i--;
        }
      }

      return this;
    
    };

    def.$dup = def.$clone;

    def.$each = TMP_3 = function() {
      var block;
      block = TMP_3._p || nil, TMP_3._p = null;
      
      
      var map = this.map, keys = this.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];

        if (block(key, map[key]) === __breaker) {
          return __breaker.$v;
        }
      }

      return this;
    
    };

    def.$each_key = TMP_4 = function() {
      var block;
      block = TMP_4._p || nil, TMP_4._p = null;
      
      
      var keys = this.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];

        if (block(key) === __breaker) {
          return __breaker.$v;
        }
      }

      return this;
    
    };

    def.$each_pair = def.$each;

    def.$each_value = TMP_5 = function() {
      var block;
      block = TMP_5._p || nil, TMP_5._p = null;
      
      
      var map = this.map, keys = this.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        if (block(map[keys[i]]) === __breaker) {
          return __breaker.$v;
        }
      }

      return this;
    
    };

    def['$empty?'] = function() {
      
      
      return this.keys.length === 0;
    
    };

    def['$eql?'] = def['$=='];

    def.$fetch = TMP_6 = function(key, defaults) {
      var $a, $b, block;
      block = TMP_6._p || nil, TMP_6._p = null;
      
      
      var value = this.map[key];

      if (value != null) {
        return value;
      }

      if (block !== nil) {
        var value;

        if ((value = block(key)) === __breaker) {
          return __breaker.$v;
        }

        return value;
      }

      if (defaults != null) {
        return defaults;
      }

      (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.KeyError) == null ? __opal.cm("KeyError") : $b), "key not found");
    
    };

    def.$flatten = function(level) {
      var $a;
      
      var map = this.map, keys = this.keys, result = [];

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], value = map[key];

        result.push(key);

        if (value._isArray) {
          if (level == null || level === 1) {
            result.push(value);
          }
          else {
            result = result.concat((($a = (value)).$flatten || $mm('flatten')).call($a, level - 1));
          }
        }
        else {
          result.push(value);
        }
      }

      return result;
    
    };

    def['$has_key?'] = function(key) {
      
      return this.map[key] != null;
    };

    def['$has_value?'] = function(value) {
      var $a;
      
      for (var assoc in this.map) {
        if ((($a = (this.map[assoc]))['$=='] || $mm('==')).call($a, value)) {
          return true;
        }
      }

      return false;
    
    };

    def.$hash = function() {
      
      return this._id;
    };

    def['$include?'] = def['$has_key?'];

    def.$index = function(object) {
      var $a;
      
      var map = this.map, keys = this.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];

        if ((($a = object)['$=='] || $mm('==')).call($a, map[key])) {
          return key;
        }
      }

      return nil;
    
    };

    def.$indexes = function(keys) {
      keys = __slice.call(arguments, 0);
      
      var result = [], map = this.map, val;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], val = map[key];

        if (val != null) {
          result.push(val);
        }
        else {
          result.push(this.none);
        }
      }

      return result;
    
    };

    def.$indices = def.$indexes;

    def.$inspect = function() {
      var $a, $b;
      
      var inspect = [], keys = this.keys, map = this.map;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];
        inspect.push((($a = (key)).$inspect || $mm('inspect')).call($a) + '=>' + (($b = (map[key])).$inspect || $mm('inspect')).call($b));
      }

      return '{' + inspect.join(', ') + '}';
    
    };

    def.$invert = function() {
      
      
      var result = __hash(), keys = this.keys, map = this.map,
          keys2 = result.keys, map2 = result.map;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        keys2.push(obj);
        map2[obj] = key;
      }

      return result;
    
    };

    def.$keep_if = TMP_7 = function() {
      var block;
      block = TMP_7._p || nil, TMP_7._p = null;
      
      
      var map = this.map, keys = this.keys, value;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        if ((value = block(key, obj)) === __breaker) {
          return __breaker.$v;
        }

        if (value === false || value === nil) {
          keys.splice(i, 1);
          delete map[key];

          length--;
          i--;
        }
      }

      return this;
    
    };

    def.$key = def.$index;

    def['$key?'] = def['$has_key?'];

    def.$keys = function() {
      
      
      return this.keys.slice(0);
    
    };

    def.$length = function() {
      
      
      return this.keys.length;
    
    };

    def['$member?'] = def['$has_key?'];

    def.$merge = TMP_8 = function(other) {
      var block;
      block = TMP_8._p || nil, TMP_8._p = null;
      
      
      var keys = this.keys, map = this.map,
          result = __hash(), keys2 = result.keys, map2 = result.map;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];

        keys2.push(key);
        map2[key] = map[key];
      }

      var keys = other.keys, map = other.map;

      if (block === nil) {
        for (var i = 0, length = keys.length; i < length; i++) {
          var key = keys[i];

          if (map2[key] == null) {
            keys2.push(key);
          }

          map2[key] = map[key];
        }
      }
      else {
        for (var i = 0, length = keys.length; i < length; i++) {
          var key = keys[i];

          if (map2[key] == null) {
            keys2.push(key);
            map2[key] = map[key];
          }
          else {
            map2[key] = block(key, map2[key], map[key]);
          }
        }
      }

      return result;
    
    };

    def['$merge!'] = TMP_9 = function(other) {
      var block;
      block = TMP_9._p || nil, TMP_9._p = null;
      
      
      var keys = this.keys, map = this.map,
          keys2 = other.keys, map2 = other.map;

      if (block === nil) {
        for (var i = 0, length = keys2.length; i < length; i++) {
          var key = keys2[i];

          if (map[key] == null) {
            keys.push(key);
          }

          map[key] = map2[key];
        }
      }
      else {
        for (var i = 0, length = keys2.length; i < length; i++) {
          var key = keys2[i];

          if (map[key] == null) {
            keys.push(key);
            map[key] = map2[key];
          }
          else {
            map[key] = block(key, map[key], map2[key]);
          }
        }
      }

      return this;
    
    };

    def.$rassoc = function(object) {
      var $a;
      
      var keys = this.keys, map = this.map;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        if ((($a = (obj))['$=='] || $mm('==')).call($a, object)) {
          return [key, obj];
        }
      }

      return nil;
    
    };

    def.$reject = TMP_10 = function() {
      var block;
      block = TMP_10._p || nil, TMP_10._p = null;
      
      
      var keys = this.keys, map = this.map,
          result = __hash(), map2 = result.map, keys2 = result.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key], value;

        if ((value = block(key, obj)) === __breaker) {
          return __breaker.$v;
        }

        if (value === false || value === nil) {
          keys2.push(key);
          map2[key] = obj;
        }
      }

      return result;
    
    };

    def.$replace = function(other) {
      
      
      var map = this.map = {}, keys = this.keys = [];

      for (var i = 0, length = other.keys.length; i < length; i++) {
        var key = other.keys[i];
        keys.push(key);
        map[key] = other.map[key];
      }

      return this;
    
    };

    def.$select = TMP_11 = function() {
      var block;
      block = TMP_11._p || nil, TMP_11._p = null;
      
      
      var keys = this.keys, map = this.map,
          result = __hash(), map2 = result.map, keys2 = result.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key], value;

        if ((value = block(key, obj)) === __breaker) {
          return __breaker.$v;
        }

        if (value !== false && value !== nil) {
          keys2.push(key);
          map2[key] = obj;
        }
      }

      return result;
    
    };

    def['$select!'] = TMP_12 = function() {
      var block;
      block = TMP_12._p || nil, TMP_12._p = null;
      
      
      var map = this.map, keys = this.keys, value, result = nil;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        if ((value = block(key, obj)) === __breaker) {
          return __breaker.$v;
        }

        if (value === false || value === nil) {
          keys.splice(i, 1);
          delete map[key];

          length--;
          i--;
          result = this
        }
      }

      return result;
    
    };

    def.$shift = function() {
      
      
      var keys = this.keys, map = this.map;

      if (keys.length) {
        var key = keys[0], obj = map[key];

        delete map[key];
        keys.splice(0, 1);

        return [key, obj];
      }

      return nil;
    
    };

    def.$size = def.$length;

    def.$to_a = function() {
      
      
      var keys = this.keys, map = this.map, result = [];

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];
        result.push([key, map[key]]);
      }

      return result;
    
    };

    def.$to_hash = function() {
      
      return this;
    };

    def.$to_json = function() {
      var $a, $b;
      
      var inspect = [], keys = this.keys, map = this.map;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];
        inspect.push((($a = (key)).$to_json || $mm('to_json')).call($a) + ': ' + (($b = (map[key])).$to_json || $mm('to_json')).call($b));
      }

      return '{' + inspect.join(', ') + '}';
    
    };

    def.$to_native = function() {
      var $a;
      
      var result = {}, keys = this.keys, map = this.map, bucket, value;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        if (obj.$to_native) {
          result[key] = (($a = (obj)).$to_native || $mm('to_native')).call($a);
        }
        else {
          result[key] = obj;
        }
      }

      return result;
    
    };

    def.$to_s = def.$inspect;

    def.$update = def['$merge!'];

    def['$value?'] = function(value) {
      var $a;
      
      var map = this.map;

      for (var assoc in map) {
        var v = map[assoc];
        if ((($a = (v))['$=='] || $mm('==')).call($a, value)) {
          return true;
        }
      }

      return false;
    
    };

    def.$values_at = def.$indexes;

    def.$values = function() {
      
      
      var map    = this.map,
          result = [];

      for (var key in map) {
        result.push(map[key]);
      }

      return result;
    
    };

    return nil;
  })(self, null)
})(Opal);
(function(__opal) {
  var $a, self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass, __gvars = __opal.gvars;
  (function(__base, __super){
    function String() {};
    String = __klass(__base, __super, "String", String);

    var def = String.prototype, __scope = String._scope, $a, $b, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6;

    (($a = String).$include || $mm('include')).call($a, (($b = __scope.Comparable) == null ? __opal.cm("Comparable") : $b));

    def._isString = true;

    __opal.defs(String, '$try_convert', function(what) {
      var $a;
      try {
        return (($a = what).$to_str || $mm('to_str')).call($a)
      } catch ($err) {
      if (true) {
        nil}
      else { throw $err; }
      }
    });

    __opal.defs(String, '$new', function(str) {
      if (str == null) {
        str = ""
      }
      
      return new String(str)
    ;
    });

    def['$%'] = function(data) {
      var $a, $b, $c;
      if (($a = (($b = data)['$is_a?'] || $mm('is_a?')).call($b, (($c = __scope.Array) == null ? __opal.cm("Array") : $c))) !== false && $a !== nil) {
        return (($a = this).$format || $mm('format')).apply($a, [this].concat(data))
        } else {
        return (($c = this).$format || $mm('format')).call($c, this, data)
      };
    };

    def['$*'] = function(count) {
      
      
      if (count < 1) {
        return '';
      }

      var result  = '',
          pattern = this.valueOf();

      while (count > 0) {
        if (count & 1) {
          result += pattern;
        }

        count >>= 1, pattern += pattern;
      }

      return result;
    
    };

    def['$+'] = function(other) {
      
      return this.toString() + other;
    };

    def['$<=>'] = function(other) {
      
      
      if (typeof other !== 'string') {
        return nil;
      }

      return this > other ? 1 : (this < other ? -1 : 0);
    
    };

    def['$<'] = function(other) {
      
      return this < other;
    };

    def['$<='] = function(other) {
      
      return this <= other;
    };

    def['$>'] = function(other) {
      
      return this > other;
    };

    def['$>='] = function(other) {
      
      return this >= other;
    };

    def['$=='] = function(other) {
      
      return other == String(this);
    };

    def['$==='] = def['$=='];

    def['$=~'] = function(other) {
      var $a, $b;
      
      if (typeof other === 'string') {
        (($a = this).$raise || $mm('raise')).call($a, "string given");
      }

      return (($b = other)['$=~'] || $mm('=~')).call($b, this);
    
    };

    def['$[]'] = function(index, length) {
      
      
      var size = this.length;

      if (index._isRange) {
        var exclude = index.exclude,
            length  = index.end,
            index   = index.begin;

        if (index < 0) {
          index += size;
        }

        if (length < 0) {
          length += size;
        }

        if (!exclude) {
          length += 1;
        }

        if (index > size) {
          return nil;
        }

        length = length - index;

        if (length < 0) {
          length = 0;
        }

        return this.substr(index, length);
      }

      if (index < 0) {
        index += this.length;
      }

      if (length == null) {
        if (index >= this.length || index < 0) {
          return nil;
        }

        return this.substr(index, 1);
      }

      if (index > this.length || index < 0) {
        return nil;
      }

      return this.substr(index, length);
    
    };

    def.$as_json = function() {
      
      return this;
    };

    def.$capitalize = function() {
      
      return this.charAt(0).toUpperCase() + this.substr(1).toLowerCase();
    };

    def.$casecmp = function(other) {
      
      
      if (typeof other !== 'string') {
        return other;
      }

      var a = this.toLowerCase(),
          b = other.toLowerCase();

      return a > b ? 1 : (a < b ? -1 : 0);
    
    };

    def.$center = function(width, padstr) {
      var $a, $b, $c, $d, $e, $f, $g, $h, $i, $j;if (padstr == null) {
        padstr = " "
      }
      
      if (width <= this.length) {
        return this;
      }
      else {
        var ljustified = (($a = this).$ljust || $mm('ljust')).call($a, (($b = ($c = ($e = width, $f = (($g = this).$size || $mm('size')).call($g), typeof($e) === 'number' ? $e + $f : $e['$+']($f)), $d = 2, typeof($c) === 'number' ? $c / $d : $c['$/']($d))).$floor || $mm('floor')).call($b), padstr);
        var rjustified = (($c = this).$rjust || $mm('rjust')).call($c, (($d = ($e = ($h = width, $i = (($j = this).$size || $mm('size')).call($j), typeof($h) === 'number' ? $h + $i : $h['$+']($i)), $f = 2, typeof($e) === 'number' ? $e / $f : $e['$/']($f))).$ceil || $mm('ceil')).call($d), padstr);
        return ljustified + rjustified.slice(this.length);
      }
    
    };

    def.$chars = TMP_1 = function() {
      var __yield;
      __yield = TMP_1._p || nil, TMP_1._p = null;
      
      
      for (var i = 0, length = this.length; i < length; i++) {
        if (__yield.call(null, this.charAt(i)) === __breaker) return __breaker.$v
      }
    
    };

    def.$chomp = function(separator) {
      if (separator == null) {
        separator = __gvars["/"]
      }
      
      var strlen = this.length;
      var seplen = separator.length;
      if (strlen > 0) {
        if (separator === "\n") {
          var last = this.charAt(strlen - 1);
          if (last === "\n" || last == "\r") {
            var result = this.substr(0, strlen - 1);
            if (strlen > 1 && this.charAt(strlen - 2) === "\r") {
              result = this.substr(0, strlen - 2);
            } 
            return result;
          }
        }
        else if (separator === "") {
          return this.replace(/(?:\n|\r\n)+$/, '');
        }
        else if (strlen >= seplen) {
          var tail = this.substr(-1 * seplen);
          if (tail === separator) {
            return this.substr(0, strlen - seplen);
          }
        }
      }
      return this
    
    };

    def.$chop = function() {
      
      return this.substr(0, this.length - 1);
    };

    def.$chr = function() {
      
      return this.charAt(0);
    };

    def.$clone = function() {
      
      return this.slice();
    };

    def.$count = function(str) {
      
      return (this.length - this.replace(new RegExp(str,"g"), '').length) / str.length;
    };

    def.$dup = def.$clone;

    def.$downcase = def.toLowerCase;

    def.$each_char = def.$chars;

    def.$each_line = TMP_2 = function(separator) {
      var $a, $b, $c, $d, __yield;
      __yield = TMP_2._p || nil, TMP_2._p = null;
      if (separator == null) {
        separator = __gvars["/"]
      }
      if (__yield === nil) {
        return (($a = (($b = this).$split || $mm('split')).call($b, separator)).$each || $mm('each')).call($a)
      };
      
      var chomped = (($c = this).$chomp || $mm('chomp')).call($c);
      var trailing_separator = this.length != chomped.length
      var splitted = chomped.split(separator);

      if (!(__yield !== nil)) {
        result = []
        for (var i = 0, length = splitted.length; i < length; i++) {
          if (i < length - 1 || trailing_separator) {
            result.push(splitted[i] + separator);
          }
          else {
            result.push(splitted[i]);
          }
        }

        return (($d = (result)).$each || $mm('each')).call($d);
      }

      for (var i = 0, length = splitted.length; i < length; i++) {
        if (i < length - 1 || trailing_separator) {
          if (__yield.call(null, splitted[i] + separator) === __breaker) return __breaker.$v
        }
        else {
          if (__yield.call(null, splitted[i]) === __breaker) return __breaker.$v
        }
      }
    
    };

    def['$empty?'] = function() {
      
      return this.length === 0;
    };

    def['$end_with?'] = function(suffixes) {
      suffixes = __slice.call(arguments, 0);
      
      for (var i = 0, length = suffixes.length; i < length; i++) {
        var suffix = suffixes[i];

        if (this.length >= suffix.length && this.substr(0 - suffix.length) === suffix) {
          return true;
        }
      }

      return false;
    
    };

    def['$eql?'] = def['$=='];

    def['$equal?'] = function(val) {
      
      return this.toString() === val.toString();
    };

    def.$getbyte = def.charCodeAt;

    def.$gsub = TMP_3 = function(pattern, replace) {
      var $a, $b, $c, block;
      block = TMP_3._p || nil, TMP_3._p = null;
      
      if (($a = (($b = pattern)['$is_a?'] || $mm('is_a?')).call($b, (($c = __scope.String) == null ? __opal.cm("String") : $c))) !== false && $a !== nil) {
        pattern = (new RegExp("" + (($a = (($c = __scope.Regexp) == null ? __opal.cm("Regexp") : $c)).$escape || $mm('escape')).call($a, pattern)))
      };
      
      var pattern = pattern.toString(),
          options = pattern.substr(pattern.lastIndexOf('/') + 1) + 'g',
          regexp  = pattern.substr(1, pattern.lastIndexOf('/') - 1);

      this.$sub._p = block;
      return this.$sub(new RegExp(regexp, options), replace);
    
    };

    def.$hash = def.toString;

    def.$hex = function() {
      var $a;
      return (($a = this).$to_i || $mm('to_i')).call($a, 16);
    };

    def['$include?'] = function(other) {
      
      return this.indexOf(other) !== -1;
    };

    def.$index = function(what, offset) {
      var $a, $b, $c, $d, $e;
      
      if (!what._isString && !what._isRegexp) {
        throw new Error('type mismatch');
      }

      var result = -1;

      if (offset != null) {
        if (offset < 0) {
          offset = this.length - offset;
        }

        if ((($a = what)['$is_a?'] || $mm('is_a?')).call($a, (($b = __scope.Regexp) == null ? __opal.cm("Regexp") : $b))) {
          result = (($b = (($c = what)['$=~'] || $mm('=~')).call($c, this.substr(offset))), $b !== false && $b !== nil ? $b : -1)
        }
        else {
          result = this.substr(offset).indexOf(substr);
        }

        if (result !== -1) {
          result += offset;
        }
      }
      else {
        if ((($b = what)['$is_a?'] || $mm('is_a?')).call($b, (($d = __scope.Regexp) == null ? __opal.cm("Regexp") : $d))) {
          result = (($d = (($e = what)['$=~'] || $mm('=~')).call($e, this)), $d !== false && $d !== nil ? $d : -1)
        }
        else {
          result = this.indexOf(substr);
        }
      }

      return result === -1 ? nil : result;
    
    };

    def.$inspect = function() {
      
      
      var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
          meta      = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
          };

      escapable.lastIndex = 0;

      return escapable.test(this) ? '"' + this.replace(escapable, function(a) {
        var c = meta[a];

        return typeof c === 'string' ? c :
          '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
      }) + '"' : '"' + this + '"';
  
    };

    def.$intern = function() {
      
      return this;
    };

    def.$lines = def.$each_line;

    def.$length = function() {
      
      return this.length;
    };

    def.$ljust = function(width, padstr) {
      if (padstr == null) {
        padstr = " "
      }
      
      if (width <= this.length) {
          return this;
      }
      else {
        var n_chars = Math.floor(width - this.length)
        var n_patterns = Math.floor(n_chars/padstr.length);
        var result = Array(n_patterns + 1).join(padstr);
        var remaining = n_chars - result.length;
        return result + padstr.slice(0, remaining) + this;
      }
    
    };

    def.$lstrip = function() {
      
      return this.replace(/^\s*/, '');
    };

    def.$match = TMP_4 = function(pattern, pos) {
      var $a, $b, $c, $d, $e, $f, block;
      block = TMP_4._p || nil, TMP_4._p = null;
      
      return ($b = (($c = (function() { if (($d = (($e = pattern)['$is_a?'] || $mm('is_a?')).call($e, (($f = __scope.Regexp) == null ? __opal.cm("Regexp") : $f))) !== false && $d !== nil) {
        return pattern
        } else {
        return (new RegExp("" + (($d = (($f = __scope.Regexp) == null ? __opal.cm("Regexp") : $f)).$escape || $mm('escape')).call($d, pattern)))
      }; return nil; }).call(this)).$match || $mm('match')), $b._p = (($a = block).$to_proc || $mm('to_proc')).call($a), $b).call($c, this, pos);
    };

    def.$next = function() {
      
      
      if (this.length === 0) {
        return "";
      }

      var initial = this.substr(0, this.length - 1);
      var last    = String.fromCharCode(this.charCodeAt(this.length - 1) + 1);

      return initial + last;
    
    };

    def.$ord = function() {
      
      return this.charCodeAt(0);
    };

    def.$partition = function(str) {
      
      
      var result = this.split(str);
      var splitter = (result[0].length === this.length ? "" : str);

      return [result[0], splitter, result.slice(1).join(str.toString())];
    
    };

    def.$reverse = function() {
      
      return this.split('').reverse().join('');
    };

    def.$rindex = function(search, offset) {
      var $a, $b, $c;
      
      var search_type = (search == null ? Opal.NilClass : search.$class());
      if (search_type != String && search_type != RegExp) {
        var msg = "type mismatch: " + search_type + " given";
        (($a = this).$raise || $mm('raise')).call($a, (($b = (($c = __scope.TypeError) == null ? __opal.cm("TypeError") : $c)).$new || $mm('new')).call($b, msg));
      }

      if (this.length == 0) {
        return search.length == 0 ? 0 : nil;
      }

      var result = -1;
      if (offset != null) {
        if (offset < 0) {
          offset = this.length + offset;
        }

        if (search_type == String) {
          result = this.lastIndexOf(search, offset);
        }
        else {
          result = this.substr(0, offset + 1).$reverse().search(search);
          if (result !== -1) {
            result = offset - result;
          }
        }
      }
      else {
        if (search_type == String) {
          result = this.lastIndexOf(search);
        }
        else {
          result = this.$reverse().search(search); 
          if (result !== -1) {
            result = this.length - 1 - result;
          }
        }
      }

      return result === -1 ? nil : result;
    
    };

    def.$rjust = function(width, padstr) {
      var $a;if (padstr == null) {
        padstr = " "
      }
      
      if (width <= this.length) {
          return this;
      }
      else {
          var ljustified = (($a = this).$ljust || $mm('ljust')).call($a, width, padstr);
          return this + ljustified.slice(0, -this.length);
      }
    
    };

    def.$rstrip = function() {
      
      return this.replace(/\s*$/, '');
    };

    def.$scan = TMP_5 = function(pattern) {
      var $a, $b, block;
      block = TMP_5._p || nil, TMP_5._p = null;
      
      
      if (pattern.global) {
        // should we clear it afterwards too?
        pattern.lastIndex = 0;
      }
      else {
        // rewrite regular expression to add the global flag to capture pre/post match
        pattern = new RegExp(pattern.source, 'g' + (pattern.multiline ? 'm' : '') + (pattern.ignoreCase ? 'i' : ''));
      }

      var result = [];
      var match;

      while ((match = pattern.exec(this)) != null) {
        var match_data = (($a = (($b = __scope.MatchData) == null ? __opal.cm("MatchData") : $b)).$new || $mm('new')).call($a, pattern, match);
        if (block === nil) {
          match.length == 1 ? result.push(match[0]) : result.push(match.slice(1));
        }
        else {
          match.length == 1 ? block(match[0]) : block.apply(this, match.slice(1));
        }
      }

      return (block !== nil ? this : result);
    
    };

    def.$size = def.$length;

    def.$slice = def['$[]'];

    def.$split = function(pattern, limit) {
      var $a;if (pattern == null) {
        pattern = (($a = __gvars[";"]), $a !== false && $a !== nil ? $a : " ")
      }
      return this.split(pattern, limit);
    };

    def['$start_with?'] = function(prefixes) {
      prefixes = __slice.call(arguments, 0);
      
      for (var i = 0, length = prefixes.length; i < length; i++) {
        if (this.indexOf(prefixes[i]) === 0) {
          return true;
        }
      }

      return false;
    
    };

    def.$strip = function() {
      
      return this.replace(/^\s*/, '').replace(/\s*$/, '');
    };

    def.$sub = TMP_6 = function(pattern, replace) {
      var $a, $b, $c, $d, $e, $f, $g, $h, block;
      block = TMP_6._p || nil, TMP_6._p = null;
      
      
      if (typeof(replace) === 'string') {
        // convert Ruby back reference to JavaScript back reference
        replace = replace.replace(/\\([1-9])/g, '$$$1')
        return this.replace(pattern, replace);
      }
      if (block !== nil) {
        return this.replace(pattern, function() {
          // FIXME: this should be a formal MatchData object with all the goodies
          var match_data = []
          for (var i = 0, len = arguments.length; i < len; i++) {
            var arg = arguments[i];
            if (arg == undefined) {
              match_data.push(nil);
            }
            else {
              match_data.push(arg);
            }
          }

          var str = match_data.pop();
          var offset = match_data.pop();
          var match_len = match_data.length;

          // $1, $2, $3 not being parsed correctly in Ruby code
          //for (var i = 1; i < match_len; i++) {
          //  __gvars[String(i)] = match_data[i];
          //}
          __gvars["&"] = match_data[0];
          __gvars["~"] = match_data;
          return block(match_data[0]);
        });
      }
      else if (replace !== undefined) {
        if ((($a = replace)['$is_a?'] || $mm('is_a?')).call($a, (($b = __scope.Hash) == null ? __opal.cm("Hash") : $b))) {
          return this.replace(pattern, function(str) {
            var value = (($b = replace)['$[]'] || $mm('[]')).call($b, (($c = this).$str || $mm('str')).call($c));

            return (value == null) ? nil : (($d = (($e = this).$value || $mm('value')).call($e)).$to_s || $mm('to_s')).call($d);
          });
        }
        else {
          replace = (($f = (($g = __scope.String) == null ? __opal.cm("String") : $g)).$try_convert || $mm('try_convert')).call($f, replace);

          if (replace == null) {
            (($g = this).$raise || $mm('raise')).call($g, (($h = __scope.TypeError) == null ? __opal.cm("TypeError") : $h), "can't convert " + ((($h = replace).$class || $mm('class')).call($h)) + " into String");
          }

          return this.replace(pattern, replace);
        }
      }
      else {
        // convert Ruby back reference to JavaScript back reference
        replace = replace.toString().replace(/\\([1-9])/g, '$$$1')
        return this.replace(pattern, replace);
      }
    
    };

    def.$succ = def.$next;

    def.$sum = function(n) {
      if (n == null) {
        n = 16
      }
      
      var result = 0;

      for (var i = 0, length = this.length; i < length; i++) {
        result += (this.charCodeAt(i) % ((1 << n) - 1));
      }

      return result;
    
    };

    def.$swapcase = function() {
      var $a, $b;
      
      var str = this.replace(/([a-z]+)|([A-Z]+)/g, function($0,$1,$2) {
        return $1 ? $0.toUpperCase() : $0.toLowerCase();
      });

      if (this._klass === String) {
        return str;
      }

      return (($a = (($b = this).$class || $mm('class')).call($b)).$new || $mm('new')).call($a, str);
    
    };

    def.$to_a = function() {
      
      
      if (this.length === 0) {
        return [];
      }

      return [this];
    
    };

    def.$to_f = function() {
      
      
      var result = parseFloat(this);

      return isNaN(result) ? 0 : result;
    
    };

    def.$to_i = function(base) {
      if (base == null) {
        base = 10
      }
      
      var result = parseInt(this, base);

      if (isNaN(result)) {
        return 0;
      }

      return result;
    
    };

    def.$to_json = def.$inspect;

    def.$to_proc = function() {
      
      
      var name = '$' + this;

      return function(arg) {
        var meth = arg[name];
        return meth ? meth.call(arg) : arg.$method_missing(name);
      };
    
    };

    def.$to_s = def.toString;

    def.$to_str = def.$to_s;

    def.$to_sym = def.$intern;

    def.$tr = function(from, to) {
      
      
      if (from.length == 0 || from === to) {
        return this;
      }

      var subs = {};
      var from_chars = from.split('');
      var from_length = from_chars.length;
      var to_chars = to.split('');
      var to_length = to_chars.length;

      var inverse = false;
      var global_sub = null;
      if (from_chars[0] === '^') {
        inverse = true;
        from_chars.shift();
        global_sub = to_chars[to_length - 1]
        from_length -= 1;
      }

      var from_chars_expanded = [];
      var last_from = null;
      var in_range = false;
      for (var i = 0; i < from_length; i++) {
        var char = from_chars[i];
        if (last_from == null) {
          last_from = char;
          from_chars_expanded.push(char);
        }
        else if (char === '-') {
          if (last_from === '-') {
            from_chars_expanded.push('-');
            from_chars_expanded.push('-');
          }
          else if (i == from_length - 1) {
            from_chars_expanded.push('-');
          }
          else {
            in_range = true;
          }
        }
        else if (in_range) {
          var start = last_from.charCodeAt(0) + 1;
          var end = char.charCodeAt(0);
          for (var c = start; c < end; c++) {
            from_chars_expanded.push(String.fromCharCode(c));
          }
          from_chars_expanded.push(char);
          in_range = null;
          last_from = null;
        }
        else {
          from_chars_expanded.push(char);
        }
      }

      from_chars = from_chars_expanded;
      from_length = from_chars.length;

      if (inverse) {
        for (var i = 0; i < from_length; i++) {
          subs[from_chars[i]] = true;
        }
      }
      else {
        if (to_length > 0) {
          var to_chars_expanded = [];
          var last_to = null;
          var in_range = false;
          for (var i = 0; i < to_length; i++) {
            var char = to_chars[i];
            if (last_from == null) {
              last_from = char;
              to_chars_expanded.push(char);
            }
            else if (char === '-') {
              if (last_to === '-') {
                to_chars_expanded.push('-');
                to_chars_expanded.push('-');
              }
              else if (i == to_length - 1) {
                to_chars_expanded.push('-');
              }
              else {
                in_range = true;
              }
            }
            else if (in_range) {
              var start = last_from.charCodeAt(0) + 1;
              var end = char.charCodeAt(0);
              for (var c = start; c < end; c++) {
                to_chars_expanded.push(String.fromCharCode(c));
              }
              to_chars_expanded.push(char);
              in_range = null;
              last_from = null;
            }
            else {
              to_chars_expanded.push(char);
            }
          }

          to_chars = to_chars_expanded;
          to_length = to_chars.length;
        }

        var length_diff = from_length - to_length;
        if (length_diff > 0) {
          var pad_char = (to_length > 0 ? to_chars[to_length - 1] : '');
          for (var i = 0; i < length_diff; i++) {
            to_chars.push(pad_char);
          }
        }
        
        for (var i = 0; i < from_length; i++) {
          subs[from_chars[i]] = to_chars[i];
        }
      }

      var new_str = ''
      for (var i = 0, length = this.length; i < length; i++) {
        var char = this.charAt(i);
        var sub = subs[char];
        if (inverse) {
          new_str += (sub == null ? global_sub : char);
        }
        else {
          new_str += (sub != null ? sub : char);
        }
      }
      return new_str;
    
    };

    def.$tr_s = function(from, to) {
      
      
      if (from.length == 0) {
        return this;
      }

      var subs = {};
      var from_chars = from.split('');
      var from_length = from_chars.length;
      var to_chars = to.split('');
      var to_length = to_chars.length;

      var inverse = false;
      var global_sub = null;
      if (from_chars[0] === '^') {
        inverse = true;
        from_chars.shift();
        global_sub = to_chars[to_length - 1]
        from_length -= 1;
      }

      var from_chars_expanded = [];
      var last_from = null;
      var in_range = false;
      for (var i = 0; i < from_length; i++) {
        var char = from_chars[i];
        if (last_from == null) {
          last_from = char;
          from_chars_expanded.push(char);
        }
        else if (char === '-') {
          if (last_from === '-') {
            from_chars_expanded.push('-');
            from_chars_expanded.push('-');
          }
          else if (i == from_length - 1) {
            from_chars_expanded.push('-');
          }
          else {
            in_range = true;
          }
        }
        else if (in_range) {
          var start = last_from.charCodeAt(0) + 1;
          var end = char.charCodeAt(0);
          for (var c = start; c < end; c++) {
            from_chars_expanded.push(String.fromCharCode(c));
          }
          from_chars_expanded.push(char);
          in_range = null;
          last_from = null;
        }
        else {
          from_chars_expanded.push(char);
        }
      }

      from_chars = from_chars_expanded;
      from_length = from_chars.length;

      if (inverse) {
        for (var i = 0; i < from_length; i++) {
          subs[from_chars[i]] = true;
        }
      }
      else {
        if (to_length > 0) {
          var to_chars_expanded = [];
          var last_to = null;
          var in_range = false;
          for (var i = 0; i < to_length; i++) {
            var char = to_chars[i];
            if (last_from == null) {
              last_from = char;
              to_chars_expanded.push(char);
            }
            else if (char === '-') {
              if (last_to === '-') {
                to_chars_expanded.push('-');
                to_chars_expanded.push('-');
              }
              else if (i == to_length - 1) {
                to_chars_expanded.push('-');
              }
              else {
                in_range = true;
              }
            }
            else if (in_range) {
              var start = last_from.charCodeAt(0) + 1;
              var end = char.charCodeAt(0);
              for (var c = start; c < end; c++) {
                to_chars_expanded.push(String.fromCharCode(c));
              }
              to_chars_expanded.push(char);
              in_range = null;
              last_from = null;
            }
            else {
              to_chars_expanded.push(char);
            }
          }

          to_chars = to_chars_expanded;
          to_length = to_chars.length;
        }

        var length_diff = from_length - to_length;
        if (length_diff > 0) {
          var pad_char = (to_length > 0 ? to_chars[to_length - 1] : '');
          for (var i = 0; i < length_diff; i++) {
            to_chars.push(pad_char);
          }
        }
        
        for (var i = 0; i < from_length; i++) {
          subs[from_chars[i]] = to_chars[i];
        }
      }
      var new_str = ''
      var last_substitute = null
      for (var i = 0, length = this.length; i < length; i++) {
        var char = this.charAt(i);
        var sub = subs[char]
        if (inverse) {
          if (sub == null) {
            if (last_substitute == null) {
              new_str += global_sub;
              last_substitute = true;
            }
          }
          else {
            new_str += char;
            last_substitute = null;
          }
        }
        else {
          if (sub != null) {
            if (last_substitute == null || last_substitute !== sub) {
              new_str += sub;
              last_substitute = sub;
            }
          }
          else {
            new_str += char;
            last_substitute = null;
          }
        }
      }
      return new_str;
    
    };

    return def.$upcase = def.toUpperCase;
  })(self, null);
  __scope.Symbol = (($a = __scope.String) == null ? __opal.cm("String") : $a);
  return (function(__base, __super){
    function MatchData() {};
    MatchData = __klass(__base, __super, "MatchData", MatchData);

    var def = MatchData.prototype, __scope = MatchData._scope;
    def.post_match = def.pre_match = def.regexp = def.string = nil;

    def.$post_match = function() {
      
      return this.post_match
    }, 
    def.$pre_match = function() {
      
      return this.pre_match
    }, 
    def.$regexp = function() {
      
      return this.regexp
    }, 
    def.$string = function() {
      
      return this.string
    }, nil;

    __opal.defs(MatchData, '$new', function(regexp, match_groups) {
      
      
      var instance = new Opal.MatchData;
      for (var i = 0, len = match_groups.length; i < len; i++) {
        var group = match_groups[i];
        if (group == undefined) {
          instance.push(nil);
        }
        else {
          instance.push(group);
        }
      }
      instance._begin = match_groups.index;
      instance.regexp = regexp;
      instance.string = match_groups.input;
      instance.pre_match = __gvars["`"] = instance.string.substr(0, regexp.lastIndex - instance[0].length);
      instance.post_match = __gvars["'"] = instance.string.substr(regexp.lastIndex);
      return __gvars["~"] = instance;
    
    });

    def.$begin = function(pos) {
      var $a, $b;
      
      if (pos == 0 || pos == 1) {
        return this._begin;
      }
      else {
        (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.ArgumentError) == null ? __opal.cm("ArgumentError") : $b), "MatchData#begin only supports 0th element");
      }
    
    };

    def.$captures = function() {
      
      return this.slice(1);
    };

    def.$inspect = function() {
      
      
      var str = "<#MatchData " + this[0].$inspect()
      for (var i = 1, len = this.length; i < len; i++) {
        str += " " + i + ":" + this[i].$inspect();
      }
      str += ">";
      return str;
    
    };

    def.$to_s = function() {
      
      return this[0];
    };

    def.$values_at = function(indexes) {
      indexes = __slice.call(arguments, 0);
      
      var vals = [];
      var match_length = this.length;
      for (var i = 0, length = indexes.length; i < length; i++) {
        var pos = indexes[i];
        if (pos >= 0) {
          vals.push(this[pos]);
        }
        else {
          pos = match_length + pos;
          if (pos > 0) {
            vals.push(this[pos]);
          }
          else {
            vals.push(nil);
          }
        }
      }

      return vals;
    
    };

    return nil;
  })(self, (($a = __scope.Array) == null ? __opal.cm("Array") : $a));
})(Opal);
(function(__opal) {
  var $a, self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  (function(__base, __super){
    function Numeric() {};
    Numeric = __klass(__base, __super, "Numeric", Numeric);

    var def = Numeric.prototype, __scope = Numeric._scope, $a, $b, TMP_1, TMP_2, TMP_3;

    (($a = Numeric).$include || $mm('include')).call($a, (($b = __scope.Comparable) == null ? __opal.cm("Comparable") : $b));

    def._isNumber = true;

    def['$+'] = function(other) {
      
      return this + other;
    };

    def['$-'] = function(other) {
      
      return this - other;
    };

    def['$*'] = function(other) {
      
      return this * other;
    };

    def['$/'] = function(other) {
      
      return this / other;
    };

    def['$%'] = function(other) {
      
      return this % other;
    };

    def['$&'] = function(other) {
      
      return this & other;
    };

    def['$|'] = function(other) {
      
      return this | other;
    };

    def['$^'] = function(other) {
      
      return this ^ other;
    };

    def['$<'] = function(other) {
      
      return this < other;
    };

    def['$<='] = function(other) {
      
      return this <= other;
    };

    def['$>'] = function(other) {
      
      return this > other;
    };

    def['$>='] = function(other) {
      
      return this >= other;
    };

    def['$<<'] = function(count) {
      
      return this << count;
    };

    def['$>>'] = function(count) {
      
      return this >> count;
    };

    def['$+@'] = function() {
      
      return +this;
    };

    def['$-@'] = function() {
      
      return -this;
    };

    def['$~'] = function() {
      
      return ~this;
    };

    def['$**'] = function(other) {
      
      return Math.pow(this, other);
    };

    def['$=='] = function(other) {
      
      return this == other;
    };

    def['$<=>'] = function(other) {
      
      
      if (typeof(other) !== 'number') {
        return nil;
      }

      return this < other ? -1 : (this > other ? 1 : 0);
    
    };

    def.$abs = function() {
      
      return Math.abs(this);
    };

    def.$as_json = function() {
      
      return this;
    };

    def.$ceil = function() {
      
      return Math.ceil(this);
    };

    def.$chr = function() {
      
      return String.fromCharCode(this);
    };

    def.$downto = TMP_1 = function(finish) {
      var block;
      block = TMP_1._p || nil, TMP_1._p = null;
      
      
      for (var i = this; i >= finish; i--) {
        if (block(i) === __breaker) {
          return __breaker.$v;
        }
      }

      return this;
    
    };

    def['$eql?'] = def['$=='];

    def['$even?'] = function() {
      
      return this % 2 === 0;
    };

    def.$floor = function() {
      
      return Math.floor(this);
    };

    def.$hash = function() {
      
      return this.toString();
    };

    def['$integer?'] = function() {
      
      return this % 1 === 0;
    };

    def.$magnitude = def.$abs;

    def.$modulo = def['$%'];

    def.$next = function() {
      
      return this + 1;
    };

    def['$nonzero?'] = function() {
      
      return this === 0 ? nil : this;
    };

    def['$odd?'] = function() {
      
      return this % 2 !== 0;
    };

    def.$ord = function() {
      
      return this;
    };

    def.$pred = function() {
      
      return this - 1;
    };

    def.$succ = def.$next;

    def.$times = TMP_2 = function() {
      var block;
      block = TMP_2._p || nil, TMP_2._p = null;
      
      
      for (var i = 0; i < this; i++) {
        if (block(i) === __breaker) {
          return __breaker.$v;
        }
      }

      return this;
    
    };

    def.$to_f = function() {
      
      return parseFloat(this);
    };

    def.$to_i = function() {
      
      return parseInt(this);
    };

    def.$to_json = function() {
      
      return this.toString();
    };

    def.$to_s = function(base) {
      if (base == null) {
        base = 10
      }
      return this.toString();
    };

    def.$upto = TMP_3 = function(finish) {
      var $a, block;
      block = TMP_3._p || nil, TMP_3._p = null;
      
      if (block === nil) {
        return (($a = this).$enum_for || $mm('enum_for')).call($a, "upto", finish)
      };
      
      for (var i = this; i <= finish; i++) {
        if (block(i) === __breaker) {
          return __breaker.$v;
        }
      }

      return this;
    
    };

    def['$zero?'] = function() {
      
      return this == 0;
    };

    return nil;
  })(self, null);
  return __scope.Fixnum = (($a = __scope.Numeric) == null ? __opal.cm("Numeric") : $a);
})(Opal);
(function(__opal) {
  var $a, self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  (function(__base, __super){
    function Proc() {};
    Proc = __klass(__base, __super, "Proc", Proc);

    var def = Proc.prototype, __scope = Proc._scope, TMP_1;

    def._isProc = true;

    def.is_lambda = true;

    __opal.defs(Proc, '$new', TMP_1 = function() {
      var block;
      block = TMP_1._p || nil, TMP_1._p = null;
      
      if (block === nil) no_block_given();
      block.is_lambda = false;
      return block;
    });

    def.$call = function(args) {
      args = __slice.call(arguments, 0);
      
      var result = this.apply(null, args);

      if (result === __breaker) {
        return __breaker.$v;
      }

      return result;
    
    };

    def['$[]'] = def.$call;

    def.$to_proc = function() {
      
      return this;
    };

    def['$lambda?'] = function() {
      
      return !!this.is_lambda;
    };

    def.$arity = function() {
      
      return this.length - 1;
    };

    return nil;
  })(self, null);
  return (function(__base, __super){
    function Method() {};
    Method = __klass(__base, __super, "Method", Method);

    var def = Method.prototype, __scope = Method._scope;

    return nil
  })(self, (($a = __scope.Proc) == null ? __opal.cm("Proc") : $a));
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  return (function(__base, __super){
    function Range() {};
    Range = __klass(__base, __super, "Range", Range);

    var def = Range.prototype, __scope = Range._scope, $a, $b, TMP_1;
    def.begin = def.end = nil;

    (($a = Range).$include || $mm('include')).call($a, (($b = __scope.Enumerable) == null ? __opal.cm("Enumerable") : $b));

    
    Range.prototype._isRange = true;

    Opal.range = function(beg, end, exc) {
      var range         = new Range;
          range.begin   = beg;
          range.end     = end;
          range.exclude = exc;

      return range;
    };
  

    def.$begin = function() {
      
      return this.begin
    }, nil;

    def.$end = function() {
      
      return this.end
    }, nil;

    def.$initialize = function(min, max, exclude) {
      if (exclude == null) {
        exclude = false
      }
      this.begin = min;
      this.end = max;
      return this.exclude = exclude;
    };

    def['$=='] = function(other) {
      
      
      if (!other._isRange) {
        return false;
      }

      return this.exclude === other.exclude && this.begin == other.begin && this.end == other.end;
    
    };

    def['$==='] = function(obj) {
      
      return obj >= this.begin && (this.exclude ? obj < this.end : obj <= this.end);
    };

    def['$cover?'] = function(value) {
      var $a, $b, $c, $d, $e, $f;
      return (($a = (($b = (this.begin))['$<='] || $mm('<=')).call($b, value)) ? (($c = value)['$<='] || $mm('<=')).call($c, (function() { if (($d = (($e = this)['$exclude_end?'] || $mm('exclude_end?')).call($e)) !== false && $d !== nil) {
        return ($d = this.end, $f = 1, typeof($d) === 'number' ? $d - $f : $d['$-']($f))
        } else {
        return this.end;
      }; return nil; }).call(this)) : $a);
    };

    def.$each = TMP_1 = function() {
      var current = nil, $a, $b, $c, $d, $e, $f, block;
      block = TMP_1._p || nil, TMP_1._p = null;
      
      current = (($a = this).$min || $mm('min')).call($a);
      while (($c = ($d = (($e = current)['$=='] || $mm('==')).call($e, (($f = this).$max || $mm('max')).call($f)), ($d === nil || $d === false))) !== false && $c !== nil){if (block.call(null, current) === __breaker) return __breaker.$v;
      current = (($c = current).$succ || $mm('succ')).call($c);};
      if (($b = (($d = this)['$exclude_end?'] || $mm('exclude_end?')).call($d)) === false || $b === nil) {
        if (block.call(null, current) === __breaker) return __breaker.$v
      };
      return this;
    };

    def['$eql?'] = function(other) {
      var $a, $b, $c, $d, $e, $f, $g, $h;
      if (($a = (($b = (($c = __scope.Range) == null ? __opal.cm("Range") : $c))['$==='] || $mm('===')).call($b, other)) === false || $a === nil) {
        return false
      };
      return ($a = (($a = (($c = (($d = this)['$exclude_end?'] || $mm('exclude_end?')).call($d))['$=='] || $mm('==')).call($c, (($e = other)['$exclude_end?'] || $mm('exclude_end?')).call($e))) ? (($f = (this.begin))['$eql?'] || $mm('eql?')).call($f, (($g = other).$begin || $mm('begin')).call($g)) : $a), $a !== false && $a !== nil ? (($a = (this.end))['$eql?'] || $mm('eql?')).call($a, (($h = other).$end || $mm('end')).call($h)) : $a);
    };

    def['$exclude_end?'] = function() {
      
      return this.exclude;
    };

    def['$include?'] = function(val) {
      
      return obj >= this.begin && obj <= this.end;
    };

    def.$max = def.$end;

    def.$min = def.$begin;

    def['$member?'] = def['$include?'];

    def.$step = function(n) {
      var $a, $b;if (n == null) {
        n = 1
      }
      return (($a = this).$raise || $mm('raise')).call($a, (($b = __scope.NotImplementedError) == null ? __opal.cm("NotImplementedError") : $b));
    };

    def.$to_s = function() {
      
      return this.begin + (this.exclude ? '...' : '..') + this.end;
    };

    return def.$inspect = def.$to_s;
  })(self, null)
})(Opal);
(function(__opal) {
  var days_of_week = nil, short_days = nil, short_months = nil, long_months = nil, self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass;
  days_of_week = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  short_days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  short_months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  long_months = ["January", "Febuary", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return (function(__base, __super){
    function Time() {};
    Time = __klass(__base, __super, "Time", Time);

    var def = Time.prototype, __scope = Time._scope, $a, $b;

    (($a = Time).$include || $mm('include')).call($a, (($b = __scope.Comparable) == null ? __opal.cm("Comparable") : $b));

    __opal.defs(Time, '$at', function(seconds, frac) {
      if (frac == null) {
        frac = 0
      }
      return new Date(seconds * 1000 + frac);
    });

    __opal.defs(Time, '$new', function(year, month, day, hour, minute, second, millisecond) {
      
      
      switch (arguments.length) {
        case 1:
          return new Date(year);
        case 2:
          return new Date(year, month - 1);
        case 3:
          return new Date(year, month - 1, day);
        case 4:
          return new Date(year, month - 1, day, hour);
        case 5:
          return new Date(year, month - 1, day, hour, minute);
        case 6:
          return new Date(year, month - 1, day, hour, minute, second);
        case 7:
          return new Date(year, month - 1, day, hour, minute, second, millisecond);
        default:
          return new Date();
      }
    
    });

    __opal.defs(Time, '$now', function() {
      
      return new Date();
    });

    __opal.defs(Time, '$parse', function(str) {
      
      return Date.parse(str);
    });

    def['$+'] = function(other) {
      var $a, $b, $c, $d, $e;
      return (($a = (($b = __scope.Time) == null ? __opal.cm("Time") : $b)).$allocate || $mm('allocate')).call($a, ($b = (($d = this).$to_f || $mm('to_f')).call($d), $c = (($e = other).$to_f || $mm('to_f')).call($e), typeof($b) === 'number' ? $b + $c : $b['$+']($c)));
    };

    def['$-'] = function(other) {
      var $a, $b, $c, $d, $e;
      return (($a = (($b = __scope.Time) == null ? __opal.cm("Time") : $b)).$allocate || $mm('allocate')).call($a, ($b = (($d = this).$to_f || $mm('to_f')).call($d), $c = (($e = other).$to_f || $mm('to_f')).call($e), typeof($b) === 'number' ? $b - $c : $b['$-']($c)));
    };

    def['$<=>'] = function(other) {
      var $a, $b, $c;
      return (($a = (($b = this).$to_f || $mm('to_f')).call($b))['$<=>'] || $mm('<=>')).call($a, (($c = other).$to_f || $mm('to_f')).call($c));
    };

    def.$day = def.getDate;

    def['$eql?'] = function(other) {
      var $a, $b, $c;
      return ($a = (($a = other)['$is_a?'] || $mm('is_a?')).call($a, (($b = __scope.Time) == null ? __opal.cm("Time") : $b)), $a !== false && $a !== nil ? (($b = (($c = this)['$<=>'] || $mm('<=>')).call($c, other))['$zero?'] || $mm('zero?')).call($b) : $a);
    };

    def['$friday?'] = function() {
      
      return this.getDay() === 5;
    };

    def.$hour = def.getHours;

    def.$inspect = def.toString;

    def.$mday = def.$day;

    def.$min = def.getMinutes;

    def.$mon = function() {
      
      return this.getMonth() + 1;
    };

    def['$monday?'] = function() {
      
      return this.getDay() === 1;
    };

    def.$month = def.$mon;

    def['$saturday?'] = function() {
      
      return this.getDay() === 6;
    };

    def.$sec = def.getSeconds;

    def.$strftime = function(format) {
      if (format == null) {
        format = ""
      }
      
      var d = this;

      return format.replace(/%(-?.)/g, function(full, m) {
        switch (m) {
          case 'a': return short_days[d.getDay()];
          case 'A': return days_of_week[d.getDay()];
          case 'b': return short_months[d.getMonth()];
          case 'B': return long_months[d.getMonth()];
          case '-d': return d.getDate();
          case 'Y': return d.getFullYear();
          default: return m ;
        }
      });
    
    };

    def['$sunday?'] = function() {
      
      return this.getDay() === 0;
    };

    def['$thursday?'] = function() {
      
      return this.getDay() === 4;
    };

    def.$to_f = function() {
      
      return this.getTime() / 1000;
    };

    def.$to_i = function() {
      
      return parseInt(this.getTime() / 1000);
    };

    def.$to_s = def.$inspect;

    def['$tuesday?'] = function() {
      
      return this.getDay() === 2;
    };

    def.$wday = def.getDay;

    def['$wednesday?'] = function() {
      
      return this.getDay() === 3;
    };

    return def.$year = def.getFullYear;
  })(self, null);
})(Opal);
(function(__opal) {
  var self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, __breaker = __opal.breaker, __slice = __opal.slice, __module = __opal.module, __hash2 = __opal.hash2;
  var json_parse = JSON.parse, __hasOwn = Object.prototype.hasOwnProperty;
  return (function(__base){
    function JSON() {};
    JSON = __module(__base, "JSON", JSON);
    var def = JSON.prototype, __scope = JSON._scope;

    __opal.defs(JSON, '$parse', function(source) {
      
      return to_opal(json_parse(source));
    });

    __opal.defs(JSON, '$from_object', function(js_object) {
      
      return to_opal(js_object);
    });

    
    function to_opal(value) {
      switch (typeof value) {
        case 'string':
          return value;

        case 'number':
          return value;

        case 'boolean':
          return !!value;

        case 'null':
          return nil;

        case 'object':
          if (!value) return nil;

          if (value._isArray) {
            var arr = [];

            for (var i = 0, ii = value.length; i < ii; i++) {
              arr.push(to_opal(value[i]));
            }

            return arr;
          }
          else {
            var hash = __hash2([], {}), v, map = hash.map, keys = hash.keys;

            for (var k in value) {
              if (__hasOwn.call(value, k)) {
                v = to_opal(value[k]);
                keys.push(k);
                map[k] = v;
              }
            }
          }

          return hash;
      }
    };
  
    
  })(self);
})(Opal);
(function(__opal) {
  var $a, $b, $c, $d, $e, $f, self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, def = self._klass.prototype, __breaker = __opal.breaker, __slice = __opal.slice, __gvars = __opal.gvars, __hash2 = __opal.hash2;
  __gvars["&"] = __gvars["~"] = __gvars["`"] = __gvars["'"] = nil;
  __gvars[":"] = [];
  __gvars["/"] = "\n";
  __gvars["global"] = Opal.global;
  __gvars["window"] = __gvars["global"];
  __gvars["document"] = (($a = __gvars["window"]).$document || $mm('document')).call($a);
  __scope.ARGV = [];
  __scope.ARGF = (($b = (($c = __scope.Object) == null ? __opal.cm("Object") : $c)).$new || $mm('new')).call($b);
  __scope.ENV = __hash2([], {});
  __scope.TRUE = true;
  __scope.FALSE = false;
  __scope.NIL = nil;
  __scope.STDERR = __gvars["stderr"] = (($c = (($d = __scope.Object) == null ? __opal.cm("Object") : $d)).$new || $mm('new')).call($c);
  __scope.STDIN = __gvars["stdin"] = (($d = (($e = __scope.Object) == null ? __opal.cm("Object") : $e)).$new || $mm('new')).call($d);
  __scope.STDOUT = __gvars["stdout"] = (($e = (($f = __scope.Object) == null ? __opal.cm("Object") : $f)).$new || $mm('new')).call($e);
  __scope.RUBY_PLATFORM = "opal";
  __scope.RUBY_ENGINE = "opal";
  __scope.RUBY_VERSION = "1.9.3";
  __scope.RUBY_RELEASE_DATE = "2013-05-02";
  self.$to_s = function() {
    
    return "main";
  };
  return self.$include = function(mod) {
    var $a, $b;
    return (($a = (($b = __scope.Object) == null ? __opal.cm("Object") : $b)).$include || $mm('include')).call($a, mod);
  };
})(Opal);
(function(__opal) {
  var image_paths = nil, jewel_imgs = nil, twicon_imgs = nil, board = nil, TMP_3, $a, $b, $c, $d, $e, $f, TMP_16, $g, self = __opal.top, __scope = __opal, nil = __opal.nil, $mm = __opal.mm, def = self._klass.prototype, __breaker = __opal.breaker, __slice = __opal.slice, __klass = __opal.klass, __module = __opal.module, __range = __opal.range, __hash2 = __opal.hash2;
  enchant();
  (function(__base, __super){
    function Class() {};
    Class = __klass(__base, __super, "Class", Class);

    var def = Class.prototype, __scope = Class._scope;

    def.$new = function(args) {
      
      
      TMP_4 = Class.prototype.$new;

      var block;
      block = TMP_4._p || nil, TMP_4._p = null;
      args = __slice.call(arguments, 0);
      
      //var obj = new this;
      var obj = window.Object.create(this.prototype);
      this.apply(obj, args);

      obj._id = Opal.uid();

      obj.$initialize._p = block;
      obj.$initialize.apply(obj, args);
      return obj;
    
    };

    return nil;
  })(self, null);
  (function(__base){
    function Kernel() {};
    Kernel = __module(__base, "Kernel", Kernel);
    var def = Kernel.prototype, __scope = Kernel._scope, TMP_1;

    def.$after = TMP_1 = function(delay) {
      var callback = nil, $a, $b, $c, block;
      block = TMP_1._p || nil, TMP_1._p = null;
      
      callback = function(){ (($a = block).$call || $mm('call')).call($a); };
      return setTimeout(callback, ($b = delay, $c = 1000, typeof($b) === 'number' ? $b * $c : $b['$*']($c)));
    }
        ;__opal.donate(Kernel, ["$after"]);
  })(self);
  (function(__base, __super){
    function Scene() {};
    Scene = __klass(__base, __super, "Scene", Scene);

    var def = Scene.prototype, __scope = Scene._scope;

    def.$add_child = def.addChild;

    def.$remove_child = def.removeChild;

    def['$backgroundColor='] = function(v) {
      
      return this.backgroundColor = v;
    };

    return nil;
  })(self, Scene);
  (function(__base, __super){
    function Sprite() {};
    Sprite = __klass(__base, __super, "Sprite", Sprite);

    var def = Sprite.prototype, __scope = Sprite._scope, TMP_2;
    def.image = def.x = def.y = def.frame = def.age = def.image_name = nil;

    def.$scale = def.scale;

    def.$image = function() {
      
      return this.image
    }, 
    def['$image='] = function(val) {
      
      return this.image = val
    }, 
    def.$x = function() {
      
      return this.x
    }, 
    def['$x='] = function(val) {
      
      return this.x = val
    }, 
    def.$y = function() {
      
      return this.y
    }, 
    def['$y='] = function(val) {
      
      return this.y = val
    }, 
    def.$frame = function() {
      
      return this.frame
    }, 
    def['$frame='] = function(val) {
      
      return this.frame = val
    }, 
    def.$age = function() {
      
      return this.age
    }, 
    def['$age='] = function(val) {
      
      return this.age = val
    }, nil;

    def.$image_name = function() {
      
      return this.image_name
    }, 
    def['$image_name='] = function(val) {
      
      return this.image_name = val
    }, nil;

    def.$add_event_listener = TMP_2 = function(event_name) {
      var block;
      block = TMP_2._p || nil, TMP_2._p = null;
      
      return  this.addEventListener(event_name, block) ;
    };

    return nil;
  })(self, Sprite);
  (function(__base, __super){
    function Game() {};
    Game = __klass(__base, __super, "Game", Game);

    var def = Game.prototype, __scope = Game._scope;
    def.fps = def.onload = def.rootScene = nil;

    def.$fps = function() {
      
      return this.fps
    }, 
    def['$fps='] = function(val) {
      
      return this.fps = val
    }, 
    def.$onload = function() {
      
      return this.onload
    }, 
    def['$onload='] = function(val) {
      
      return this.onload = val
    }, nil;

    def.$root_scene = function() {
      
      return this.rootScene;
    };

    def.$preload = def.preload;

    def.$start = def.start;

    def.$assets = function() {
      var $a, $b;
      return (($a = (($b = __scope.Hash) == null ? __opal.cm("Hash") : $b)).$from_native || $mm('from_native')).call($a, this.assets);
    };

    return nil;
  })(self, Game);
  self.$onload = TMP_3 = function() {
    var block;
    block = TMP_3._p || nil, TMP_3._p = null;
    
    return  window.onload = block ;
  };
  (function(__base, __super){
    function Board() {};
    Board = __klass(__base, __super, "Board", Board);

    var def = Board.prototype, __scope = Board._scope, $a;
    def.jewel_imgs = def.twicon_imgs = def.game = def.board = nil;

    __scope.W = 6;

    __scope.H = 5;

    __scope.SIZE = 43;

    def.$initialize = function(jewel_imgs, twicon_imgs) {
      var $a;
      $a = [jewel_imgs, twicon_imgs], this.jewel_imgs = $a[0], this.twicon_imgs = $a[1];
      this.board = nil;
      return this.game = this.scene = nil;
    };

    def.$init = function(game, scene) {
      var $a, TMP_4, $b, $c;
      $a = [game, scene], this.game = $a[0], this.scene = $a[1];
      return this.board = ($a = (($b = __range(0, (($c = __scope.H) == null ? __opal.cm("H") : $c), true)).$map || $mm('map')), $a._p = (TMP_4 = function(j) {

        var self = TMP_4._s || this, TMP_5, $a, $b, $c;
        if (j == null) j = nil;

        return ($a = (($b = __range(0, (($c = __scope.W) == null ? __opal.cm("W") : $c), true)).$map || $mm('map')), $a._p = (TMP_5 = function(i) {

          var self = TMP_5._s || this, TMP_6, $a, $b, $c;
          if (i == null) i = nil;

          return ($a = (($b = (($c = self).$create_jewel || $mm('create_jewel')).call($c, i, j)).$tap || $mm('tap')), $a._p = (TMP_6 = function(jewel) {

            var self = TMP_6._s || this, $a;
            if (jewel == null) jewel = nil;

            return (($a = scene).$add_child || $mm('add_child')).call($a, jewel)
          }, TMP_6._s = self, TMP_6), $a).call($b)
        }, TMP_5._s = self, TMP_5), $a).call($b)
      }, TMP_4._s = this, TMP_4), $a).call($b);
    };

    (($a = Board).$private || $mm('private')).call($a);

    def.$on_jewel_clicked = function(i, j) {
      var connected = nil, $a, $b, $c, TMP_7, $d, $e, TMP_8, $f;
      connected = (($a = this).$connected_jewels || $mm('connected_jewels')).call($a, i, j);
      if ((($b = (($c = connected).$size || $mm('size')).call($c))['$>='] || $mm('>=')).call($b, 3)) {
        ($d = (($e = connected).$each || $mm('each')), $d._p = (TMP_7 = function(pos) {

          var ii = nil, jj = nil, self = TMP_7._s || this, $a, $b, $c;
          if (self.scene == null) self.scene = nil;
          if (self.board == null) self.board = nil;

          if (pos == null) pos = nil;

          ($a = pos)['$to_a'] ? ($a = $a['$to_a']()) : ($a)._isArray ? $a : ($a = [$a]), ii = ($a[0] == null ? nil : $a[0]), jj = ($a[1] == null ? nil : $a[1]);
          return (($a = self.scene).$remove_child || $mm('remove_child')).call($a, (($b = (($c = self.board)['$[]'] || $mm('[]')).call($c, jj))['$[]'] || $mm('[]')).call($b, ii));
        }, TMP_7._s = this, TMP_7), $d).call($e);
        return ($d = (($f = this).$after || $mm('after')), $d._p = (TMP_8 = function() {

          var self = TMP_8._s || this, TMP_9, $a, $b;
          
          return ($a = (($b = connected).$each || $mm('each')), $a._p = (TMP_9 = function(pos) {

            var ii = nil, jj = nil, type = nil, jewel = nil, self = TMP_9._s || this, $a, $b, $c, $d, $e, $f, $g, $h;
            if (self.board == null) self.board = nil;
            if (self.scene == null) self.scene = nil;

            if (pos == null) pos = nil;

            ($a = pos)['$to_a'] ? ($a = $a['$to_a']()) : ($a)._isArray ? $a : ($a = [$a]), ii = ($a[0] == null ? nil : $a[0]), jj = ($a[1] == null ? nil : $a[1]);
            type = (function() { if (($a = (($b = (($c = (($d = connected).$size || $mm('size')).call($d))['$>='] || $mm('>=')).call($c, 5)) ? (($e = (($f = self).$rand || $mm('rand')).call($f, 100))['$<'] || $mm('<')).call($e, 40) : $b)) !== false && $a !== nil) {
              return "twicon"
              } else {
              return "jewel"
            }; return nil; }).call(self);
            jewel = (($a = self).$create_jewel || $mm('create_jewel')).call($a, ii, jj, type);
            (($b = (($g = self.board)['$[]'] || $mm('[]')).call($g, jj))['$[]='] || $mm('[]=')).call($b, ii, jewel);
            return (($h = self.scene).$add_child || $mm('add_child')).call($h, jewel);
          }, TMP_9._s = self, TMP_9), $a).call($b)
        }, TMP_8._s = this, TMP_8), $d).call($f, 0.5);
        } else {
        return nil
      };
    };

    def.$create_jewel = function(i, j, type) {
      var jewel = nil, image_name = nil, $case = nil, $a, $b, $c, $d, $e, $f, $g, $h, $i, $j, $k, $l, $m, $n, $o, $p, $q, $r, $s, TMP_10;if (type == null) {
        type = "jewel"
      }
      jewel = (($a = (($b = __scope.Sprite) == null ? __opal.cm("Sprite") : $b)).$new || $mm('new')).call($a, (($b = __scope.SIZE) == null ? __opal.cm("SIZE") : $b), (($b = __scope.SIZE) == null ? __opal.cm("SIZE") : $b));
      image_name = (function() { $case = type;if ((($d = "jewel")['$==='] || $mm('===')).call($d, $case)) {
      return (($b = (($c = this.jewel_imgs).$shuffle || $mm('shuffle')).call($c)).$first || $mm('first')).call($b)
      }
      else if ((($g = "twicon")['$==='] || $mm('===')).call($g, $case)) {
      return (($e = (($f = this.twicon_imgs).$shuffle || $mm('shuffle')).call($f)).$first || $mm('first')).call($e)
      }
      else {return (($h = this).$raise || $mm('raise')).call($h)} }).call(this);
      (($i = jewel)['$image_name='] || $mm('image_name=')).call($i, image_name);
      (($j = jewel)['$image='] || $mm('image=')).call($j, (($k = (($l = this.game).$assets || $mm('assets')).call($l))['$[]'] || $mm('[]')).call($k, image_name));
      (($m = jewel)['$x='] || $mm('x=')).call($m, ($n = ($p = i, $q = (($r = __scope.SIZE) == null ? __opal.cm("SIZE") : $r), typeof($p) === 'number' ? $p * $q : $p['$*']($q)), $o = 33, typeof($n) === 'number' ? $n + $o : $n['$+']($o)));
      (($n = jewel)['$y='] || $mm('y=')).call($n, ($o = ($q = j, $r = (($s = __scope.SIZE) == null ? __opal.cm("SIZE") : $s), typeof($q) === 'number' ? $q * $r : $q['$*']($r)), $p = 100, typeof($o) === 'number' ? $o + $p : $o['$+']($p)));
      ($o = (($p = jewel).$add_event_listener || $mm('add_event_listener')), $o._p = (TMP_10 = function() {

        var self = TMP_10._s || this, $a, $b;
        
        return (($a = self).$on_jewel_clicked || $mm('on_jewel_clicked')).apply($a, [].concat((($b = self).$find_pos || $mm('find_pos')).call($b, jewel)))
      }, TMP_10._s = this, TMP_10), $o).call($p, "touchend");
      return jewel;
    };

    __scope.NEIGHBORS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

    def.$connected_jewels = function(i, j) {
      var start_image_name = nil, visited = nil, ret = nil, q = nil, $a, $b, $c, $d, $e, $f, TMP_11, $g, $h, $i, $j, $k, $l, TMP_13, $m, $n, $o;
      if (($a = ($b = (($b = __range(0, (($c = __scope.W) == null ? __opal.cm("W") : $c), true))['$==='] || $mm('===')).call($b, i), $b !== false && $b !== nil ? (($c = __range(0, (($d = __scope.H) == null ? __opal.cm("H") : $d), true))['$==='] || $mm('===')).call($c, j) : $b)) === false || $a === nil) {
        (($a = this).$raise || $mm('raise')).call($a, "[bug] connected_jewels: out of map (" + (i) + ", " + (j) + ")")
      };
      start_image_name = (($d = (($e = (($f = this.board)['$[]'] || $mm('[]')).call($f, j))['$[]'] || $mm('[]')).call($e, i)).$image_name || $mm('image_name')).call($d);
      visited = ($g = (($h = (($i = __scope.Array) == null ? __opal.cm("Array") : $i)).$new || $mm('new')), $g._p = (TMP_11 = function() {

        var self = TMP_11._s || this, TMP_12, $a, $b, $c;
        
        return ($a = (($b = (($c = __scope.Array) == null ? __opal.cm("Array") : $c)).$new || $mm('new')), $a._p = (TMP_12 = function() {

          var self = TMP_12._s || this;
          
          return false
        }, TMP_12._s = self, TMP_12), $a).call($b, (($c = __scope.W) == null ? __opal.cm("W") : $c))
      }, TMP_11._s = this, TMP_11), $g).call($h, (($i = __scope.H) == null ? __opal.cm("H") : $i));
      ret = [[i, j]];
      q = [[i, j]];
      while (!(($i = (($j = q)['$empty?'] || $mm('empty?')).call($j)) !== false && $i !== nil)) {($i = (($k = q).$pop || $mm('pop')).call($k))['$to_a'] ? ($i = $i['$to_a']()) : ($i)._isArray ? $i : ($i = [$i]), i = ($i[0] == null ? nil : $i[0]), j = ($i[1] == null ? nil : $i[1]);
      (($i = (($l = visited)['$[]'] || $mm('[]')).call($l, j))['$[]='] || $mm('[]=')).call($i, i, true);
      ($m = (($n = (($o = __scope.NEIGHBORS) == null ? __opal.cm("NEIGHBORS") : $o)).$each || $mm('each')), $m._p = (TMP_13 = function(dij) {

        var di = nil, dj = nil, ni = nil, nj = nil, self = TMP_13._s || this, $a, $b, $c, $d, $e, $f, $g, $h, $i, $j;
        if (self.board == null) self.board = nil;

        if (dij == null) dij = nil;

        ($a = dij)['$to_a'] ? ($a = $a['$to_a']()) : ($a)._isArray ? $a : ($a = [$a]), di = ($a[0] == null ? nil : $a[0]), dj = ($a[1] == null ? nil : $a[1]);
        $a = [($b = i, $c = di, typeof($b) === 'number' ? $b + $c : $b['$+']($c)), ($b = j, $c = dj, typeof($b) === 'number' ? $b + $c : $b['$+']($c))], ni = $a[0], nj = $a[1];
        if (($a = ($b = (($b = __range(0, (($c = __scope.W) == null ? __opal.cm("W") : $c), true))['$==='] || $mm('===')).call($b, ni), $b !== false && $b !== nil ? (($c = __range(0, (($d = __scope.H) == null ? __opal.cm("H") : $d), true))['$==='] || $mm('===')).call($c, nj) : $b)) === false || $a === nil) {
          return nil;
        };
        if (($a = (($d = (($e = visited)['$[]'] || $mm('[]')).call($e, nj))['$[]'] || $mm('[]')).call($d, ni)) !== false && $a !== nil) {
          return nil;
        };
        if ((($a = (($f = (($g = (($h = self.board)['$[]'] || $mm('[]')).call($h, nj))['$[]'] || $mm('[]')).call($g, ni)).$image_name || $mm('image_name')).call($f))['$=='] || $mm('==')).call($a, start_image_name)) {
          (($i = ret).$push || $mm('push')).call($i, [ni, nj]);
          return (($j = q).$push || $mm('push')).call($j, [ni, nj]);
          } else {
          return nil
        };
      }, TMP_13._s = this, TMP_13), $m).call($n);};
      return ret;
    };

    def.$find_pos = function(jewel) {
      var ret = nil, TMP_14, $a, $b, $c;
      ret = nil;
      ($a = (($b = (($c = __scope.H) == null ? __opal.cm("H") : $c)).$times || $mm('times')), $a._p = (TMP_14 = function(j) {

        var self = TMP_14._s || this, TMP_15, $a, $b, $c;
        if (j == null) j = nil;

        return ($a = (($b = (($c = __scope.W) == null ? __opal.cm("W") : $c)).$times || $mm('times')), $a._p = (TMP_15 = function(i) {

          var self = TMP_15._s || this, $a, $b, $c, $d;
          if (self.board == null) self.board = nil;

          if (i == null) i = nil;

          if (($a = (($b = (($c = (($d = self.board)['$[]'] || $mm('[]')).call($d, j))['$[]'] || $mm('[]')).call($c, i))['$equal?'] || $mm('equal?')).call($b, jewel)) !== false && $a !== nil) {
            return ret = [i, j]
            } else {
            return nil
          }
        }, TMP_15._s = self, TMP_15), $a).call($b)
      }, TMP_14._s = this, TMP_14), $a).call($b);
      if (($a = (($c = ret)['$nil?'] || $mm('nil?')).call($c)) !== false && $a !== nil) {
        (($a = this).$raise || $mm('raise')).call($a, "[bug] find_pos: jewel not found")
      };
      return ret;
    };

    return nil;
  })(self, null);
  image_paths = __hash2(["chara1.png", "jewel1b-5.png", "jewel1g-5.png", "jewel1l-5.png", "jewel1p-5.png", "twicons/alzavorine.png", "twicons/arika.jpg", "twicons/arton.jpg", "twicons/ayumin.jpeg", "twicons/david_a_black.jpg", "twicons/drbrain.jpeg", "twicons/eban.png", "twicons/gotoken.png", "twicons/gotoyuzo.png", "twicons/JEG2.png", "twicons/jimweirich.jpeg", "twicons/k_tsj.jpg", "twicons/knu.jpeg", "twicons/ko1.jpg", "twicons/kosaki55tea.jpeg", "twicons/ktou.jpeg", "twicons/luislavena.jpg", "twicons/m_suketa.png", "twicons/malafortune.jpg", "twicons/mametter.png", "twicons/mrkn.jpeg", "twicons/n0kada.jpg", "twicons/nahi.jpg", "twicons/nalsh.png", "twicons/nari3.png", "twicons/ntalbott.png", "twicons/pragdave.jpg", "twicons/shugomaeda.jpg", "twicons/shyouhei.jpeg", "twicons/sora_h.png", "twicons/takano32.png", "twicons/takaokouji.png", "twicons/tanaka_akr.png", "twicons/taru.jpg", "twicons/tenderlove.jpeg", "twicons/unak.jpg", "twicons/wannabe53.png", "twicons/why.png", "twicons/wyhaines.jpg", "twicons/xibbar.jpg", "twicons/yugui.jpg", "twicons/yukihiro_matz.jpg", "twicons/znz.jpeg"], {"chara1.png": "images/chara1.png", "jewel1b-5.png": "images/jewel1b-5.png", "jewel1g-5.png": "images/jewel1g-5.png", "jewel1l-5.png": "images/jewel1l-5.png", "jewel1p-5.png": "images/jewel1p-5.png", "twicons/alzavorine.png": "images/twicons/alzavorine.png", "twicons/arika.jpg": "images/twicons/arika.jpg", "twicons/arton.jpg": "images/twicons/arton.jpg", "twicons/ayumin.jpeg": "images/twicons/ayumin.jpeg", "twicons/david_a_black.jpg": "images/twicons/david_a_black.jpg", "twicons/drbrain.jpeg": "images/twicons/drbrain.jpeg", "twicons/eban.png": "images/twicons/eban.png", "twicons/gotoken.png": "images/twicons/gotoken.png", "twicons/gotoyuzo.png": "images/twicons/gotoyuzo.png", "twicons/JEG2.png": "images/twicons/JEG2.png", "twicons/jimweirich.jpeg": "images/twicons/jimweirich.jpeg", "twicons/k_tsj.jpg": "images/twicons/k_tsj.jpg", "twicons/knu.jpeg": "images/twicons/knu.jpeg", "twicons/ko1.jpg": "images/twicons/ko1.jpg", "twicons/kosaki55tea.jpeg": "images/twicons/kosaki55tea.jpeg", "twicons/ktou.jpeg": "images/twicons/ktou.jpeg", "twicons/luislavena.jpg": "images/twicons/luislavena.jpg", "twicons/m_suketa.png": "images/twicons/m_suketa.png", "twicons/malafortune.jpg": "images/twicons/malafortune.jpg", "twicons/mametter.png": "images/twicons/mametter.png", "twicons/mrkn.jpeg": "images/twicons/mrkn.jpeg", "twicons/n0kada.jpg": "images/twicons/n0kada.jpg", "twicons/nahi.jpg": "images/twicons/nahi.jpg", "twicons/nalsh.png": "images/twicons/nalsh.png", "twicons/nari3.png": "images/twicons/nari3.png", "twicons/ntalbott.png": "images/twicons/ntalbott.png", "twicons/pragdave.jpg": "images/twicons/pragdave.jpg", "twicons/shugomaeda.jpg": "images/twicons/shugomaeda.jpg", "twicons/shyouhei.jpeg": "images/twicons/shyouhei.jpeg", "twicons/sora_h.png": "images/twicons/sora_h.png", "twicons/takano32.png": "images/twicons/takano32.png", "twicons/takaokouji.png": "images/twicons/takaokouji.png", "twicons/tanaka_akr.png": "images/twicons/tanaka_akr.png", "twicons/taru.jpg": "images/twicons/taru.jpg", "twicons/tenderlove.jpeg": "images/twicons/tenderlove.jpeg", "twicons/unak.jpg": "images/twicons/unak.jpg", "twicons/wannabe53.png": "images/twicons/wannabe53.png", "twicons/why.png": "images/twicons/why.png", "twicons/wyhaines.jpg": "images/twicons/wyhaines.jpg", "twicons/xibbar.jpg": "images/twicons/xibbar.jpg", "twicons/yugui.jpg": "images/twicons/yugui.jpg", "twicons/yukihiro_matz.jpg": "images/twicons/yukihiro_matz.jpg", "twicons/znz.jpeg": "images/twicons/znz.jpeg"});
  jewel_imgs = (($a = (($b = image_paths).$values || $mm('values')).call($b)).$grep || $mm('grep')).call($a, /\/jewel.*/);
  twicon_imgs = (($c = (($d = image_paths).$values || $mm('values')).call($d)).$grep || $mm('grep')).call($c, /\/twicons.*/);
  board = (($e = (($f = __scope.Board) == null ? __opal.cm("Board") : $f)).$new || $mm('new')).call($e, jewel_imgs, twicon_imgs);
  return ($f = (($g = self).$onload || $mm('onload')), $f._p = (TMP_16 = function() {

    var game = nil, scene = nil, self = TMP_16._s || this, $a, $b, $c, $d, $e, $f, TMP_17, $g, $h;
    
    game = (($a = (($b = __scope.Game) == null ? __opal.cm("Game") : $b)).$new || $mm('new')).call($a, 320, 320);
    window.game = game;
    (($b = game)['$fps='] || $mm('fps=')).call($b, 15);
    (($c = game).$preload || $mm('preload')).apply($c, [].concat((($d = image_paths).$values || $mm('values')).call($d)));
    scene = (($e = game).$root_scene || $mm('root_scene')).call($e);
    (($f = game)['$onload='] || $mm('onload=')).call($f, ($g = (($h = self).$proc || $mm('proc')), $g._p = (TMP_17 = function() {

      var bear = nil, self = TMP_17._s || this, $a, $b, $c, $d, $e, $f, $g, $h, $i, $j, $k, TMP_18, $l, $m;
      
      (($a = scene)['$backgroundColor='] || $mm('backgroundColor=')).call($a, "black");
      bear = (($b = (($c = __scope.Sprite) == null ? __opal.cm("Sprite") : $c)).$new || $mm('new')).call($b, 32, 32);
      (($c = bear)['$image='] || $mm('image=')).call($c, (($d = (($e = game).$assets || $mm('assets')).call($e))['$[]'] || $mm('[]')).call($d, (($f = image_paths)['$[]'] || $mm('[]')).call($f, "chara1.png")));
      (($g = bear).$scale || $mm('scale')).call($g, 1.5);
      (($h = bear)['$x='] || $mm('x=')).call($h, 0);
      (($i = bear)['$y='] || $mm('y=')).call($i, 40);
      (($j = bear)['$frame='] || $mm('frame=')).call($j, 5);
      (($k = scene).$add_child || $mm('add_child')).call($k, bear);
      ($l = (($m = bear).$add_event_listener || $mm('add_event_listener')), $l._p = (TMP_18 = function() {

        var self = TMP_18._s || this, $a, $b, $c, $d, $e, $f, $g, $h;
        
        (($a = bear)['$x='] || $mm('x=')).call($a, (($b = ($c = (($e = bear).$x || $mm('x')).call($e), $d = 1, typeof($c) === 'number' ? $c + $d : $c['$+']($d)))['$%'] || $mm('%')).call($b, 320));
        return (($c = bear)['$frame='] || $mm('frame=')).call($c, ($d = (($g = (($h = bear).$age || $mm('age')).call($h))['$%'] || $mm('%')).call($g, 2), $f = 6, typeof($d) === 'number' ? $d + $f : $d['$+']($f)));
      }, TMP_18._s = self, TMP_18), $l).call($m, "enterframe");
      return (($l = board).$init || $mm('init')).call($l, game, scene);
    }, TMP_17._s = self, TMP_17), $g).call($h));
    return (($g = game).$start || $mm('start')).call($g);
  }, TMP_16._s = self, TMP_16), $f).call($g);
})(Opal);
