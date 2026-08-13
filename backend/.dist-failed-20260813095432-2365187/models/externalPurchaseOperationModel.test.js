"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const ExternalPurchaseOperation_1 = __importDefault(require("./ExternalPurchaseOperation"));
(0, node_test_1.default)('external purchase operation IDs and purchase details are immutable', () => {
    const paths = ExternalPurchaseOperation_1.default.schema.paths;
    strict_1.default.equal(paths.operationId.options.immutable, true);
    strict_1.default.equal(paths.userId.options.immutable, true);
    strict_1.default.equal(paths.shopItemId.options.immutable, true);
    strict_1.default.equal(paths.externalItemId.options.immutable, true);
    strict_1.default.equal(paths.price.options.immutable, true);
});
(0, node_test_1.default)('external purchase operation IDs have a unique index', () => {
    const operationIndex = ExternalPurchaseOperation_1.default.schema.indexes().find(([fields]) => fields.operationId === 1);
    strict_1.default.equal(operationIndex?.[1].unique, true);
});
