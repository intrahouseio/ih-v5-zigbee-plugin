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
exports.SerialDriver = void 0;
/* istanbul ignore file */
const events_1 = require("events");
const net_1 = __importDefault(require("net"));
const serialPort_1 = require("../../serialPort");
const socketPortUtils_1 = __importDefault(require("../../socketPortUtils"));
const utils_1 = require("./utils");
const utils_2 = require("../../../utils");
const consts = __importStar(require("./consts"));
const writer_1 = require("./writer");
const parser_1 = require("./parser");
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('zigbee-herdsman:adapter:ezsp:uart');
var NcpResetCode;
(function (NcpResetCode) {
    NcpResetCode[NcpResetCode["RESET_UNKNOWN_REASON"] = 0] = "RESET_UNKNOWN_REASON";
    NcpResetCode[NcpResetCode["RESET_EXTERNAL"] = 1] = "RESET_EXTERNAL";
    NcpResetCode[NcpResetCode["RESET_POWER_ON"] = 2] = "RESET_POWER_ON";
    NcpResetCode[NcpResetCode["RESET_WATCHDOG"] = 3] = "RESET_WATCHDOG";
    NcpResetCode[NcpResetCode["RESET_ASSERT"] = 6] = "RESET_ASSERT";
    NcpResetCode[NcpResetCode["RESET_BOOTLOADER"] = 9] = "RESET_BOOTLOADER";
    NcpResetCode[NcpResetCode["RESET_SOFTWARE"] = 11] = "RESET_SOFTWARE";
    NcpResetCode[NcpResetCode["ERROR_EXCEEDED_MAXIMUM_ACK_TIMEOUT_COUNT"] = 81] = "ERROR_EXCEEDED_MAXIMUM_ACK_TIMEOUT_COUNT";
    NcpResetCode[NcpResetCode["ERROR_UNKNOWN_EM3XX_ERROR"] = 128] = "ERROR_UNKNOWN_EM3XX_ERROR";
})(NcpResetCode || (NcpResetCode = {}));
class SerialDriver extends events_1.EventEmitter {
    constructor() {
        super();
        this.sendSeq = 0; // next frame number to send
        this.recvSeq = 0; // next frame number to receive
        this.ackSeq = 0; // next number after the last accepted frame
        this.initialized = false;
        this.queue = new utils_2.Queue(1);
        this.waitress = new utils_2.Waitress(this.waitressValidator, this.waitressTimeoutFormatter);
    }
    async connect(path, options) {
        this.portType = socketPortUtils_1.default.isTcpPath(path) ? 'socket' : 'serial';
        if (this.portType === 'serial') {
            await this.openSerialPort(path, options);
        }
        else {
            await this.openSocketPort(path);
        }
    }
    async openSerialPort(path, opt) {
        const options = {
            path,
            baudRate: typeof opt.baudRate === 'number' ? opt.baudRate : 115200,
            rtscts: typeof opt.rtscts === 'boolean' ? opt.rtscts : false,
            autoOpen: false
        };
        debug(`Opening SerialPort with ${JSON.stringify(options)}`);
        this.serialPort = new serialPort_1.SerialPort(options);
        this.writer = new writer_1.Writer();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.writer.pipe(this.serialPort);
        this.parser = new parser_1.Parser();
        this.serialPort.pipe(this.parser);
        this.parser.on('parsed', this.onParsed.bind(this));
        return new Promise((resolve, reject) => {
            this.serialPort.open(async (error) => {
                if (error) {
                    this.initialized = false;
                    if (this.serialPort.isOpen) {
                        this.serialPort.close();
                    }
                    reject(new Error(`Error while opening serialport '${error}'`));
                }
                else {
                    debug('Serialport opened');
                    this.serialPort.once('close', this.onPortClose.bind(this));
                    this.serialPort.once('error', (error) => {
                        debug(`Serialport error: ${error}`);
                    });
                    // reset
                    await this.reset();
                    this.initialized = true;
                    this.emit('connected');
                    resolve();
                }
            });
        });
    }
    async openSocketPort(path) {
        const info = socketPortUtils_1.default.parseTcpPath(path);
        debug(`Opening TCP socket with ${info.host}:${info.port}`);
        this.socketPort = new net_1.default.Socket();
        this.socketPort.setNoDelay(true);
        this.socketPort.setKeepAlive(true, 15000);
        this.writer = new writer_1.Writer();
        this.writer.pipe(this.socketPort);
        this.parser = new parser_1.Parser();
        this.socketPort.pipe(this.parser);
        this.parser.on('parsed', this.onParsed.bind(this));
        return new Promise((resolve, reject) => {
            this.socketPort.on('connect', function () {
                debug('Socket connected');
            });
            // eslint-disable-next-line
            const self = this;
            this.socketPort.on('ready', async () => {
                debug('Socket ready');
                // reset
                await this.reset();
                self.initialized = true;
                this.emit('connected');
                resolve();
            });
            this.socketPort.once('close', this.onPortClose.bind(this));
            this.socketPort.on('error', function () {
                debug('Socket error');
                self.initialized = false;
                reject(new Error(`Error while opening socket`));
            });
            this.socketPort.connect(info.port, info.host);
        });
    }
    onParsed(data) {
        // check CRC
        const crc = (0, utils_1.crc16ccitt)(data.subarray(0, -3), 65535);
        const crcArr = Buffer.from([(crc >> 8), (crc % 256)]);
        if (!data.subarray(-3, -1).equals(crcArr)) {
            // CRC error
            debug(`<-- CRC error: ${data.toString('hex')}|` +
                `${data.subarray(-3, -1).toString('hex')}|` +
                `${crcArr.toString('hex')}`);
            // send NAK
            this.writer.sendNAK(this.recvSeq);
            // skip handler
            return;
        }
        try {
            /* Frame receive handler */
            switch (true) {
                case ((data[0] & 0x80) === 0):
                    debug(`<-- DATA (${(data[0] & 0x70) >> 4},` +
                        `${data[0] & 0x07},${(data[0] & 0x08) >> 3}): ${data.toString('hex')}`);
                    this.handleDATA(data);
                    break;
                case ((data[0] & 0xE0) === 0x80):
                    debug(`<-- ACK  (${data[0] & 0x07}): ${data.toString('hex')}`);
                    this.handleACK(data[0]);
                    break;
                case ((data[0] & 0xE0) === 0xA0):
                    debug(`<-- NAK  (${data[0] & 0x07}): ${data.toString('hex')}`);
                    this.handleNAK(data[0]);
                    break;
                case (data[0] === 0xC0):
                    debug(`<-- RST:  ${data.toString('hex')}`);
                    break;
                case (data[0] === 0xC1):
                    debug(`<-- RSTACK: ${data.toString('hex')}`);
                    this.rstack_frame_received(data);
                    break;
                case (data[0] === 0xC2):
                    debug(`<-- Error: ${data.toString('hex')}`);
                    // send reset
                    this.reset();
                    break;
                default:
                    debug("UNKNOWN FRAME RECEIVED: %r", data);
            }
        }
        catch (error) {
            debug(`Error while parsing to ZpiObject '${error.stack}'`);
        }
    }
    handleDATA(data) {
        /* Data frame receive handler */
        const frmNum = (data[0] & 0x70) >> 4;
        const reTx = (data[0] & 0x08) >> 3;
        this.recvSeq = (frmNum + 1) & 7; // next
        debug(`--> ACK  (${this.recvSeq})`);
        this.writer.sendACK(this.recvSeq);
        const handled = this.handleACK(data[0]);
        if (reTx && !handled) {
            // if the package is resent and did not expect it, 
            // then will skip it - already processed it earlier
            debug(`Skipping the packet as repeated (${this.recvSeq})`);
            return;
        }
        data = data.subarray(1, -3);
        const frame = this.randomize(data);
        this.emit('received', frame);
    }
    handleACK(control) {
        /* Handle an acknowledgement frame */
        // next number after the last accepted frame
        this.ackSeq = control & 0x07;
        const handled = this.waitress.resolve({ sequence: this.ackSeq });
        if (!handled && this.sendSeq !== this.ackSeq) {
            debug(`Unexpected packet sequence ${this.ackSeq} | ${this.sendSeq}`);
        }
        return handled;
    }
    handleNAK(control) {
        /* Handle negative acknowledgment frame */
        const nakNum = control & 0x07;
        const handled = this.waitress.reject({ sequence: nakNum }, 'Recv NAK frame');
        if (!handled) {
            // send NAK
            debug(`NAK Unexpected packet sequence ${nakNum}`);
        }
        else {
            debug(`NAK Expected packet sequence ${nakNum}`);
        }
    }
    rstack_frame_received(data) {
        /* Reset acknowledgement frame receive handler */
        let code;
        this.sendSeq = 0;
        this.recvSeq = 0;
        try {
            code = NcpResetCode[data[2]];
        }
        catch (e) {
            code = NcpResetCode.ERROR_UNKNOWN_EM3XX_ERROR;
        }
        debug("RSTACK Version: %d Reason: %s frame: %s", data[1], code.toString(), data.toString('hex'));
        if (NcpResetCode[code].toString() !== NcpResetCode.RESET_SOFTWARE.toString()) {
            return;
        }
        this.waitress.resolve({ sequence: -1 });
    }
    randomize(s) {
        /*XOR s with a pseudo-random sequence for transmission
        Used only in data frames
        */
        let rand = consts.RANDOMIZE_START;
        const out = Buffer.alloc(s.length);
        let outIdx = 0;
        for (const c of s) {
            out.writeUInt8(c ^ rand, outIdx++);
            if ((rand % 2)) {
                rand = ((rand >> 1) ^ consts.RANDOMIZE_SEQ);
            }
            else {
                rand = (rand >> 1);
            }
        }
        return out;
    }
    async reset() {
        debug('Uart reseting');
        this.parser.reset();
        this.queue.clear();
        return this.queue.execute(async () => {
            debug(`--> Write reset`);
            const waiter = this.waitFor(-1, 10000).start();
            this.writer.sendReset();
            debug(`-?- waiting reset`);
            return waiter.promise.catch(async (e) => {
                debug(`--> Error: ${e}`);
                this.emit('reset');
                throw new Error(`Reset error: ${e}`);
            }).then(() => {
                debug(`-+- waiting reset success`);
            });
        });
    }
    close() {
        return new Promise((resolve, reject) => {
            this.queue.clear();
            if (this.initialized) {
                if (this.portType === 'serial') {
                    this.serialPort.flush(() => {
                        this.serialPort.close((error) => {
                            this.initialized = false;
                            this.emit('close');
                            error == null ?
                                resolve() :
                                reject(new Error(`Error while closing serialport '${error}'`));
                        });
                    });
                }
                else {
                    this.socketPort.destroy();
                    resolve();
                }
            }
            else {
                this.emit('close');
                resolve();
            }
        });
    }
    onPortClose() {
        debug('Port closed');
        this.initialized = false;
        this.emit('close');
    }
    isInitialized() {
        return this.initialized;
    }
    async sendDATA(data) {
        const seq = this.sendSeq;
        this.sendSeq = ((seq + 1) % 8); // next
        const nextSeq = this.sendSeq;
        const ackSeq = this.recvSeq;
        return this.queue.execute(async () => {
            debug(`--> DATA (${seq},${ackSeq},0): ${data.toString('hex')}`);
            const randData = this.randomize(data);
            const waiter = this.waitFor(nextSeq).start();
            this.writer.sendData(randData, seq, 0, ackSeq);
            debug(`-?- waiting (${nextSeq})`);
            return waiter.promise.catch(async (e) => {
                debug(`--> Error: ${e}`);
                debug(`-!- break waiting (${nextSeq})`);
                debug(`Can't send DATA frame (${seq},${ackSeq},0): ${data.toString('hex')}`);
                await (0, utils_2.Wait)(500);
                debug(`->> DATA (${seq},${ackSeq},1): ${data.toString('hex')}`);
                const waiter = this.waitFor(nextSeq).start();
                this.writer.sendData(randData, seq, 1, ackSeq);
                debug(`-?- rewaiting (${nextSeq})`);
                return waiter.promise.catch(async (e) => {
                    debug(`--> Error: ${e}`);
                    debug(`-!- break rewaiting (${nextSeq})`);
                    debug(`Can't resend DATA frame (${seq},${ackSeq},1): ${data.toString('hex')}`);
                    this.emit('reset');
                    throw new Error(`sendDATA error: ${e}`);
                }).then(() => {
                    debug(`-+- rewaiting (${nextSeq}) success`);
                });
            }).then(() => {
                debug(`-+- waiting (${nextSeq}) success`);
            });
        });
    }
    waitFor(sequence, timeout = 2000) {
        return this.waitress.waitFor({ sequence }, timeout);
    }
    waitressTimeoutFormatter(matcher, timeout) {
        return `${JSON.stringify(matcher)} after ${timeout}ms`;
    }
    waitressValidator(payload, matcher) {
        return (payload.sequence === matcher.sequence);
    }
}
exports.SerialDriver = SerialDriver;
//# sourceMappingURL=uart.js.map