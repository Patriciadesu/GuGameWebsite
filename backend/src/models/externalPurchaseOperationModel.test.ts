import assert from 'node:assert/strict';
import test from 'node:test';
import ExternalPurchaseOperation from './ExternalPurchaseOperation';

test('external purchase operation IDs and purchase details are immutable', () => {
  const paths = ExternalPurchaseOperation.schema.paths;
  assert.equal(paths.operationId.options.immutable, true);
  assert.equal(paths.userId.options.immutable, true);
  assert.equal(paths.shopItemId.options.immutable, true);
  assert.equal(paths.externalItemId.options.immutable, true);
  assert.equal(paths.price.options.immutable, true);
});

test('external purchase operation IDs have a unique index', () => {
  const operationIndex = ExternalPurchaseOperation.schema.indexes().find(
    ([fields]) => fields.operationId === 1
  );
  assert.equal(operationIndex?.[1].unique, true);
});
