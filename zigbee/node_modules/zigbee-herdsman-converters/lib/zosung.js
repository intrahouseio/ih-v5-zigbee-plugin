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
Object.defineProperty(exports, "__esModule", { value: true });
exports.presetsZosung = exports.tzZosung = exports.fzZosung = void 0;
const exposes = __importStar(require("./exposes"));
const globalStore = __importStar(require("./store"));
const ea = exposes.access;
const e = exposes.presets;
function nextSeq(entity) {
    return (globalStore.getValue(entity, 'seq', -1) + 1) % 0x10000;
}
function messagesGet(entity, seq) {
    const info = globalStore.getValue(entity, 'irMessageInfo');
    const expected = (info && info.seq) || 0;
    if (expected !== seq) {
        throw new Error(`Unexpected sequence value (expected: ${expected} current: ${seq}).`);
    }
    return info.data;
}
function messagesSet(entity, seq, data) {
    globalStore.putValue(entity, 'irMessageInfo', { seq: seq, data: data });
}
function messagesClear(entity, seq) {
    const info = globalStore.getValue(entity, 'irMessageInfo');
    const expected = (info && info.seq) || 0;
    if (expected !== seq) {
        throw new Error(`Unexpected sequence value (expected: ${expected} current: ${seq}).`);
    }
    globalStore.clearValue(entity, 'irMessageInfo');
}
function calcArrayCrc(values) {
    return Array.from(values.values()).reduce((a, b) => a + b, 0) % 0x100;
}
function calcStringCrc(str) {
    return str.split('').map((x) => x.charCodeAt(0)).reduce((a, b) => a + b, 0) % 0x100;
}
exports.fzZosung = {
    zosung_send_ir_code_01: {
        cluster: 'zosungIRTransmit',
        type: ['commandZosungSendIRCode01'],
        convert: (model, msg, publish, options, meta) => {
            meta.logger.debug(`"IR-Message-Code01" received (msg:${JSON.stringify(msg.data)})`);
            const seq = msg.data.seq;
            const irMsg = messagesGet(msg.endpoint, seq);
            meta.logger.debug(`IRCode to send: ${JSON.stringify(irMsg)} (seq:${seq})`);
        },
    },
    zosung_send_ir_code_02: {
        cluster: 'zosungIRTransmit',
        type: ['commandZosungSendIRCode02'],
        convert: async (model, msg, publish, options, meta) => {
            meta.logger.debug(`"IR-Message-Code02" received (msg:${JSON.stringify(msg.data)})`);
            const seq = msg.data.seq;
            const position = msg.data.position;
            const irMsg = messagesGet(msg.endpoint, seq);
            const part = irMsg.substring(position, position + 0x32);
            const sum = calcStringCrc(part);
            await msg.endpoint.command('zosungIRTransmit', 'zosungSendIRCode03', {
                zero: 0,
                seq: seq,
                position: position,
                msgpart: Buffer.from(part),
                msgpartcrc: sum,
            }, { disableDefaultResponse: true });
            meta.logger.debug(`Sent IRCode part: ${part} (sum: ${sum}, seq:${seq})`);
        },
    },
    zosung_send_ir_code_04: {
        cluster: 'zosungIRTransmit',
        type: ['commandZosungSendIRCode04'],
        convert: async (model, msg, publish, options, meta) => {
            meta.logger.debug(`"IR-Message-Code04" received (msg:${JSON.stringify(msg.data)})`);
            const seq = msg.data.seq;
            await msg.endpoint.command('zosungIRTransmit', 'zosungSendIRCode05', {
                seq: seq,
                zero: 0,
            }, { disableDefaultResponse: true });
            messagesClear(msg.endpoint, seq);
            meta.logger.debug(`IRCode has been successfully sent. (seq:${seq})`);
        },
    },
    zosung_send_ir_code_00: {
        cluster: 'zosungIRTransmit',
        type: ['commandZosungSendIRCode00'],
        convert: async (model, msg, publish, options, meta) => {
            meta.logger.debug(`"IR-Message-Code00" received (msg:${JSON.stringify(msg.data)})`);
            const seq = msg.data.seq;
            const length = msg.data.length;
            messagesSet(msg.endpoint, seq, { position: 0, buf: Buffer.alloc(length) });
            await msg.endpoint.command('zosungIRTransmit', 'zosungSendIRCode01', {
                zero: 0,
                seq: seq,
                length: length,
                unk1: msg.data.unk1,
                unk2: msg.data.unk2,
                unk3: msg.data.unk3,
                cmd: msg.data.cmd,
                unk4: msg.data.unk4,
            }, { disableDefaultResponse: true });
            meta.logger.debug(`"IR-Message-Code00" response sent.`);
            await msg.endpoint.command('zosungIRTransmit', 'zosungSendIRCode02', {
                seq: msg.data.seq,
                position: 0,
                maxlen: 0x38,
            }, { disableDefaultResponse: true });
            meta.logger.debug(`"IR-Message-Code00" transfer started.`);
        },
    },
    zosung_send_ir_code_03: {
        cluster: 'zosungIRTransmit',
        type: ['zosungSendIRCode03Resp'],
        convert: async (model, msg, publish, options, meta) => {
            meta.logger.debug(`"IR-Message-Code03" received (msg:${JSON.stringify(msg.data)})`);
            const seq = msg.data.seq;
            const rcv = messagesGet(msg.endpoint, seq);
            if (rcv.position == msg.data.position) {
                const rcvMsgPart = msg.data.msgpart;
                const sum = calcArrayCrc(rcvMsgPart);
                const expectedPartCrc = msg.data.msgpartcrc;
                if (sum == expectedPartCrc) {
                    const position = rcvMsgPart.copy(rcv.buf, rcv.position);
                    rcv.position += position;
                    if (rcv.position < rcv.buf.length) {
                        await msg.endpoint.command('zosungIRTransmit', 'zosungSendIRCode02', {
                            seq: seq,
                            position: rcv.position,
                            maxlen: 0x38,
                        }, { disableDefaultResponse: true });
                    }
                    else {
                        await msg.endpoint.command('zosungIRTransmit', 'zosungSendIRCode04', {
                            zero0: 0,
                            seq: seq,
                            zero1: 0,
                        }, { disableDefaultResponse: true });
                    }
                    meta.logger.debug(`${rcvMsgPart.length} bytes received.`);
                }
                else {
                    meta.logger.error(`Invalid msg part CRC: ${sum} expecting: ${expectedPartCrc}.`);
                }
            }
            else {
                meta.logger.error(`Unexpected IR code position: ${JSON.stringify(msg.data)}, expecting: ${rcv.position}.`);
            }
        },
    },
    zosung_send_ir_code_05: {
        cluster: 'zosungIRTransmit',
        type: ['zosungSendIRCode05Resp'],
        convert: async (model, msg, publish, options, meta) => {
            meta.logger.debug(`"IR-Message-Code05" received (msg:${JSON.stringify(msg.data)})`);
            const seq = msg.data.seq;
            const rcv = messagesGet(msg.endpoint, seq);
            const learnedIRCode = rcv.buf.toString('base64');
            meta.logger.debug(`Received: ${learnedIRCode}`);
            messagesClear(msg.endpoint, seq);
            await msg.endpoint.command('zosungIRControl', 'zosungControlIRCommand00', {
                data: Buffer.from(JSON.stringify({ 'study': 1 })),
            }, { disableDefaultResponse: true });
            return {
                learned_ir_code: learnedIRCode,
            };
        },
    },
};
exports.tzZosung = {
    zosung_ir_code_to_send: {
        key: ['ir_code_to_send'],
        convertSet: async (entity, key, value, meta) => {
            if (!value) {
                meta.logger.error(`There is no IR code to send`);
                return;
            }
            const irMsg = JSON.stringify({
                'key_num': 1,
                'delay': 300,
                'key1': {
                    'num': 1,
                    'freq': 38000,
                    'type': 1,
                    'key_code': value,
                },
            });
            meta.logger.debug(`Sending IR code: ${JSON.stringify(value)}`);
            const seq = nextSeq(entity);
            messagesSet(entity, seq, irMsg);
            await entity.command('zosungIRTransmit', 'zosungSendIRCode00', {
                seq: seq,
                length: irMsg.length,
                unk1: 0x00000000,
                unk2: 0xe004,
                unk3: 0x01,
                cmd: 0x02,
                unk4: 0x0000,
            }, { disableDefaultResponse: true });
            meta.logger.debug(`Sending IR code initiated.`);
        },
    },
    zosung_learn_ir_code: {
        key: ['learn_ir_code'],
        convertSet: async (entity, key, value, meta) => {
            meta.logger.debug(`Starting IR Code Learning...`);
            await entity.command('zosungIRControl', 'zosungControlIRCommand00', {
                data: Buffer.from(JSON.stringify({ 'study': 0 })),
            }, { disableDefaultResponse: true });
            meta.logger.debug(`IR Code Learning started.`);
        },
    },
};
exports.presetsZosung = {
    learn_ir_code: () => e.switch_().withState('learn_ir_code', false, 'Turn on to learn new IR code', ea.SET),
    learned_ir_code: () => e.text('learned_ir_code', ea.STATE).withDescription('The IR code learned by device'),
    ir_code_to_send: () => e.text('ir_code_to_send', ea.SET).withDescription('The IR code to send by device'),
};
exports.fzZosung = exports.fzZosung;
exports.tzZosung = exports.tzZosung;
exports.presetsZosung = exports.presetsZosung;
//# sourceMappingURL=zosung.js.map