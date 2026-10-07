import assert from 'node:assert/strict';
import xcode from 'xcode';

const project = xcode.project('synthetic.pbxproj');
project.hash = { project: { objects: {} } };
assert.match(project.generateUuid(), /^[0-9A-F]{24}$/);
console.log('Dependency compatibility checks passed: native project IDs');
