/// <reference types="node" />
import { Buffalo, TsType as BuffaloTsType, TsType } from '../../../buffalo';
import { Options, Value } from "../../../buffalo/tstype";
export interface BuffaloZiGateOptions extends BuffaloTsType.Options {
    startIndex?: number;
}
declare class BuffaloZiGate extends Buffalo {
    write(type: string, value: Value, options: Options): void;
    static addressBufferToStringBE(buffer: Buffer): string;
    read(type: string, options: BuffaloZiGateOptions): TsType.Value;
    writeIeeeAddr(value: string): void;
    readIeeeAddr(): string;
    readUInt16BE(): number;
    readUInt32BE(): number;
    writeUInt16BE(value: number): void;
    writeUInt32BE(value: number): void;
}
export default BuffaloZiGate;
//# sourceMappingURL=buffaloZiGate.d.ts.map