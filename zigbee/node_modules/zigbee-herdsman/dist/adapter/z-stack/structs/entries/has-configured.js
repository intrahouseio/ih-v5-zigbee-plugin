"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasConfigured = void 0;
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
const struct_1 = require("../struct");
/**
 * Creates a zigbee-herdsman `hasConfigured` struct.
 *
 * @param data Data to initialize structure with.
 */
const hasConfigured = (data) => struct_1.Struct.new()
    .member("uint8", "hasConfigured")
    .method("isConfigured", Boolean.prototype, struct => struct.hasConfigured === 0x55)
    .build(data);
exports.hasConfigured = hasConfigured;
//# sourceMappingURL=has-configured.js.map