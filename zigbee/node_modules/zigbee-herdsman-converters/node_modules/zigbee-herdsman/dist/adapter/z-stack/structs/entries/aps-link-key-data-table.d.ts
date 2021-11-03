/// <reference types="node" />
import { Table } from "../table";
import { StructMemoryAlignment } from "../struct";
/**
 * Creates an APS link key data table.
 *
 * @param data Data to initialize table with.
 * @param alignment Memory alignment of initialization data.
 */
export declare const apsLinkKeyDataTable: (dataOrCapacity?: Buffer | Buffer[] | number, alignment?: StructMemoryAlignment) => import("../table").BuiltTable<import("../struct").BuiltStruct<import("../struct").Struct & Record<"key", Buffer> & Record<"txFrmCntr", number> & Record<"rxFrmCntr", number>>, Table<import("../struct").BuiltStruct<import("../struct").Struct & Record<"key", Buffer> & Record<"txFrmCntr", number> & Record<"rxFrmCntr", number>>>>;
//# sourceMappingURL=aps-link-key-data-table.d.ts.map