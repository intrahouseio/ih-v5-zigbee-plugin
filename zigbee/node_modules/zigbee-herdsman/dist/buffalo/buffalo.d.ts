/// <reference types="node" />
import { Options, Value } from './tstype';
declare class Buffalo {
    protected position: number;
    protected buffer: Buffer;
    constructor(buffer: Buffer, position?: number);
    getPosition(): number;
    getBuffer(): Buffer;
    getWritten(): Buffer;
    isMore(): boolean;
    writeInt8(value: number): void;
    readInt8(): number;
    writeUInt8(value: number): void;
    readUInt8(): number;
    writeUInt16(value: number): void;
    readUInt24(): number;
    writeUInt24(value: number): void;
    readInt24(): number;
    writeInt24(value: number): void;
    readUInt16(): number;
    writeInt16(value: number): void;
    readInt16(): number;
    writeUInt32(value: number): void;
    readUInt32(): number;
    writeInt32(value: number): void;
    readInt32(): number;
    writeFloatLE(value: number): void;
    readFloatLE(): number;
    writeDoubleLE(value: number): void;
    readDoubleLE(): number;
    writeIeeeAddr(value: string): void;
    readIeeeAddr(): string;
    protected readBuffer(length: number): Buffer;
    protected writeBuffer(values: Buffer | number[], length: number): void;
    writeListUInt8(values: number[]): void;
    readListUInt8(options: Options): number[];
    writeListUInt16(values: number[]): void;
    readListUInt16(options: Options): number[];
    writeListUInt24(values: number[]): void;
    readListUInt24(options: Options): number[];
    writeListUInt32(values: number[]): void;
    readListUInt32(options: Options): number[];
    readUtf8String(length: number): string;
    writeUtf8String(value: string): void;
    write(type: string, value: Value, options: Options): void;
    read(type: string, options: Options): Value;
}
export default Buffalo;
//# sourceMappingURL=buffalo.d.ts.map