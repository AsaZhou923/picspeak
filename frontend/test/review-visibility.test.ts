import test from 'node:test';
import assert from 'node:assert/strict';
import { getGalleryState } from '../src/features/reviews/reviewVisibility.ts';

test('a gallery submission is not proof of public display', () => {
  assert.equal(getGalleryState({}), 'not_added');
  assert.equal(getGalleryState({ gallery_visible: false, gallery_audit_status: 'approved' }), 'not_added');
  assert.equal(getGalleryState({ gallery_visible: true, gallery_audit_status: 'approved' }), 'public');
  assert.equal(getGalleryState({ gallery_visible: true, gallery_audit_status: 'rejected' }), 'rejected');
  assert.equal(getGalleryState({ gallery_visible: true, gallery_audit_status: 'none' }), 'pending');
  assert.equal(getGalleryState({ gallery_visible: true }), 'pending');
});
