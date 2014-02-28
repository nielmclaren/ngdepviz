#!/usr/bin/env node

var path = require("path"),
  vm = require("vm"),
  fs = require("fs"),
  angular = require("angular"),
  sandbox = {
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

