"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addressManagerTable = void 0;
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
const address_manager_entry_1 = require("./address-manager-entry");
const table_1 = require("../table");
/**
 * Creates an address manager inline table present within Z-Stack NV memory.
 *
 * @param data Data to initialize table with.
 * @param alignment Memory alignment of initialization data.
 */
const addressManagerTable = (dataOrCapacity, alignment = "unaligned") => {
    const table = table_1.Table.new()
        .struct(address_manager_entry_1.addressManagerEntry)
        .occupancy(e => e.isSet());
    return typeof dataOrCapacity === "number" ?
        table.build(dataOrCapacity) :
        table.build(dataOrCapacity, alignment);
};
exports.addressManagerTable = addressManagerTable;
//# sourceMappingURL=address-manager-table.js.map