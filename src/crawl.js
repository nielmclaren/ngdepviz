#!/usr/bin/env node

var path = require("path"),
  vm = require("vm"),
  fs = require("fs"),
  angular = require("angular"),
  nodes = [],
  edges = [],
  modules = {},
  injectables = {};

function addModule(name) {
  nodes.push({name: name, type: 'module'});
  return modules[name] = nodes.length;
}

function addInjectable(name) {
  nodes.push({name: name, type: 'injectable'});
  return injectables[name] = nodes.length;
}

// Mess with angular.
angular.module = (function() {
  var module = angular.module;
  return function(moduleName, deps) {
    var moduleIndex = addModule(moduleName);
    deps.forEach(function(d) {
      edges.push({
        source: moduleIndex,
        target: modules[d] || addModule(d),
        type: 'dependency'
      });
    });
    return module.apply(angular, arguments);
  };
})();

var sandbox = {
  angular: angular,
  console: console,
  window: {
    angular: angular
  }
};

var p = path.join(__dirname, "../data/ng-boilerplate-0.3.1.js");
var data = fs.readFileSync(p);
var script = vm.createScript(data, p);
script.runInNewContext(sandbox);

console.log(edges.map(function(d) { return {source: nodes[d.source].name, target: nodes[d.target].name}; }));

