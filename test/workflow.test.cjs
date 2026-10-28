const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseQuickArgs } = require('../app/workflow.cjs');
test('quick launch accepts only supported image paths and fixed budgets', () => {
  assert.deepEqual(parseQuickArgs(['app','--quick','500000','--image','C:\\사진 폴더\\휴가.png']), {targetBytes:500000,file:'C:\\사진 폴더\\휴가.png'});
  assert.equal(parseQuickArgs(['--quick','900000','--image','C:\\a.jpg']), null);
  assert.equal(parseQuickArgs(['--quick','1000000','--image','relative.png']), null);
  assert.equal(parseQuickArgs(['--quick','1000000','--image','C:\\a.exe']), null);
  assert.equal(parseQuickArgs(['--quick','1000000','--image']), null);
  assert.equal(parseQuickArgs(['--self-test','--report','C:\\a.png']), null);
});
