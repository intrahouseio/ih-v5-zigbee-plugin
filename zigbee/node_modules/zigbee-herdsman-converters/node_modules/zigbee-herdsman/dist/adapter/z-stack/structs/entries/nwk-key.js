"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nwkKey = void 0;
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
const struct_1 = require("../struct");
/**
 * Creates a network key struct.
 *
 * @param data Data to initialize structure with.
 */
const nwkKey = (data) => struct_1.Struct.new()
    .member("uint8array", "key", 16)
    .build(data);
exports.nwkKey = nwkKey;
//# sourceMappingURL=nwk-key.js.map