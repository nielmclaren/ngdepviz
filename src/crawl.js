#!/usr/bin/env node

var path = require("path"),
  vm = require("vm"),
  fs = require("fs"),
  angular = require("angular"),
  nodes = [],
  edges = [],
  modules = {},
  injectables = {};

/// BEGIN stolen from Angular.

var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
var FN_ARG_SPLIT = /,/;
var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

function annotate(fn) {
  var $inject,
      fnText,
      argDecl,
      last;

  if (typeof fn == 'function') {
    if (!($inject = fn.$inject)) {
      $inject = [];
      fnText = fn.toString().replace(STRIP_COMMENTS, '');
      argDecl = fnText.match(FN_ARGS);
      forEach(argDecl[1].split(FN_ARG_SPLIT), function(arg){
        arg.replace(FN_ARG, function(all, underscore, name){
          $inject.push(name);
        });
      });
      fn.$inject = $inject;
    }
  } else if (isArray(fn)) {
    last = fn.length - 1;
    assertArgFn(fn[last], 'fn');
    $inject = fn.slice(0, last);
  } else {
    assertArgFn(fn, 'fn', true);
  }
  return $inject;
}

function isArray(value) {
  return toString.apply(value) == '[object Array]';
}

function assertArg(arg, name, reason) {
  if (!arg) {
    throw new Error("Argument '" + (name || '?') + "' is " + (reason || "required"));
  }
  return arg;
}

function assertArgFn(arg, name, acceptArrayAnnotation) {
  if (acceptArrayAnnotation && isArray(arg)) {
      arg = arg[arg.length - 1];
  }

  assertArg(isFunction(arg), name, 'not a function, got ' +
      (arg && typeof arg == 'object' ? arg.constructor.name || 'Object' : typeof arg));
  return arg;
}

function isFunction(value){return typeof value == 'function';}

function addModule(name) {
  nodes.push({name: name, type: 'module'});
  return modules[name] = nodes.length - 1;
}

function addInjectable(name) {
  nodes.push({name: name});
  return injectables[name] = nodes.length - 1;
}

function forEach(obj, iterator, context) {
  var key;
  if (obj) {
    if (isFunction(obj)){
      for (key in obj) {
        if (key != 'prototype' && key != 'length' && key != 'name' && obj.hasOwnProperty(key)) {
          iterator.call(context, obj[key], key);
        }
      }
    } else if (obj.forEach && obj.forEach !== forEach) {
      obj.forEach(iterator, context);
    } else if (isArrayLike(obj)) {
      for (key = 0; key < obj.length; key++)
        iterator.call(context, obj[key], key);
    } else {
      for (key in obj) {
        if (obj.hasOwnProperty(key)) {
          iterator.call(context, obj[key], key);
        }
      }
    }
  }
  return obj;
}

/// END stolen from Angular.

// Mess with angular.
angular.module = (function() {
  var moduleFn = angular.module;
  return function(moduleName, deps) {
    if (deps) {
      var moduleIndex = addModule(moduleName);
      deps.forEach(function(d) {
        edges.push({
          source: moduleIndex,
          target: modules[d] || addModule(d),
          type: 'dependency'
        });
      });
    }

    // Mess with the module object it returns, too!
    var moduleObj = moduleFn.apply(angular, arguments);

    moduleObj.controller = (function() {
      var controllerFn = moduleObj.controller;
      return function(name, fn) {
        var injectableIndex = injectables[name] || addInjectable(name);
        nodes[injectableIndex].type = "controller";

        var injections = annotate(fn);
        injections.forEach(function(d) {
          edges.push({
            source: injectableIndex,
            target: injectables[d] || addInjectable(d),
            type: 'injection'
          });
        });

        return controllerFn.apply(moduleObj, arguments);
      };
    })();

    moduleObj.factory = (function() {
      var factoryFn = moduleObj.factory;
      return function(name, fn) {
        var injectableIndex = injectables[name] || addInjectable(name);
        nodes[injectableIndex].type = "factory";

        var injections = annotate(fn);
        injections.forEach(function(d) {
          edges.push({
            source: injectableIndex,
            target: injectables[d] || addInjectable(d),
            type: 'injection'
          });
        });

        return factoryFn.apply(moduleObj, arguments);
      };
    })();

    moduleObj.service = (function() {
      var serviceFn = moduleObj.service;
      return function(name, fn) {
        var injectableIndex = injectables[name] || addInjectable(name);
        nodes[injectableIndex].type = "service";

        var injections = annotate(fn);
        injections.forEach(function(d) {
          edges.push({
            source: injectableIndex,
            target: injectables[d] || addInjectable(d),
            type: 'injection'
          });
        });

        return serviceFn.apply(moduleObj, arguments);
      };
    })();

    return moduleObj;
  };
})();

var sandbox = {
  angular: angular,
  console: console,
  window: {
    angular: angular
  }
};

var p = path.join(__dirname, "../data/ax-shared-0.0.1.min.js");
var data = fs.readFileSync(p);
var script = vm.createScript(data, p);
script.runInNewContext(sandbox);

function typeToGroup(d) {
  switch (d) {
    case 'controller': return 0;
    case 'factory': return 1;
    case 'service': return 2;
    default: return d;
  }
}

fs.writeFileSync(
  path.join(__dirname, "../data/ax-shared.json"),
  'var miserables = ' + JSON.stringify({
    nodes: nodes.map(function(d) {
      return {
        nodeName: d.name + " (" + d.type + ")",
        group: typeToGroup(d.type)
      };
    }),
    links: edges
  }, null, '  '));

