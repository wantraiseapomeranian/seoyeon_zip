import test from 'node:test';
import assert from 'node:assert/strict';
test('intentional release gate probe',()=>assert.fail('Intentional failure: this branch must never merge'));
