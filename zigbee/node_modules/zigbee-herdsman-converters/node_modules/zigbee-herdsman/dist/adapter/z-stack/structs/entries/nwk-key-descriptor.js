"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nwkKeyDescriptor = void 0;
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
const struct_1 = require("../struct");
/**
 * Creates a Security Service Provider (SSP) Network Descriptor struct.
 *
 * *Definition from Z-Stack 3.0.2 `ssp.h`*
 *
 * @param data Data to initialize structure with.
 */
const nwkKeyDescriptor = (data) => struct_1.Struct.new()
    .member("uint8", "keySeqNum")
    .member("uint8array", "key", 16)
    .build(data);
exports.nwkKeyDescriptor = nwkKeyDescriptor;
//# sourceMappingURL=nwk-key-descriptor.js.map