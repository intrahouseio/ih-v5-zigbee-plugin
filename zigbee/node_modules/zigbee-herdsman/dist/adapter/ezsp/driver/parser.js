"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parser = void 0;
/* istanbul ignore file */
const stream = __importStar(require("stream"));
const consts = __importStar(require("./consts"));
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('zigbee-herdsman:adapter:ezsp:uart');
class Parser extends stream.Transform {
    constructor() {
        super();
        this.buffer = Buffer.from([]);
    }
    _transform(chunk, _, cb) {
        if (chunk.indexOf(consts.CANCEL) >= 0) {
            this.buffer = Buffer.from([]);
            chunk = chunk.subarray(chunk.lastIndexOf(consts.CANCEL) + 1);
        }
        if (chunk.indexOf(consts.SUBSTITUTE) >= 0) {
            this.buffer = Buffer.from([]);
            chunk = chunk.subarray(chunk.indexOf(consts.FLAG) + 1);
        }
        debug(`<-- [${chunk.toString('hex')}]`);
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.parseNext();
        cb();
    }
    parseNext() {
        if (this.buffer.length && this.buffer.indexOf(consts.FLAG) >= 0) {
            //debug(`<-- [${this.buffer.toString('hex')}]`);
            try {
                const frame = this.extractFrame();
                if (frame) {
                    this.emit('parsed', frame);
                }
            }
            catch (error) {
                debug(`<-- error ${error.stack}`);
            }
            this.parseNext();
        }
    }
    extractFrame() {
        /* Extract a frame from the data buffer */
        const place = this.buffer.indexOf(consts.FLAG);
        if (place >= 0) {
            const result = this.unstuff(this.buffer.subarray(0, place + 1));
            this.buffer = this.buffer.subarray(place + 1);
            return result;
        }
        else {
            return null;
        }
    }
    unstuff(s) {
        /* Unstuff (unescape) a string after receipt */
        let escaped = false;
        const out = Buffer.alloc(s.length);
        let outIdx = 0;
        for (let idx = 0; idx < s.length; idx += 1) {
            const c = s[idx];
            if (escaped) {
                out.writeUInt8(c ^ consts.STUFF, outIdx++);
                escaped = false;
            }
            else {
                if (c === consts.ESCAPE) {
                    escaped = true;
                }
                else if (c === consts.XOFF || c === consts.XON) {
                    // skip
                }
                else {
                    out.writeUInt8(c, outIdx++);
                }
            }
        }
        return out.subarray(0, outIdx);
    }
    reset() {
        // clear buffer
        this.buffer = Buffer.from([]);
    }
}
exports.Parser = Parser;
//# sourceMappingURL=parser.js.map