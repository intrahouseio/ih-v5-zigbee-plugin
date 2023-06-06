"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESERVED = exports.RANDOMIZE_SEQ = exports.RANDOMIZE_START = exports.STUFF = exports.SUBSTITUTE = exports.XOFF = exports.XON = exports.CANCEL = exports.ESCAPE = exports.FLAG = void 0;
exports.FLAG = 0x7E; // Marks end of frame
exports.ESCAPE = 0x7D; // Indicates that the following byte is escaped
exports.CANCEL = 0x1A; // Terminates a frame in progress
exports.XON = 0x11; // Resume transmission
exports.XOFF = 0x13; // Stop transmission
exports.SUBSTITUTE = 0x18; // Replaces a byte received with a low-level communication error
exports.STUFF = 0x20;
exports.RANDOMIZE_START = 0x42;
exports.RANDOMIZE_SEQ = 0xB8;
exports.RESERVED = [exports.FLAG, exports.ESCAPE, exports.XON, exports.XOFF, exports.SUBSTITUTE, exports.CANCEL];
//# sourceMappingURL=consts.js.map