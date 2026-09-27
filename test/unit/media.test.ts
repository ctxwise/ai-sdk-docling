import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mediaTypeOf } from '../../src/index.ts';

test('mediaTypeOf: office, images, text and unknown extensions', () => {
  assert.equal(mediaTypeOf('Report.DOCX'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(mediaTypeOf('scan.pdf'), 'application/pdf');
  assert.equal(mediaTypeOf('photo.jpeg'), 'image/jpeg');
  assert.equal(mediaTypeOf('photo.jpg'), 'image/jpeg');
  assert.equal(mediaTypeOf('notes.md'), 'text/markdown');
  assert.equal(mediaTypeOf('dir/data.v2.json'), 'application/json');
  assert.equal(mediaTypeOf('clip.mp4'), 'application/octet-stream');
  assert.equal(mediaTypeOf('README'), 'application/octet-stream');
});
